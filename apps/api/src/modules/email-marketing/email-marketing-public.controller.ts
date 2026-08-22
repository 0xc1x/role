import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiTags } from '@nestjs/swagger';
import type { Env } from '../../config/env.schema';
import { Public } from '../../common/decorators/public.decorator';
import { RendererService } from './renderer.service';
import { EmailMarketingRepository } from './email-marketing.repository';

/**
 * Rutas públicas del módulo: webhook de Resend y desuscripción por enlace.
 */
@ApiTags('Email Marketing (public)')
@Controller('email-marketing')
export class EmailMarketingPublicController {
  constructor(
    private readonly repository: EmailMarketingRepository,
    private readonly renderer: RendererService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Webhook de Resend → actualiza estado de email_sends.
   * ponytail: verificación svix manual (~20 líneas) en vez de dependencia.
   */
  @Public()
  @Post('webhooks/resend')
  @HttpCode(HttpStatus.OK)
  async resendWebhook(
    @Req() req: RawBodyRequest<import('express').Request>,
    @Headers('svix-id') id: string,
    @Headers('svix-timestamp') timestamp: string,
    @Headers('svix-signature') signatureHeader: string,
  ) {
    const payload = req.rawBody?.toString('utf8') ?? '';
    this.verifySignature({ id, timestamp, signatureHeader, payload });

    const event = JSON.parse(payload || '{}') as {
      type?: string;
      data?: { id?: string };
    };
    const resendId = event.data?.id;
    if (!resendId || !event.type) return { ok: true };

    await this.repository.applyResendEvent(resendId, event.type);
    return { ok: true };
  }

  /** Enlace de baja del footer: verifica token HMAC y da de baja. */
  @Public()
  @Get('unsubscribe')
  async unsubscribe(@Query('t') token: string): Promise<string> {
    if (!token) throw new BadRequestException('Token requerido');
    const separator = token.indexOf('.');
    if (separator <= 0) throw new BadRequestException('Token inválido');
    const userId = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    if (!this.renderer.verifyUnsubscribeToken(userId, signature)) {
      throw new BadRequestException('Token inválido');
    }
    await this.repository.unsubscribe(userId);
    return `
      <!doctype html>
      <html lang="es">
        <head><meta charset="utf-8"><title>Rolé</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:4rem">
          <h1>Listo</h1>
          <p>Has sido dado de baja de los emails de marketing de Rolé.</p>
        </body>
      </html>`;
  }

  /** Esquema estándar de Svix (el que usa Resend): HMAC-SHA256 base64url-ish. */
  private verifySignature(input: {
    id: string;
    timestamp: string;
    signatureHeader: string;
    payload: string;
  }): void {
    const secret = this.config.get('RESEND_WEBHOOK_SECRET', { infer: true });
    if (!secret) return; // dev sin secret: no se verifica

    if (
      !input.id ||
      !input.timestamp ||
      !input.signatureHeader
    ) {
      throw new BadRequestException('Faltan headers de firma svix');
    }
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(input.timestamp));
    if (ageSeconds > 300) throw new BadRequestException('Timestamp fuera de tolerancia');

    const secretKey = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', secretKey)
      .update(`${input.id}.${input.timestamp}.${input.payload}`)
      .digest('base64');

    const provided = input.signatureHeader
      .split(' ')
      .find((part) => part.startsWith('v1,'))
      ?.slice(3);
    if (
      !provided ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    ) {
      throw new BadRequestException('Firma inválida');
    }
  }
}
