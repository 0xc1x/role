import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import {
  paginatedDataFromQuery,
  type BusinessDto,
  type BusinessEmailSendDto,
  type BusinessLocationDto,
  type BusinessNotificationPreferencesDto,
  type CreateBusinessDto,
  type CreateBusinessLocationDto,
  type ListBusinessesQuery,
  type ListBusinessLocationsQuery,
  type OnboardingBusinessRequest,
  type OnboardingBusinessResponse,
  type PaginatedData,
  type UpdateBusinessDto,
  type UpdateBusinessLocationDto,
  type UpdateBusinessNotificationPreferencesDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { AppConfigRepository } from '../app-config/app-config.repository';
import { UserDefaultsService } from '../users/user-defaults.service';
import {
  resolveBusinessSupportEmail,
  resolveOutboundFrom,
} from '../app-config/outbound-addresses';
import {
  BusinessesRepository,
  type BusinessRow,
  type BusinessUpdate,
  type BusinessLocationUpdate,
  type BusinessNotificationPreferencesPatch,
} from './businesses.repository';
import { BusinessMapper } from './businesses.mapper';
import { renderBusinessConfirmationEmail } from './businesses-confirmation-email';

const PLATFORM_CONTROLLED_BUSINESS_FIELDS = [
  'commission_rate',
  'is_active',
  'verification_status',
  'rejection_reason',
] as const;

@Injectable()
export class BusinessesService {
  private readonly logger = new Logger(BusinessesService.name);
  private supabaseAdmin;
  private readonly resend: Resend | null;

  constructor(
    private readonly businessesRepository: BusinessesRepository,
    private readonly config: ConfigService<Env, true>,
    private readonly appConfigRepo: AppConfigRepository,
    private readonly userDefaults: UserDefaultsService,
  ) {
    this.supabaseAdmin = createClient(
      config.get('SUPABASE_URL', { infer: true }),
      config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async list(
    user: AuthUser,
    query: ListBusinessesQuery,
  ): Promise<PaginatedData<BusinessDto>> {
    if (user.role === 'admin') {
      return this.listAll(query);
    }

    const { items, total } = await this.businessesRepository.listForUser(
      user.id,
      query,
    );
    return paginatedDataFromQuery(
      items.map((row) => BusinessMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  private async listAll(
    query: ListBusinessesQuery,
  ): Promise<PaginatedData<BusinessDto>> {
    const { items, total } = await this.businessesRepository.listAll(query);
    return paginatedDataFromQuery(
      items.map((row) => BusinessMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * Public business onboarding (landing): creates the auth user, its default
   * rows (profile, preferences, consents — the idempotent mirror of the
   * Supabase trigger chain) and one pending business row. Compensates the auth
   * user only when the business write fails.
   */
  async onboard(
    body: OnboardingBusinessRequest,
  ): Promise<OnboardingBusinessResponse> {
    const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: false,
      user_metadata: { full_name: body.full_name, role: 'business' },
    });
    if (error || !data.user) {
      if (error?.message?.includes('already')) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to create user',
      );
    }
    const user = data.user;

    try {
      const slug = await this.generateUniqueSlug(body.business_name);
      await this.businessesRepository.transaction(async (tx) => {
        await this.businessesRepository.insert(tx, {
          owner_id: user.id,
          name: body.business_name,
          type: 'restaurant',
          slug,
          phone: body.phone ?? null,
          email: body.email,
          is_active: false,
          verification_status: 'pending',
        });
      });
    } catch (err) {
      const { error: deleteError } =
        await this.supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        this.logger.error({
          event: 'business_onboarding_compensation_failed',
          ...safeErrorFields(deleteError),
        });
      }
      throw err;
    }

    // After the business write on purpose: if that write failed, the auth user
    // was just deleted above and seeding defaults for it would leave rows
    // behind for an account that does not exist. Best-effort for the same
    // reason the confirmation email is: the account exists, so a database blip
    // must not fail the request. AuthService.login repairs a profile-less
    // account on the owner's first sign-in.
    try {
      await this.userDefaults.seed({
        id: user.id,
        email: body.email,
        fullName: body.full_name,
        requestedRole: 'business',
      });
    } catch (err) {
      this.logger.error({
        event: 'user_defaults_seeding_failed',
        flow: 'business_onboarding',
        userId: user.id,
        ...safeErrorFields(err),
      });
    }

    await this.sendConfirmationEmail(body, user.id);

    return {
      message:
        'Solicitud recibida. Tu negocio quedó en revisión y te avisaremos por correo.',
    };
  }

  /**
   * Sends the account confirmation link for a freshly onboarded business owner.
   *
   * `auth.admin.createUser()` never sends mail, so the API generates the link
   * with `auth.admin.generateLink({ type: 'signup' })` and delivers it through
   * Resend (same wiring as CampaignsService/ContactService — not the marketing
   * queue, which has its own rate limits and retry semantics).
   *
   * Best-effort by design: the auth user and the business row already exist at
   * this point, so a failed send must NOT fail the request. Throwing would turn
   * a transient email outage into a permanently locked-out business — the owner
   * retries, hits "Email is already registered", and never gets the link.
   */
  private async sendConfirmationEmail(
    body: OnboardingBusinessRequest,
    userId: string,
  ): Promise<void> {
    if (!this.resend) {
      // Sin API key (dev/tests): se omite el envío y el onboarding continúa.
      this.logger.debug({ event: 'business_confirmation_email_skipped' });
      return;
    }

    try {
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: body.email,
        password: body.password,
        options: {
          redirectTo: this.config.get('AUTH_REDIRECT_TO', { infer: true }),
        },
      });
      const actionLink = data?.properties?.action_link;
      if (error || !actionLink) {
        throw new Error(
          error?.message ?? 'generateLink returned no action_link',
        );
      }

      const email = renderBusinessConfirmationEmail({
        ownerName: body.full_name,
        businessName: body.business_name,
        confirmationUrl: actionLink,
        supportEmail: await resolveBusinessSupportEmail(this.appConfigRepo),
      });
      const { error: sendError } = await this.resend.emails.send({
        from: await resolveOutboundFrom(this.appConfigRepo, this.config),
        to: body.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (sendError) {
        // Resend devuelve el texto del fallo Y un código de máquina en `name`
        // (`validation_error`, `invalid_from_address`, `restricted_api_key`…).
        // Solo el código se propaga: cabe en la huella acotada de
        // `safeErrorFields` como `errorType` y es lo accionable ("dominio no
        // verificado" → `invalid_from_address`), mientras que el texto puede
        // traer la API key o el destinatario. El mensaje se conserva en la
        // cadena de `Error` para el stack, nunca para el log.
        const failure = new Error(sendError.message);
        if (typeof sendError.name === 'string' && sendError.name.length > 0) {
          failure.name = sendError.name;
        }
        throw failure;
      }

      this.logger.log({
        event: 'business_confirmation_email_sent',
        userId,
        email: body.email,
        businessName: body.business_name,
      });
    } catch (err) {
      // Deliberately swallowed: the account exists and the business is queued.
      // Lo que hace falta para triage es el código del proveedor y el
      // `userId`, y ambos viajan; el texto crudo de Resend no, porque
      // `docs/operations.md` prohíbe registrar mensajes crudos y esa línea ya
      // publica la dirección del destinatario.
      this.logger.error({
        event: 'business_confirmation_email_failed',
        userId,
        email: body.email,
        businessName: body.business_name,
        onboarding: 'completed_without_confirmation_email',
        ...safeErrorFields(err),
      });
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'negocio';
    for (let i = 0; i < 5; i++) {
      const slug = `${base}-${Math.floor(Math.random() * 10000)}`;
      const existing = await this.businessesRepository.findBySlug(slug);
      if (!existing) return slug;
    }
    throw new InternalServerErrorException('Could not generate business slug');
  }

  async getById(user: AuthUser, id: string): Promise<BusinessDto> {
    const row = await this.businessesRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    await this.assertCanView(user, row);
    return BusinessMapper.toDto(row);
  }

  async create(user: AuthUser, body: CreateBusinessDto): Promise<BusinessDto> {
    if (user.role !== 'admin') {
      this.assertNoPlatformFieldMutation(user, body);
      body.owner_id = user.id;
    }

    const existing = await this.businessesRepository.findBySlug(body.slug);
    if (existing) {
      throw new BadRequestException('Slug already exists');
    }

    const created = await this.businessesRepository.transaction(async (tx) => {
      return this.businessesRepository.insert(tx, {
        owner_id: body.owner_id!,
        name: body.name,
        type: body.type ?? 'restaurant',
        slug: body.slug,
        image: body.image ?? null,
        cover_image: body.cover_image ?? null,
        description: body.description ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        website: body.website ?? null,
        commission_rate:
          user.role === 'admin'
            ? (body.commission_rate ?? 0.1).toString()
            : '0.1',
        is_active: user.role === 'admin' ? (body.is_active ?? false) : false,
        verification_status:
          user.role === 'admin'
            ? (body.verification_status ?? 'pending')
            : 'pending',
        rejection_reason:
          user.role === 'admin' ? (body.rejection_reason ?? null) : null,
      });
    });

    // No email hook belongs here. Approval and rejection notices are already
    // emitted by the `notify_business_verification` AFTER trigger on
    // `public.businesses`, which inserts a `transactional` row into `email_sends`
    // using the `business-approved` / `business-rejected` templates. The
    // `email-expedition` BullMQ worker delivers them. Do not add a second path:
    // a business created already-approved fires the trigger on INSERT, because
    // OLD.verification_status is NULL and the guard only skips a real no-op.
    //
    // Delivery, not enqueue, is the part that breaks: the resolved sender
    // (`resolveOutboundFrom`) must be an address on a Resend-verified domain.
    // With Resend's shared test address
    // (`onboarding@resend.dev`) every send is rejected with "You can only send
    // testing emails to your own email address", which is why 11/11
    // transactional sends were `failed` with 5 attempts each and none `sent`.

    return BusinessMapper.toDto(created);
  }

  async update(
    user: AuthUser,
    id: string,
    body: UpdateBusinessDto,
  ): Promise<BusinessDto> {
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    await this.assertCanMutate(user, existing);
    this.assertNoPlatformFieldMutation(user, body);

    if (body.slug && body.slug !== existing.slug) {
      const slugExists = await this.businessesRepository.findBySlug(body.slug);
      if (slugExists) {
        throw new BadRequestException('Slug already exists');
      }
    }

    const updated = await this.businessesRepository.transaction(async (tx) => {
      const patch: BusinessUpdate = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.type !== undefined) patch.type = body.type;
      if (body.slug !== undefined) patch.slug = body.slug;
      if (body.image !== undefined) patch.image = body.image;
      if (body.cover_image !== undefined) patch.cover_image = body.cover_image;
      if (body.description !== undefined) patch.description = body.description;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.email !== undefined) patch.email = body.email;
      if (body.website !== undefined) patch.website = body.website;
      if (body.commission_rate !== undefined && body.commission_rate !== null) {
        if (await this.businessesRepository.hasPendingPayout(id)) {
          throw new ConflictException(
            'No se puede cambiar la comisión: el negocio tiene pagos pendientes de procesar',
          );
        }
        patch.commission_rate = body.commission_rate.toString();
      }
      if (body.is_active !== undefined) patch.is_active = body.is_active;
      if (body.verification_status !== undefined) {
        if (user.role !== 'admin') {
          throw new ForbiddenException('Solo admin puede verificar negocios');
        }
        patch.verification_status = body.verification_status;
        patch.verified_at = new Date();
        patch.verified_by = user.id;
        if (body.verification_status === 'approved') {
          patch.is_active = true;
          patch.rejection_reason = null;
        } else if (body.verification_status === 'rejected') {
          patch.is_active = false;
          patch.rejection_reason = body.rejection_reason ?? null;
        } else if (body.verification_status === 'pending') {
          patch.is_active = false;
        }
      } else if (body.rejection_reason !== undefined && user.role === 'admin') {
        patch.rejection_reason = body.rejection_reason;
      }

      const row = await this.businessesRepository.update(tx, id, patch);
      if (!row) {
        throw new NotFoundException(`Business ${id} not found`);
      }
      return row;
    });

    return BusinessMapper.toDto(updated);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admin can deactivate businesses');
    }
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    await this.assertCanMutate(user, existing);

    await this.businessesRepository.transaction(async (tx) => {
      await this.businessesRepository.update(tx, id, { is_active: false });
    });
  }

  /**
   * Entregas de correo transaccional de un negocio (read-only).
   *
   * Admin-only a propósito: la fila de `email_sends` es la única evidencia de
   * si el aviso de aprobación/rechazo salió. Ojo con su `error_message`: NO es
   * el motivo accionable del rechazo — es una huella de diagnóstico acotada
   * (`errorType` o `errorType:errorCode`, vía `safeErrorSummary`) porque el
   * mensaje crudo de Resend puede traer la API key o el email del
   * destinatario, y esta columna se renderiza en el admin. Para el motivo real
   * están los logs estructurados: el evento `email_send_failed` de
   * `CampaignsService` lleva el `sendId` de la fila y el código de máquina del
   * proveedor — no un texto legible, sino el código con el que Resend documenta
   * el fallo. Sin comprobación de existencia del negocio: la lista vacía ya
   * dice que no hubo avisos.
   */
  async listEmailSends(
    user: AuthUser,
    id: string,
  ): Promise<BusinessEmailSendDto[]> {
    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Only admin can read business email deliveries',
      );
    }
    const rows = await this.businessesRepository.listEmailSends(id);
    return rows.map((row) => BusinessMapper.toEmailSendDto(row));
  }

  async listLocations(
    user: AuthUser,
    businessId: string,
    query: ListBusinessLocationsQuery,
  ): Promise<PaginatedData<BusinessLocationDto>> {
    await this.assertCanViewBusiness(user, businessId);

    const { items, total } =
      await this.businessesRepository.listLocationsForBusiness(
        businessId,
        query,
      );
    return paginatedDataFromQuery(
      items.map((row) => BusinessMapper.toLocationDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getLocation(
    user: AuthUser,
    businessId: string,
    locationId: string,
  ): Promise<BusinessLocationDto> {
    await this.assertCanViewBusiness(user, businessId);

    const row = await this.businessesRepository.findLocationById(locationId);
    if (!row || row.business_id !== businessId) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }
    return BusinessMapper.toLocationDto(row);
  }

  async createLocation(
    user: AuthUser,
    businessId: string,
    body: CreateBusinessLocationDto,
  ): Promise<BusinessLocationDto> {
    await this.assertCanMutateBusiness(user, businessId);

    const created = await this.businessesRepository.transaction(async (tx) => {
      return this.businessesRepository.insertLocation(tx, {
        business_id: businessId,
        name: body.name,
        address: body.address,
        phone: body.phone ?? null,
        latitude: body.latitude.toString(),
        longitude: body.longitude.toString(),
        is_active: body.is_active ?? true,
        zone: body.zone ?? null,
        is_headquarter: body.is_headquarter ?? false,
      });
    });

    return BusinessMapper.toLocationDto(created);
  }

  async updateLocation(
    user: AuthUser,
    businessId: string,
    locationId: string,
    body: UpdateBusinessLocationDto,
  ): Promise<BusinessLocationDto> {
    await this.assertCanMutateBusiness(user, businessId);

    const existing =
      await this.businessesRepository.findLocationById(locationId);
    if (!existing || existing.business_id !== businessId) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }

    const updated = await this.businessesRepository.transaction(async (tx) => {
      const patch: BusinessLocationUpdate = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.address !== undefined) patch.address = body.address;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.latitude !== undefined)
        patch.latitude = body.latitude.toString();
      if (body.longitude !== undefined)
        patch.longitude = body.longitude.toString();
      if (body.is_active !== undefined) patch.is_active = body.is_active;
      if (body.zone !== undefined) patch.zone = body.zone;
      if (body.is_headquarter !== undefined)
        patch.is_headquarter = body.is_headquarter;

      const row = await this.businessesRepository.updateLocation(
        tx,
        locationId,
        patch,
      );
      if (!row) {
        throw new NotFoundException(`Location ${locationId} not found`);
      }
      return row;
    });

    return BusinessMapper.toLocationDto(updated);
  }

  async removeLocation(
    user: AuthUser,
    businessId: string,
    locationId: string,
  ): Promise<void> {
    await this.assertCanMutateBusiness(user, businessId);

    const existing =
      await this.businessesRepository.findLocationById(locationId);
    if (!existing || existing.business_id !== businessId) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }

    await this.businessesRepository.transaction(async (tx) => {
      await this.businessesRepository.updateLocation(tx, locationId, {
        is_active: false,
      });
    });
  }

  /**
   * `GET /businesses/:businessId/notification-preferences` — the merchant's own
   * notification switches.
   *
   * THE BUSINESS-SIDE COUNTERPART OF `GET /me/notification-preferences`, and the
   * pairing is the point: `consumer_notification_preferences` is already served
   * for the person, this is the same feature for the merchant, one row per
   * owner. It is a DIFFERENT table and a different route, and it is not a second
   * consumer route for the consumer table.
   *
   * `assertCanViewBusiness` is the same gate `GET /businesses/:id` uses, and it
   * is not decorative: the API connects as the table's owner and is exempt from
   * `business_notification_preferences`' own RLS policies, so the path id is
   * unchecked until this line.
   *
   * A MISSING ROW IS `null`, and the read never creates one. The row is seeded
   * by `trg_create_business_notification_preferences` (AFTER INSERT on
   * `businesses`) and mirrored by `BusinessesRepository.create`, so a business
   * made through this API always has one; a business that somehow does not is a
   * state to report, not to paper over on a GET. The PATCH is where the row can
   * come into existence, and it is an upsert for exactly that reason.
   */
  async getNotificationPreferences(
    user: AuthUser,
    businessId: string,
  ): Promise<BusinessNotificationPreferencesDto | null> {
    await this.assertCanViewBusiness(user, businessId);
    const row =
      await this.businessesRepository.findNotificationPreferences(businessId);
    return row ? BusinessMapper.toNotificationPreferencesDto(row) : null;
  }

  /**
   * `PATCH /businesses/:businessId/notification-preferences`.
   *
   * `assertCanMutateBusiness` is the gate, and it runs BEFORE the merge read
   * below — so an unowned business id is refused without the repository ever
   * seeing it, rather than being resolved to "no row, here are the defaults".
   *
   * `updated_at` IS WRITTEN BY THE REPOSITORY, because no trigger maintains it.
   * That is not a stylistic choice: with nothing in the database moving the
   * column, it would read as the business's creation time forever, and the
   * panel's "last changed" line would be a lie with a timestamp on it. See
   * `BusinessesRepository.upsertNotificationPreferences`.
   *
   * THE QUIET-HOURS PAIRING IS CHECKED AGAINST THE MERGED STATE, for the same
   * reason and with the same rule as `MeService.updateNotificationPreferences`:
   * a half-configured window is stored in a shape that means nothing. The check
   * is here rather than in the request schema because a PATCH may legitimately
   * move one end of a window that is already set on the other, and a schema
   * cannot see the row. Note that no dispatch path reads the BUSINESS quiet
   * hours yet — `NotificationsRepository.filterNotInQuietHours` reads only the
   * consumer table — so this is a contract-level guarantee rather than a fix for
   * a live bug, and it is here so the first filter that does read these columns
   * cannot inherit a row that looks configured and is not.
   */
  async updateNotificationPreferences(
    user: AuthUser,
    businessId: string,
    body: UpdateBusinessNotificationPreferencesDto,
  ): Promise<BusinessNotificationPreferencesDto> {
    await this.assertCanMutateBusiness(user, businessId);

    const existing =
      await this.businessesRepository.findNotificationPreferences(businessId);

    // `in`, not `??`: an explicit `null` CLEARS a column and must not fall
    // through to the stored value. An absent key is absent.
    const from =
      'quiet_hours_from' in body
        ? body.quiet_hours_from
        : (existing?.quiet_hours_from ?? null);
    const to =
      'quiet_hours_to' in body
        ? body.quiet_hours_to
        : (existing?.quiet_hours_to ?? null);

    if ((from === null) !== (to === null)) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message:
          'quiet_hours_from and quiet_hours_to must both be set or both be null: ' +
          'a half-configured window is treated as no window at all.',
      });
    }

    const patch: BusinessNotificationPreferencesPatch = {};
    if (body.push_enabled !== undefined) patch.push_enabled = body.push_enabled;
    if (body.email_enabled !== undefined)
      patch.email_enabled = body.email_enabled;
    if (body.sms_enabled !== undefined) patch.sms_enabled = body.sms_enabled;
    if (body.whatsapp_enabled !== undefined)
      patch.whatsapp_enabled = body.whatsapp_enabled;
    if (body.new_orders_enabled !== undefined)
      patch.new_orders_enabled = body.new_orders_enabled;
    if (body.pickup_ready_enabled !== undefined)
      patch.pickup_ready_enabled = body.pickup_ready_enabled;
    if (body.reviews_enabled !== undefined)
      patch.reviews_enabled = body.reviews_enabled;
    if (body.low_stock_enabled !== undefined)
      patch.low_stock_enabled = body.low_stock_enabled;
    if (body.daily_summary_enabled !== undefined)
      patch.daily_summary_enabled = body.daily_summary_enabled;
    if ('quiet_hours_from' in body)
      patch.quiet_hours_from = body.quiet_hours_from ?? null;
    if ('quiet_hours_to' in body)
      patch.quiet_hours_to = body.quiet_hours_to ?? null;

    const row = await this.businessesRepository.upsertNotificationPreferences(
      businessId,
      patch,
    );
    if (!row) {
      throw new NotFoundException('Business not found');
    }
    return BusinessMapper.toNotificationPreferencesDto(row);
  }

  private async assertCanView(
    user: AuthUser,
    business: BusinessRow,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      business.id,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only view businesses you own');
    }
  }

  /**
   * THE ownership gate for a business in a path, and the one every per-business
   * surface in this module goes through.
   *
   * Public rather than private because there is a second service in this module
   * that must not be able to answer "is this caller allowed to read this
   * business's aggregates" any other way: `BusinessOwnerStatsService` computes
   * revenue out of `orders`, and the temptation there is to treat the business
   * id in the path as an identity rather than as a claim. Reusing this method
   * is what keeps a fourth copy of the predicate from appearing — and the
   * predicate has already been copied twice in this codebase
   * (`OrdersRepository.isBusinessOwner`, `OffersRepository.isBusinessOwner`),
   * which is how "is this my business?" ends up answered three slightly
   * different ways.
   *
   * Admin passes on role alone, exactly as it does for every other business
   * route here; for anyone else the answer is the `business_ownership` row.
   */
  async assertCanViewBusiness(
    user: AuthUser,
    businessId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      businessId,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only access businesses you own');
    }
  }

  private assertNoPlatformFieldMutation(
    user: AuthUser,
    body: Partial<
      Record<(typeof PLATFORM_CONTROLLED_BUSINESS_FIELDS)[number], unknown>
    >,
  ): void {
    if (user.role === 'admin') return;
    if (
      PLATFORM_CONTROLLED_BUSINESS_FIELDS.some(
        (field) => body[field] !== undefined,
      )
    ) {
      throw new ForbiddenException(
        'Only admin can change platform-controlled business fields',
      );
    }
  }

  private async assertCanMutate(
    user: AuthUser,
    business: BusinessRow,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      business.id,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only manage businesses you own');
    }
  }

  private async assertCanMutateBusiness(
    user: AuthUser,
    businessId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      businessId,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only manage businesses you own');
    }
  }
}
