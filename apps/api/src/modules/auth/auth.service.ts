import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';
import type { Env } from '../../config/env.schema';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { profiles } from '../../database/schema';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import {
  UserDefaultsService,
  type SeedUserDefaultsInput,
} from '../users/user-defaults.service';
import { AuthAccountRepository } from './auth-account.repository';
import type {
  ChangeEmailRequest,
  ChangeEmailResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  RegisterRequest,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '@0xc1x/role-commons';

/** Columns of the session user that the login response is built from. */
type SessionProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'business' | 'admin';
};

/**
 * `email_templates.name` of the two auth transactional sends. Seeded by
 * `supabase/migrations/20260927160000_auth_email_sync_and_templates.sql`.
 *
 * Named as constants, not inlined, because the template lookup is BY NAME: a
 * typo is a send that queues against a template that does not exist, and the
 * code that would notice is the cron tick, minutes later.
 */
const RECOVERY_TEMPLATE = 'auth-password-recovery';
const EMAIL_CHANGE_TEMPLATE = 'auth-email-change-confirmation';

/**
 * The ONE body `forgot-password` ever returns.
 *
 * A single frozen object returned from both branches, so "identical response for
 * a known and an unknown address" is a property of the control flow below rather
 * than of two string literals somebody has to keep in sync.
 */
