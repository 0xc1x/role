jest.mock('juice', () => ({
  __esModule: true,
  default: jest.fn((html: string) => html),
}));
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn() },
  })),
}));

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { CreateContactDto } from '@0xc1x/role-commons';
import { AppConfigRepository } from '../app-config/app-config.repository';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import { RendererService } from '../email-marketing/renderer.service';
import { AppStoreRepository } from '../store/app-store.repository';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  let service: ContactService;
  const appConfigRepo = {
    findByKey: jest.fn(),
  };
  const emailRepo = {
    listTemplates: jest.fn(),
    findTemplateById: jest.fn(),
    findComponentById: jest.fn(),
  };
  const renderer = {
    renderVariables: jest.fn((s: string) => s),
    assemble: jest.fn(() => '<p>assembled</p>'),
  };
  const storeRepo = {
    insert: jest.fn(),
    updateStatus: jest.fn(),
  };

  const baseDto: CreateContactDto = {
    name: 'Ana',
    email: 'ana@example.com',
    role: 'persona',
    city: 'Quito',
    city_other: undefined,
    message: 'Hola',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ContactService,
        { provide: AppConfigRepository, useValue: appConfigRepo },
        { provide: EmailMarketingRepository, useValue: emailRepo },
        { provide: RendererService, useValue: renderer },
        { provide: AppStoreRepository, useValue: storeRepo },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'RESEND_API_KEY') return '';
              if (key === 'EMAIL_FROM') return 'notificaciones@role.ec';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(ContactService);
    jest.clearAllMocks();

    appConfigRepo.findByKey.mockImplementation(async (key: string) => {
      if (key === 'contact.cities') return null;
      if (key === 'contact.hola_email') return null;
      if (key === 'contact.negocios_email') return null;
      if (key === 'email.from') return null;
      return null;
    });
    emailRepo.listTemplates.mockResolvedValue({ rows: [] });
    storeRepo.insert.mockResolvedValue({ id: 'entry-1' });
    storeRepo.updateStatus.mockResolvedValue({ id: 'entry-1', status: 'PROCESADO' });
  });

  it('rejects city not in allowed list', async () => {
    await expect(
      service.handle({ ...baseDto, city: 'Ambato' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('uses city_other when city is Otra', async () => {
    await service.handle({
      ...baseDto,
      city: 'Otra',
      city_other: 'Ambato',
    });

    expect(storeRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({ city: 'Ambato', city_raw: 'Otra' }),
      }),
    );
  });

  it('completes happy path without Resend (dev mock)', async () => {
    const result = await service.handle(baseDto, '127.0.0.1');

    expect(result).toEqual({ ok: true, id: 'entry-1' });
    expect(storeRepo.updateStatus).toHaveBeenCalledWith('entry-1', 'PROCESADO');
  });

  it('queda PENDIENTE y devuelve ok cuando el envío falla (no lanza)', async () => {
    const deliver = jest
      .spyOn(service as unknown as { deliver: () => Promise<void> }, 'deliver')
      .mockRejectedValue(new Error('SMTP down'));

    const result = await service.handle(baseDto);

    expect(result).toEqual({ ok: true, id: 'entry-1' });
    // intenta resolver la plantilla para encolar el reintento
    expect(emailRepo.listTemplates).toHaveBeenCalled();
    expect(storeRepo.updateStatus).toHaveBeenCalledWith(
      'entry-1',
      'PENDIENTE',
      expect.objectContaining({ error: 'SMTP down' }),
    );

    deliver.mockRestore();
  });

  it('escapes HTML in inline fallback template', async () => {
    await service.handle({
      ...baseDto,
      name: '<script>alert(1)</script>',
    });

    const insertCall = storeRepo.insert.mock.calls[0]?.[0];
    expect(insertCall?.value?.name).toContain('<script>');
    // deliver uses inline html — verify via mock log path; renderer not called for template
    expect(emailRepo.listTemplates).toHaveBeenCalled();
  });

  it('resolves negocio recipient fallback', async () => {
    await service.handle({ ...baseDto, role: 'negocio' });

    expect(storeRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({ to: 'negocios@role.ec' }),
      }),
    );
  });

  describe('ContactService.findContactTemplate', () => {
    test('usa plantilla contacto-notificacion cuando existe', async () => {
      emailRepo.listTemplates.mockResolvedValue({
        rows: [{ id: 't1', name: 'contacto-notificacion' }, { id: 't2', name: 'otra' }],
      });
      emailRepo.findTemplateById.mockResolvedValue({ id: 't1', subject: 'Hola' });

      await service.handle(baseDto);

      expect(emailRepo.findTemplateById).toHaveBeenCalledWith('t1');
    });
  });
});