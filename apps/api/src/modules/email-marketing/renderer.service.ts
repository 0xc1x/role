import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import juice from 'juice';
import type { Env } from '../../config/env.schema';

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ensambla header + body + footer, sustituye {{vars}} y inlinea CSS. */
@Injectable()
export class RendererService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Token HMAC de desuscripción: `<user_id>.<hmac>` (stateless, sin tabla). */
  unsubscribeToken(userId: string): string {
    const secret = this.config.get('UNSUBSCRIBE_SECRET', { infer: true });
    const signature = createHmac('sha256', secret)
      .update(userId)
      .digest('base64url');
    return `${userId}.${signature}`;
  }

  verifyUnsubscribeToken(userId: string, token: string): boolean {
    return this.unsubscribeToken(userId) === `${userId}.${token}`;
  }

  unsubscribeUrl(userId: string): string {
    const base = this.config.get('UNSUBSCRIBE_URL_BASE', { infer: true });
    return `${base}?t=${this.unsubscribeToken(userId)}`;
  }

  /**
   * Sustituye variables con escape HTML salvo claves `*_url`.
   * Sin motor de plantillas: las vars no tienen lógica.
   */
  renderVariables(html: string, vars: Record<string, string>): string {
    return html.replace(VAR_RE, (_, key: string) => {
      const value = vars[key];
      if (value === undefined) return '';
      return key.endsWith('_url') ? value : escapeHtml(value);
    });
  }

  /** Ensamblado completo + inlining de CSS para clientes de email estrictos. */
  assemble(parts: {
    headerHtml?: string | null;
    bodyHtml: string;
    footerHtml?: string | null;
    vars?: Record<string, string>;
  }): string {
    const raw = `${parts.headerHtml ?? ''}\n${parts.bodyHtml}\n${parts.footerHtml ?? ''}`;
    const withVars = this.renderVariables(raw, parts.vars ?? {});
    // ponytail: si juice se vuelve innecesario (plantillas ya con estilos
    // inline), quitar la dependencia y devolver withVars tal cual.
    return juice(withVars);
  }
}
