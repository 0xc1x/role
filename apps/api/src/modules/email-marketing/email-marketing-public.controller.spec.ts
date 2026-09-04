jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));

import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { EmailMarketingPublicController } from './email-marketing-public.controller';
import { RendererService } from './renderer.service';
import { EmailMarketingRepository } from './email-marketing.repository';

const SECRET = Buffer.from('svix-test-secret').toString('base64');
const resendId = 're_123456';

/** Firma svix válida para el payload dado (id.timestamp.payload). */
function svixSign(id: string, timestamp: string, payload: string): string {
  const signature = createHmac('sha256', Buffer.from(SECRET.replace(/^whsec_/, ''), 'base64'))
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return `v1,${signature}`;
}

function webhookRequest(payload: string) {
  return { rawBody: Buffer.from(payload, 'utf8') } as never;
}

describe('EmailMarketingPublicController', () => {
  let controller: EmailMarketingPublicController;
  let repository: jest.Mocked<Pick<EmailMarketingRepository, 'applyResendEvent' | 'unsubscribe'>>;
  let renderer: { verifyUnsubscribeToken: jest.Mock };
  let config: { get: jest.Mock };
  let env: Record<string, string | undefined>;

  const sendWebhook = (input: {
    id?: string;
    timestamp?: string;
    signature?: string;
    payload?: string;
  }) => {
    const id = input.id ?? 'msg_1';
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000).toString();
    const payload = input.payload ?? JSON.stringify({ type: 'email.delivered', data: { id: resendId } });
    return controller.resendWebhook(
      webhookRequest(payload),
      input.id ?? id,
      input.timestamp ?? timestamp,
      input.signature ?? svixSign(id, timestamp, payload),
    );
  };

  beforeEach(async () => {
    env = { RESEND_WEBHOOK_SECRET: SECRET };

    const module = await Test.createTestingModule({
      controllers: [EmailMarketingPublicController],
      providers: [
        {
          provide: EmailMarketingRepository,
          useValue: { applyResendEvent: jest.fn(), unsubscribe: jest.fn() },
        },
        { provide: RendererService, useValue: { verifyUnsubscribeToken: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn((key: string) => env[key]) } },
      ],
    }).compile();

    controller = module.get(EmailMarketingPublicController);
    repository = module.get(EmailMarketingRepository);
    renderer = module.get(RendererService);
    config = module.get(ConfigService);
    jest.clearAllMocks();
  });

  describe('resendWebhook', () => {
    it('acepta una firma válida y aplica el evento', async () => {
      const out = await sendWebhook({});

      expect(out).toEqual({ ok: true });
      expect(repository.applyResendEvent).toHaveBeenCalledWith(resendId, 'email.delivered');
    });

    it('rechaza firma inválida', async () => {
      await expect(sendWebhook({ signature: 'v1,tampered' })).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.applyResendEvent).not.toHaveBeenCalled();
    });

    it('rechaza cuando faltan headers de firma', async () => {
      await expect(
        sendWebhook({ id: '', timestamp: Math.floor(Date.now() / 1000).toString() }),
      ).rejects.toThrow('Faltan headers de firma svix');
    });

    it('rechaza timestamps fuera de tolerancia (replay)', async () => {
      const stale = Math.floor(Date.now() / 1000 - 3600).toString();
      const payload = JSON.stringify({ type: 'email.delivered', data: { id: resendId } });
      await expect(
        sendWebhook({ timestamp: stale, payload }),
      ).rejects.toThrow('Timestamp fuera de tolerancia');
    });

    it('ignora eventos sin id de resend', async () => {
      const out = await sendWebhook({ payload: JSON.stringify({ type: 'email.sent' }) });

      expect(out).toEqual({ ok: true });
      expect(repository.applyResendEvent).not.toHaveBeenCalled();
    });

    it('sin secret configurado (dev) no verifica firma', async () => {
      env.RESEND_WEBHOOK_SECRET = undefined;

      await expect(sendWebhook({ signature: 'v1,cualquiera' })).resolves.toEqual({ ok: true });
      expect(repository.applyResendEvent).toHaveBeenCalledWith(resendId, 'email.delivered');
    });
  });

  describe('unsubscribe', () => {
    it('rechaza sin token', async () => {
      await expect(controller.unsubscribe('')).rejects.toThrow('Token requerido');
    });

    it('rechaza tokens sin separador userId.firma', async () => {
      await expect(controller.unsubscribe('solo-user-id')).rejects.toThrow('Token inválido');
    });

    it('rechaza firma inválida y no da de baja', async () => {
      renderer.verifyUnsubscribeToken.mockReturnValue(false);

      await expect(controller.unsubscribe('u-1.mala-firma')).rejects.toThrow('Token inválido');
      expect(repository.unsubscribe).not.toHaveBeenCalled();
    });

    it('verifica el token HMAC y da de baja', async () => {
      renderer.verifyUnsubscribeToken.mockReturnValue(true);

      const html = await controller.unsubscribe('u-1.firma-valida');

      expect(renderer.verifyUnsubscribeToken).toHaveBeenCalledWith('u-1', 'firma-valida');
      expect(repository.unsubscribe).toHaveBeenCalledWith('u-1');
      expect(html).toContain('Has sido dado de baja');
    });
  });

  it('expone el secret desde config', () => {
    config.get('RESEND_WEBHOOK_SECRET', { infer: true });
    expect(config.get).toHaveBeenCalledWith('RESEND_WEBHOOK_SECRET', { infer: true });
  });
});