const FORGOT_PASSWORD_RESPONSE: ForgotPasswordResponse = {
  message:
    'If that address matches an account, a password recovery link is on its way.',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabaseAnon;
  private supabaseAdmin;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly userDefaults: UserDefaultsService,
    private readonly emailRepo: EmailMarketingRepository,
    private readonly accounts: AuthAccountRepository,
    private readonly tokenVerifier: SupabaseTokenVerifier,
  ) {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    const anonKey = this.config.get('SUPABASE_ANON_KEY', { infer: true });
    const serviceRoleKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', {
      infer: true,
    });

    this.supabaseAnon = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async login(body: LoginRequest) {
    const { data, error } = await this.supabaseAnon.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      if (error.status === 400) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw new InternalServerErrorException(error.message);
    }

    const user = data.user;
    const session = data.session;

    const profile = await this.resolveProfile(user);

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      user: profile
        ? {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            role: profile.role,
          }
        : {
            id: user.id,
            email: user.email,
            full_name: null,
            avatar_url: null,
            role: 'user' as const,
          },
    };
  }

  async register(body: RegisterRequest) {
    const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      // Verificación por email: sin confirmar no hay sesión. El API siembra los
      // defaults del usuario (perfil, preferencias y consents) justo después,
      // espejo idempotente de los triggers de Supabase (ADR-0008 fase 1.5).
      email_confirm: false,
      user_metadata: { full_name: body.full_name },
    });

    if (error) {
      if (error.message?.includes('already')) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException(error.message);
    }

    // Best-effort, and deliberately NOT compensated: the auth user already
    // exists and its confirmation email may be on its way, so a transient
    // database error must not turn into a 500 that invites the caller to
    // register again (or, worse, a deleted account). The account is repaired
    // on its first successful login by `resolveProfile`.
    await this.seedUserDefaults(
      { id: data.user.id, email: body.email, fullName: body.full_name },
      'register',
    );

    return {
      id: data.user.id,
      email: data.user.email,
      message: 'Account created. Please confirm your email and sign in.',
    };
  }

  async refresh(body: RefreshRequest) {
    const { data, error } = await this.supabaseAnon.auth.refreshSession({
      refresh_token: body.refresh_token,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = data.session;
    const user = data.user;

    const profile = await this.findProfile(user.id);

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      user: profile
        ? {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            role: profile.role,
          }
        : {
            id: user.id,
            email: user.email ?? '',
            full_name: null,
            avatar_url: null,
            role: 'user' as const,
          },
    };
  }

  async logout(body: LogoutRequest): Promise<{ message: string }> {
    // Revocación real: intercambia el refresh por un access y pide a GoTrue
    // cerrar esa sesión (scope local). Un refresh ya revocado o expirado no
    // es un error de logout (idempotente).
    if (body.refresh_token) {
      const { data, error } = await this.supabaseAnon.auth.refreshSession({
        refresh_token: body.refresh_token,
      });

      if (!error && data.session) {
        const { error: signOutError } =
          await this.supabaseAdmin.auth.admin.signOut(
            data.session.access_token,
            'local',
          );
        if (signOutError) {
          throw new InternalServerErrorException(signOutError.message);
        }
      }
    }

    return { message: 'Logged out successfully' };
  }

  // ─── Recuperación de contraseña, cambio de email y baja de cuenta ────────

  /**
   * `POST /auth/forgot-password` — enqueue a recovery link, answer the same
   * thing either way.
   *
   * WHY THE RESPONSE CANNOT DEPEND ON WHETHER THE ACCOUNT EXISTS: this route is
   * `@Public()`, so it is the most attractive thing in the system to probe. A
   * different status, a different body, or a different latency for "that
   * address has an account" turns it into an account-enumeration oracle for
   * every address on the internet — which is exactly what an attacker needs to
   * build a credential-stuffing list or to target a specific person with a
   * "reset your Rolé password" phishing mail they are expecting.
   *
   * So both branches return the same frozen 200 body, and the difference is
   * recorded in the log where an operator — not a stranger — can see it.
   *
   * TIMING, HONESTLY: this narrows the side channel, it does not close it. Both
   * branches run the SAME two round trips in the same order (template lookup,
   * then `generateLink`), so the only residual delta is one INSERT into
   * `email_sends` plus the token hashing GoTrue does for a user that exists. The
   * template lookup is deliberately placed BEFORE the branch so it cannot itself
   * become the signal; equalising the last millisecond would mean doing the work
   * for a user that does not exist, and a per-address cooldown (the other half of
   * the answer) is a follow-up, not something to fake here. See the throttle on
   * the controller for the per-IP half.
   */
  async forgotPassword(
    body: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    // Both branches, same cost. See the note above on why this is first.
    const template = await this.findTemplate(RECOVERY_TEMPLATE);

    let link: string | null = null;
    let userId: string | null = null;
    try {
      const { data, error } = await this.supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: body.email,
        // The redirect is server-side configuration, never a body field: a
        // caller-chosen redirect on an unauthenticated endpoint is a phishing
        // primitive.
        options: {
          redirectTo: this.config.get('AUTH_REDIRECT_TO', { infer: true }),
        },
      });
      const actionLink = data?.properties?.action_link;
      // GoTrue answers 404 for an address it does not hold, and the same error
      // for a mailer that is down. Both are "no link", and both are answered the
      // same way — collapsing them is the point.
      if (error || !actionLink) {
        this.logger.log({
          event: 'password_recovery_skipped',
          reason: 'no_link_generated',
          ...safeErrorFields(error),
        });
      } else {
        link = actionLink;
        userId = data.user.id;
      }
    } catch (err) {
      this.logger.warn({
        event: 'password_recovery_skipped',
        reason: 'link_generation_failed',
        ...safeErrorFields(err),
      });
    }

    if (link === null || userId === null) {
      return FORGOT_PASSWORD_RESPONSE;
    }

    if (!template) {
      // The migration has not been applied. A 200 that sends nothing is still
      // the right answer for the caller — and the log is how an operator finds
      // out the flow is degraded instead of silently dead.
      this.logger.error({
        event: 'password_recovery_template_missing',
        template: RECOVERY_TEMPLATE,
        userId,
      });
      return FORGOT_PASSWORD_RESPONSE;
    }

    // Neither the address nor the link is logged: the link IS a bearer
    // credential and the address is the PII this flow exists to protect.
    this.logger.log({ event: 'password_recovery_enqueued', userId });

    // `email_sends` is the queue, not a Resend call from the handler: same
    // pattern as the contact retry (`ContactService.handle`). The cron tick
    // drains it with retry and the sender resolved from `app_config['email.from']`.
    const now = new Date();
    await this.emailRepo.insertSends([
      {
        type: 'transactional' as const,
        source_type: 'auth',
        source_id: userId,
        template_id: template.id,
        user_id: userId,
        email: body.email,
        status: 'pending' as const,
        scheduled_at: now,
        queued_at: now,
        attempts: 0,
        max_attempts: 5,
        // No `nombre`. Reading the profile here would put a database query on an
        // unauthenticated path for a value the mail does not need, and it would
        // be the one field of account data in a document an anonymous request
        // can trigger. The recovery copy greets nobody and says only what the
        // person asked for.
        variables_used: { recovery_url: link },
      },
    ]);

    return FORGOT_PASSWORD_RESPONSE;
  }

  /**
   * `POST /auth/reset-password` — set a new password from a recovery token, and
   * revoke every session the account had.
   *
   * THE TOKEN IS VERIFIED, NOT TRUSTED. It arrives in a body from an
   * unauthenticated request, which makes it attacker-controlled input until
   * proven otherwise, so it goes through the same `jose` verification (and the
   * same issuer/audience/expiry rules) as the bearer token on every protected
   * route — one verifier, two callers, on purpose.
   *
   * REVOCATION SCOPE: `'global'`. The three scopes are `'local'` (this session
   * only — what `logout` uses, correct there and wrong here), `'others'` (every
   * session EXCEPT the one presenting the token — which here is the recovery
   * session, so the credential that just changed the password would be the one
   * credential left alive), and `'global'` (every session, including this one).
   * A password change that leaves a session standing is not a password change:
   * the entire point is that whoever prompted the reset loses access, and
   * `'global'` is the only scope that guarantees it.
   *
   * REVOKE FIRST, THEN SET THE PASSWORD. The security property is "no session
   * outlives this operation", and ordering it this way is what makes the
   * property hold even when the second step fails: the sessions are already gone
   * if `updateUserById` errors. The cost is that a failed reset costs the user
   * their recovery session and they start the flow again — recoverable, because
   * the OLD password still works. The reverse order has the worse failure: the
   * password is changed, the revocation failed, and a retry hits GoTrue's
   * "new password must differ from the old" and never reaches the revoke at all.
   */
  async resetPassword(
    body: ResetPasswordRequest,
  ): Promise<ResetPasswordResponse> {
    const { sub } = await this.tokenVerifier.verify(body.access_token);

    const { error: signOutError } = await this.supabaseAdmin.auth.admin.signOut(
      body.access_token,
      'global',
    );
    if (signOutError) {
      // A fixed message: GoTrue's own text can quote the address, and this is
      // the flow where that text is most likely to be quoted back somewhere.
      this.logger.error({
        event: 'password_reset_sessions_revoked_failed',
        userId: sub,
        ...safeErrorFields(signOutError),
      });
      throw new InternalServerErrorException(
        'Could not revoke the existing sessions for this account',
      );
    }

    const { error } = await this.supabaseAdmin.auth.admin.updateUserById(sub, {
      password: body.password,
    });
    if (error) {
      this.logger.error({
        event: 'password_reset_update_failed',
        userId: sub,
        ...safeErrorFields(error),
      });
      // 422 from GoTrue is a policy refusal (the new password equals the old
      // one, or violates the project's own policy) and the caller can act on it;
      // anything else is ours. Neither branch quotes the provider's message, and
      // neither ever touches the password itself.
      if (error.status === 422) {
        throw new UnprocessableEntityException({
          error: 'Unprocessable Entity',
          message:
            'The new password was rejected by the authentication provider. ' +
            'It must differ from the current password and satisfy the same policy as registration.',
        });
      }
      throw new InternalServerErrorException('Could not update the password');
    }

    this.logger.log({ event: 'password_reset_completed', userId: sub });
    return { message: 'Your password has been updated.' };
  }

  /**
   * `POST /auth/change-email` — the path `PATCH /me` used to point away from.
   *
   * THIS INITIATES, IT DOES NOT APPLY. `updateUserById` with an `email` hands
   * the change to GoTrue, which sends the confirmation to the new address and
   * does not touch the identity until that confirmation lands. The database
   * trigger `sync_profile_email_on_auth_user_change` (AFTER UPDATE OF email on
   * `auth.users`) copies the result into `profiles.email` when it does, which is
   * why this method writes NO column of its own: writing `profiles.email` here
   * would put the two stores back into disagreement, which is the exact failure
   * the refusal in `MeService.assertEmailNotChanged` existed to prevent.
   *
   * Hence 202, not 200 — the resource is not in the requested state yet, and
   * returning 200 would be the same lie that refusal was built to stop.
   *
   * The notice goes to the CURRENT address. The confirmation of the new one is
   * GoTrue's to send; this one is ours, and its value is that an account whose
   * session was stolen finds out from the real owner. That is also why a failure
   * to enqueue it does not fail the request: the change is already initiated and
   * GoTrue's own mail is on its way, so failing here would tell the caller
   * nothing useful and hide a working change.
   */
  async changeEmail(
    user: AuthUser,
    body: ChangeEmailRequest,
  ): Promise<ChangeEmailResponse> {
    const current = await this.findProfile(user.id);
    if (!current) {
      throw new NotFoundException('Profile not found');
    }

    const requested = body.new_email.toLowerCase();
    if (requested === current.email.toLowerCase()) {
      throw new UnprocessableEntityException({
        error: 'Unprocessable Entity',
        message: 'new_email is already the address of this account.',
      });
    }

    const { error } = await this.supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        email: body.new_email,
      },
    );
    if (error) {
      this.logger.error({
        event: 'email_change_initiated_failed',
        userId: user.id,
        ...safeErrorFields(error),
      });
      // Same heuristic `register` already uses against GoTrue's wording, rather
      // than a new one. Not an enumeration oracle: the caller is authenticated
      // and this is about their own account.
      if (error.message?.includes('already')) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException(
        'Could not start the email change for this account',
      );
    }

    this.logger.log({ event: 'email_change_initiated', userId: user.id });

    await this.enqueueEmailChangeNotice({
      userId: user.id,
      to: current.email,
      name: current.full_name,
      newEmail: body.new_email,
    });

    return {
      message:
        'We sent a confirmation link to the new address. The change applies once it is confirmed, and we notified the current address.',
      pending_email: body.new_email,
    };
  }

  /**
   * `DELETE /auth/account` — erase the identity, and anonymise the profile when
   * the platform's records depend on it.
   *
   * The fork is in `AuthAccountRepository.countRetained`, and it is not "does
   * this account have orders". It is "is there a row here that is not the
   * account's to delete": their own orders, a business they own, a review that
   * is part of a business's public rating. All three reference `profiles` and
   * CASCADE from it in Supabase, and the second one would take a stranger's
   * purchase down with it.
   *
   * 204 in both cases, and the branch is not named in the log. The caller is
   * authenticated, so this is not the enumeration problem `forgot-password` has —
   * the requirement here is that "this account had orders" does not leave this
   * service's logs and reach an audience broader than the account owner. The
   * operational cost is real and deliberate: an operator debugging a deletion
   * cannot tell from the log which branch ran. The fix for that is an audited
   * write with its own access control, not a field in an application log.
   */
  async deleteAccount(user: AuthUser): Promise<void> {
    const retained = await this.accounts.countRetained(user.id);
    const mustAnonymise =
      retained.orders > 0 || retained.businesses > 0 || retained.reviews > 0;

    // `shouldSoftDelete`: the only thing the admin API offers that closes the
    // identity without removing the row the surviving records point at. It
    // obfuscates the address in `auth.users` and blocks sign-in; it is NOT
    // reversible and it still leaves a hashed identifier behind, so the profile
    // copy is scrubbed explicitly rather than assumed gone.
    const { error } = await this.supabaseAdmin.auth.admin.deleteUser(
      user.id,
      mustAnonymise,
    );
    if (error) {
      this.logger.error({
        event: 'account_deletion_failed',
        userId: user.id,
        ...safeErrorFields(error),
      });
      throw new InternalServerErrorException('Could not delete the account');
    }

    if (mustAnonymise) {
      await this.accounts.anonymise(user.id);
    } else {
      await this.accounts.eraseAccount(user.id);
    }

    this.logger.log({ event: 'account_deleted', userId: user.id });
  }

  // ─── internals ──────────────────────────────────────────────────────────

  /**
   * Template by exact name, the way `ContactService` resolves
   * `contacto-notificacion`. Returns `null` for a missing template so the
   * callers above can degrade instead of queueing a send against nothing:
   * `email_sends.template_id` is `ON DELETE SET NULL`, so a row queued without
   * one cannot be retried either.
   */
  private async findTemplate(name: string) {
    const { rows } = await this.emailRepo.listTemplates({
      page: 1,
      limit: 10,
      search: name,
    });
    const found = (rows as unknown as { id: string; name: string }[]).find(
      (r) => r.name === name,
    );
    if (!found) return null;
    return this.emailRepo.findTemplateById(found.id);
  }

  /**
   * Best-effort notice to the address an account is leaving. Swallows its own
   * failures: the email change is already initiated and GoTrue's confirmation is
   * already on its way, so a queue error here is a degraded notification and not
   * a failed request.
   */
  private async enqueueEmailChangeNotice(input: {
    userId: string;
    to: string;
    name: string | null;
    newEmail: string;
  }): Promise<void> {
    try {
      const template = await this.findTemplate(EMAIL_CHANGE_TEMPLATE);
      if (!template) {
        this.logger.error({
          event: 'email_change_notice_template_missing',
          template: EMAIL_CHANGE_TEMPLATE,
          userId: input.userId,
        });
        return;
      }
      const now = new Date();
      await this.emailRepo.insertSends([
        {
          type: 'transactional' as const,
          source_type: 'auth',
          source_id: input.userId,
          template_id: template.id,
          user_id: input.userId,
          email: input.to,
          status: 'pending' as const,
          scheduled_at: now,
          queued_at: now,
          attempts: 0,
          max_attempts: 5,
          variables_used: {
            nombre: input.name ?? '',
            new_email: input.newEmail,
          },
        },
      ]);
    } catch (err) {
      this.logger.warn({
        event: 'email_change_notice_enqueue_failed',
        userId: input.userId,
        ...safeErrorFields(err),
      });
    }
  }

  private async findProfile(
    userId: string,
  ): Promise<SessionProfile | undefined> {
    const [profile] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return profile;
  }

  /**
   * Profile of a signing-in user, repairing the account when the row is
   * missing.
   *
   * Self-healing seam for ADR-0008 phase 1.5: the profile used to be created
   * atomically inside the `auth.users` INSERT, by the trigger. Seeding it from
   * the API is a separate step, so a failure can leave an auth user with no
   * profile — and `AuthGuard` answers 401 to every protected route for an
   * account that has no profile, which is a permanent lockout.
   *
   * The repair is the alternative to deleting the auth user on failure: a
   * transient database error would destroy an account whose confirmation email
   * may already have been sent, and the caller cannot retry a registration that
   * already returned 201. Re-running the same idempotent seeding makes a
   * registration whose seeding failed indistinguishable, on the next sign-in
   * attempt, from one the trigger provisioned.
   *
   * Repair failures stay swallowed: login keeps returning its session with the
   * documented `role: 'user'` fallback instead of a 500, and the next sign-in
   * tries again.
   */
  private async resolveProfile(user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }): Promise<SessionProfile | undefined> {
    const profile = await this.findProfile(user.id);
    if (profile) return profile;

    // The metadata is read the way the trigger read it: the auth user's own
    // `raw_user_meta_data`, allowlisted inside the seeder (`admin` can never
    // land from metadata).
    const metadata = user.user_metadata ?? {};
    await this.seedUserDefaults(
      {
        id: user.id,
        // GoTrue allows an email-less (phone) user; the trigger would have hit
        // the NOT NULL on profiles.email there, and a profile row with an empty
        // email still beats an account that 401s forever.
        email: user.email ?? '',
        fullName:
          typeof metadata.full_name === 'string' ? metadata.full_name : null,
        avatarUrl:
          typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
        phone: user.phone ?? null,
        requestedRole: typeof metadata.role === 'string' ? metadata.role : null,
      },
      'login',
    );

    return this.findProfile(user.id);
  }

  /**
   * Seeds the user defaults and never throws. The auth user exists by the time
   * this runs, so the only honest reaction to a database failure is to log it:
   * the account is repaired on the next successful login.
   *
   * `docs/operations.md` bans raw error messages in logs, hence
   * `safeErrorFields` (name/type only) and no email in the payload.
   */
  private async seedUserDefaults(
    input: SeedUserDefaultsInput,
    flow: 'register' | 'login',
  ): Promise<void> {
    try {
      await this.userDefaults.seed(input);
    } catch (err) {
      this.logger.error({
        event: 'user_defaults_seeding_failed',
        flow,
        userId: input.id,
        ...safeErrorFields(err),
      });
    }
  }
}
