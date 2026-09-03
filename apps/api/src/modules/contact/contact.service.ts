import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { CreateContactDto } from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import { AppConfigRepository } from '../app-config/app-config.repository';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import { RendererService } from '../email-marketing/renderer.service';
import { AppStoreRepository } from '../store/app-store.repository';

const FALLBACK_CITIES = ['Quito', 'Guayaquil', 'Cuenca', 'Manta', 'Otra'];

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly resend: Resend | null;

  constructor(
    private readonly appConfigRepo: AppConfigRepository,
    private readonly emailRepo: EmailMarketingRepository,
    private readonly renderer: RendererService,
    private readonly storeRepo: AppStoreRepository,
    private readonly config: ConfigService<Env, true>,
  ) {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async handle(dto: CreateContactDto, ip?: string) {
    // 1. validar ciudad contra app_config.contact.cities
    const cities = await this.resolveCities();
    if (!cities.includes(dto.city)) {
      throw new BadRequestException(`Ciudad no habilitada. Opciones: ${cities.join(', ')}`);
    }
    const effectiveCity = dto.city === 'Otra' ? dto.city_other!.trim() : dto.city;

    // 2. resolver destinos y remitente desde app_config
    const to = await this.resolveTo(dto.role);
    const from = await this.resolveFrom();

    // 3. insertar en app_store con PENDIENTE
    const entry = await this.storeRepo.insert({
      namespace: 'contact',
      value: {
        name: dto.name ?? '',
        email: dto.email,
        role: dto.role,
        city: effectiveCity,
        city_raw: dto.city,
        city_other: dto.city_other ?? null,
        message: dto.message ?? null,
        at: new Date().toISOString(),
        ip: ip ?? null,
        to,
        from,
      },
      status: 'PENDIENTE',
    });

    // 4. renderizar plantilla marketing (o fallback inline si no existe)
    const rendered = await this.renderContactEmail({
      nombre: dto.name?.trim() || '',
      email: dto.email,
      ciudad: effectiveCity,
      rol: dto.role,
    });

    // 5. enviar email — no bloqueante: si Resend falla (ej. role.ec no verificado) se encola y el contacto queda PENDIENTE para reintento
    try {
      await this.deliver(to, rendered.subject, rendered.html, dto.email, from);
      await this.storeRepo.updateStatus(entry.id, 'PROCESADO');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Contacto ${entry.id} encolado (email falló, no bloquea): ${message}`);
      // Encolar en email_sends robusto (type/source + template_id) para reintento — BD fuente de verdad
      try {
        const tmpl = await this.findContactTemplate();
        if (tmpl) {
          const now = new Date();
          await this.emailRepo.insertSends([
            {
              type: 'transactional' as const,
              source_type: 'contact',
              source_id: entry.id,
              template_id: tmpl.id,
              email: to,
              status: 'pending' as const,
              scheduled_at: now,
              queued_at: now,
              attempts: 0,
              max_attempts: 5,
              error_message: message.slice(0, 500),
              variables_used: { nombre: dto.name, email: dto.email, rol: dto.role, ciudad: effectiveCity } as unknown as never,
            },
          ]);
        }
      } catch (enqueueErr) {
        this.logger.warn(
          `Contacto ${entry.id}: falló el encolado del reintento: ${enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr)}`,
        );
      }
      await this.storeRepo.updateStatus(entry.id, 'PENDIENTE', { error: message.slice(0, 500) });
      // No throw — el lead no se pierde aunque el correo falle
    }

    return { ok: true as const, id: entry.id };
  }

  private async resolveCities(): Promise<string[]> {
    const row = await this.appConfigRepo.findByKey('contact.cities');
    if (row?.value && Array.isArray(row.value) && row.value.every((v) => typeof v === 'string')) {
      return row.value as string[];
    }
    return FALLBACK_CITIES;
  }

  private async resolveTo(role: string): Promise<string> {
    const key = role === 'negocio' ? 'contact.negocios_email' : 'contact.hola_email';
    const row = await this.appConfigRepo.findByKey(key);
    if (row?.value && typeof row.value === 'string' && row.value.includes('@')) {
      return row.value as string;
    }
    // fallback por rol
    return role === 'negocio' ? 'negocios@role.ec' : 'hola@role.ec';
  }

  private async resolveFrom(): Promise<string> {
    const row = await this.appConfigRepo.findByKey('email.from');
    if (row?.value && typeof row.value === 'string' && (row.value as string).includes('@')) {
      const v = row.value as string;
      return v.includes('<') ? v : `Rolé <${v}>`;
    }
    const envFrom = this.config.get('EMAIL_FROM', { infer: true });
    if (envFrom && envFrom.includes('@')) return envFrom;
    return 'Rolé <notificaciones@role.ec>';
  }

  private async renderContactEmail(vars: Record<string, string | undefined>): Promise<{ subject: string; html: string }> {
    const safeVars = {
      nombre: vars.nombre ?? '',
      email: vars.email ?? '',
      ciudad: vars.ciudad ?? '',
      rol: vars.rol ?? '',
    };
    const template = await this.findContactTemplate();
    if (!template) {
      // fallback inline si no hay plantilla seed
      return {
        subject: `Nuevo contacto Rolé — ${safeVars.rol} — ${safeVars.ciudad}`,
        html: `<div style="font-family:sans-serif;color:#12241a;line-height:1.6"><h2>Nuevo lead desde la landing</h2><ul><li><b>Nombre:</b> ${this.escape(safeVars.nombre) || '—'}</li><li><b>Email:</b> ${this.escape(safeVars.email)}</li><li><b>Rol:</b> ${this.escape(safeVars.rol)}</li><li><b>Ciudad:</b> ${this.escape(safeVars.ciudad)}</li></ul><p>Responder a ${this.escape(safeVars.email)}.</p></div>`,
      };
    }

    const [header, footer] = await Promise.all([
      template.header_id ? this.emailRepo.findComponentById(template.header_id) : Promise.resolve(null),
      template.footer_id ? this.emailRepo.findComponentById(template.footer_id) : Promise.resolve(null),
    ]);

    const subject = this.renderer.renderVariables(template.subject, safeVars);
    const html = this.renderer.assemble({
      headerHtml: header?.html_content ?? null,
      bodyHtml: template.body_html,
      footerHtml: footer?.html_content ?? null,
      vars: safeVars,
    });
    return { subject, html };
  }

  private async findContactTemplate() {
    // buscar por nombre (seed: contacto-notificacion)
    const { rows } = await this.emailRepo.listTemplates({ page: 1, limit: 10, search: 'contacto-notificacion' });
    const found = (rows as unknown as { name: string }[]).find((r) => r.name === 'contacto-notificacion');
    if (found) {
      const id = (found as unknown as { id: string }).id;
      return this.emailRepo.findTemplateById(id);
    }
    return null;
  }

  private async deliver(to: string, subject: string, html: string, replyTo: string, from: string): Promise<string | null> {
    if (!this.resend) {
      this.logger.log(`[contact mock] to=${to} from=${from} subject=${subject}`);
      return `dev_${Date.now()}`;
    }
    const { data, error } = await this.resend.emails.send({
      from,
      to,
      replyTo,
      subject,
      html,
    });
    if (error) throw new Error(error.message);
    return data?.id ?? null;
  }

  private escape(v: string): string {
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
