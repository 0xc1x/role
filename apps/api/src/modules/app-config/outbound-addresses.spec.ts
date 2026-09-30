import {
  readConfigEmail,
  resolveBusinessSupportEmail,
  resolveOutboundFrom,
} from './outbound-addresses';
import type { AppConfigRow } from './app-config.repository';

const FALLBACK_FROM = 'Rolé <notificaciones@role.ec>';
const FALLBACK_SUPPORT = 'negocios@role.ec';

const makeRow = (overrides: Partial<AppConfigRow> = {}): AppConfigRow =>
  ({
    key: 'email.from',
    value: 'notificaciones@role.ec',
    value_type: 'string',
    category: 'contacto',
    label: 'Remitente notificaciones',
    description: null,
    is_public: false,
    active: true,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as AppConfigRow;

describe('outbound-addresses', () => {
  let repo: { findByKey: jest.Mock };
  let env: Record<string, string | undefined>;
  let config: { get: jest.Mock };

  beforeEach(() => {
    repo = { findByKey: jest.fn().mockResolvedValue(null) };
    env = { EMAIL_FROM: 'Rolé <hola@role.ec>' };
    config = { get: jest.fn((key: string) => env[key]) };
  });

  describe('readConfigEmail', () => {
    it('devuelve el valor de una fila activa con forma de dirección', async () => {
      repo.findByKey.mockResolvedValue(makeRow());

      await expect(readConfigEmail(repo, 'email.from')).resolves.toBe(
        'notificaciones@role.ec',
      );
      expect(repo.findByKey).toHaveBeenCalledWith('email.from');
    });

    it('devuelve null si la fila no existe, está inactiva o no es una dirección', async () => {
      for (const row of [
        null,
        makeRow({ active: false }),
        makeRow({ value: 42 }),
        makeRow({ value: ['a@b.com'] }),
        makeRow({ value: 'notificaciones' }),
        makeRow({ value: '' }),
      ]) {
        repo.findByKey.mockResolvedValue(row);
        await expect(readConfigEmail(repo, 'email.from')).resolves.toBeNull();
      }
    });
  });

  describe('resolveOutboundFrom', () => {
    it('gana app_config["email.from"] sobre EMAIL_FROM', async () => {
      repo.findByKey.mockResolvedValue(makeRow());

      await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
        'Rolé <notificaciones@role.ec>',
      );
    });

    it('normaliza a "Rolé <addr>" una dirección sin nombre para mostrar', async () => {
      repo.findByKey.mockResolvedValue(makeRow({ value: 'no-reply@role.ec' }));

      await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
        'Rolé <no-reply@role.ec>',
      );
    });

    it('respeta el valor de app_config que ya trae nombre para mostrar', async () => {
      repo.findByKey.mockResolvedValue(
        makeRow({ value: 'Equipo Rolé <notificaciones@role.ec>' }),
      );

      await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
        'Equipo Rolé <notificaciones@role.ec>',
      );
    });

    it('cae a EMAIL_FROM cuando app_config no aporta una dirección', async () => {
      for (const row of [
        null,
        makeRow({ active: false }),
        makeRow({ value: 42 }),
        makeRow({ value: 'notificaciones' }),
      ]) {
        repo.findByKey.mockResolvedValue(row);
        await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
          'Rolé <hola@role.ec>',
        );
      }
    });

    it('cae al valor por defecto si tampoco hay EMAIL_FROM utilizable', async () => {
      repo.findByKey.mockResolvedValue(null);
      // La capa de env solo exige un `@` (compatibilidad con el comportamiento
      // previo): incluso la dirección de pruebas de Resend se acepta.
      env.EMAIL_FROM = 'onboarding@resend.dev';

      await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
        'onboarding@resend.dev',
      );

      env.EMAIL_FROM = 'sin-dominio';
      await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
        FALLBACK_FROM,
      );

      env.EMAIL_FROM = undefined;
      await expect(resolveOutboundFrom(repo, config)).resolves.toBe(
        FALLBACK_FROM,
      );
    });
  });

  describe('resolveBusinessSupportEmail', () => {
    it('gana app_config["contact.negocios_email"]', async () => {
      repo.findByKey.mockResolvedValue(
        makeRow({ key: 'contact.negocios_email', value: 'negocios@role.ec' }),
      );

      await expect(resolveBusinessSupportEmail(repo)).resolves.toBe(
        'negocios@role.ec',
      );
      expect(repo.findByKey).toHaveBeenCalledWith('contact.negocios_email');
    });

    it('cae al valor por defecto si la fila falta, está inactiva o no es una dirección', async () => {
      for (const row of [
        null,
        makeRow({ active: false }),
        makeRow({ value: 'negocios' }),
        makeRow({ value: { email: 'negocios@role.ec' } }),
      ]) {
        repo.findByKey.mockResolvedValue(row);
        await expect(resolveBusinessSupportEmail(repo)).resolves.toBe(
          FALLBACK_SUPPORT,
        );
      }
    });
  });
});
