const resendHarness: { Resend?: jest.Mock; __send?: jest.Mock } = {};
jest.mock('resend', () => {
  const send = jest.fn();
  const Resend = jest.fn(() => ({ emails: { send } }));
  resendHarness.Resend = Resend;
  resendHarness.__send = send;
  return { Resend, __send: send };
});

import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.tokens';
import { AppConfigRepository } from '../app-config/app-config.repository';
import { UserDefaultsService } from '../users/user-defaults.service';
import { BusinessesService } from './businesses.service';
import { BusinessesRepository } from './businesses.repository';

const resendMock = resendHarness as { Resend: jest.Mock; __send: jest.Mock };
const resendSend = resendMock.__send;

const CONFIRMATION_LINK =
  'https://test.supabase.co/auth/v1/verify?type=signup&token=hashed123&redirect_to=http%3A%2F%2Flocalhost%3A3001%2F';
/** The link as it appears in the HTML part, where `&` is entity-encoded. */
const CONFIRMATION_LINK_IN_HTML = CONFIRMATION_LINK.replace(/&/g, '&amp;');

const mockSupabaseAdmin = {
  auth: {
    admin: {
      createUser: jest.fn(),
      generateLink: jest.fn(),
      deleteUser: jest.fn(),
    },
  },
};

const mockUserDefaults = {
  seed: jest.fn().mockResolvedValue(undefined),
};

const makeTx = () => ({
  insert: jest.fn(() => ({ values: jest.fn().mockResolvedValue([]) })),
});

describe('BusinessesService.onboard', () => {
  let service: BusinessesService;
  const repository = {
    findBySlug: jest.fn(),
    insert: jest.fn(),
    transaction: jest.fn(),
  };
  let env: Record<string, string | undefined>;
  /** Rows read by the outbound-address resolution; absent key = not configured. */
  let appConfigRows: Record<string, unknown>;
  /** Tx handed to the last repository.transaction() run, for spy assertions. */
  let lastTx: ReturnType<typeof makeTx> | null = null;

  const body = {
    email: 'owner@panaderia.com',
    password: 'secret123',
    full_name: 'Dueña Panadería',
    business_name: 'Panadería La Espiga',
    phone: '+593900000000',
  };

  const buildService = async () => {
    const module = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: BusinessesRepository, useValue: repository },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => env[key],
          },
        },
        {
          provide: AppConfigRepository,
          useValue: {
            findByKey: jest.fn(async (key: string) => appConfigRows[key] ?? null),
          },
        },
        { provide: UserDefaultsService, useValue: mockUserDefaults },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();
    const built = module.get(BusinessesService);
    (built as any).supabaseAdmin = mockSupabaseAdmin;
    return built;
  };

  /** Drives a full successful onboarding (auth user + pending business row). */
  const onboardSuccessfully = async (
    input: typeof body,
    userId: string,
    target: BusinessesService = service,
  ) => {
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    repository.findBySlug.mockResolvedValue(null);
    lastTx = makeTx();
    const tx = lastTx;
    repository.transaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    );
    repository.insert.mockResolvedValue({ id: 'biz-1' });
    return target.onboard(input);
  };

  beforeEach(async () => {
    appConfigRows = {};
    env = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'Rolé <notificaciones@role.ec>',
      AUTH_REDIRECT_TO: 'http://localhost:3001/',
    };
    // resetAllMocks borra la impl del constructor mockeado; se re-arma cada test.
    resendMock.Resend.mockImplementation(() => ({ emails: { send: resendSend } }));

    service = await buildService();
    lastTx = null;
    jest.clearAllMocks();
    mockUserDefaults.seed.mockResolvedValue(undefined);

    // Default happy path for the confirmation email. Set after clearAllMocks so
    // per-test overrides win.
    mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
      data: {
        properties: { action_link: CONFIRMATION_LINK },
        user: { id: 'user-1' },
      },
      error: null,
    });
    resendSend.mockResolvedValue({ data: { id: 'resend-1' }, error: null });
  });

  it('creates one Auth user, seeds its defaults and one pending business', async () => {
    const res = await onboardSuccessfully(body, 'user-1');

    expect(res.message).toContain('revisión');
    expect(mockSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: body.email,
        email_confirm: false,
        user_metadata: { full_name: body.full_name, role: 'business' },
      }),
    );
    // The user's own defaults (profile, preferences, consents) are seeded by
    // UserDefaultsService, not inside the business transaction: they hang off
    // the auth user, not off the business row.
    expect(mockUserDefaults.seed).toHaveBeenCalledWith({
      id: 'user-1',
      email: body.email,
      fullName: body.full_name,
      // The onboarding path is the only one that legitimately asks for the
      // business role; the seeder allowlists it.
      requestedRole: 'business',
    });
    expect(lastTx!.insert).not.toHaveBeenCalled();
    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(repository.insert).toHaveBeenCalledWith(
      lastTx,
      expect.objectContaining({
        owner_id: 'user-1',
        name: body.business_name,
        is_active: false,
        verification_status: 'pending',
      }),
    );
    expect(mockSupabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('maps duplicate email to ConflictException without touching DB', async () => {
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });

    await expect(service.onboard(body)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('skips the seeding when the business write is compensated away', async () => {
    // The auth user is deleted on this path, so seeding its defaults would
    // leave rows behind for an account that no longer exists.
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    });
    repository.findBySlug.mockResolvedValue(null);
    repository.transaction.mockRejectedValue(new Error('db down'));
    mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    await expect(service.onboard(body)).rejects.toThrow('db down');
    expect(mockUserDefaults.seed).not.toHaveBeenCalled();
  });

  it('still succeeds when the defaults seeding fails', async () => {
    // The account and the business row already exist: a database blip must not
    // fail the request, and the owner's first login repairs the profile.
    mockUserDefaults.seed.mockRejectedValue(new Error('database is down'));

    const res = await onboardSuccessfully(body, 'user-11');

    expect(res.message).toContain('revisión');
    expect(mockSupabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('deletes the auth user when DB writes fail', async () => {
    mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    });
    repository.findBySlug.mockResolvedValue(null);
    repository.transaction.mockRejectedValue(new Error('db down'));
    mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    await expect(service.onboard(body)).rejects.toThrow('db down');
    expect(mockSupabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(
      'user-2',
    );
    // No confirmation link for a business row that was compensated away.
    expect(mockSupabaseAdmin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('generates the signup link and emails it through Resend', async () => {
    await onboardSuccessfully(body, 'user-1');

    expect(mockSupabaseAdmin.auth.admin.generateLink).toHaveBeenCalledWith({
      type: 'signup',
      email: body.email,
      password: body.password,
      options: { redirectTo: 'http://localhost:3001/' },
    });
    expect(resendSend).toHaveBeenCalledTimes(1);
    const payload = resendSend.mock.calls[0]![0];
    expect(payload.from).toBe('Rolé <notificaciones@role.ec>');
    expect(payload.to).toBe(body.email);
    expect(payload.subject).toContain('Panadería La Espiga');
    expect(payload.html).toContain(CONFIRMATION_LINK_IN_HTML);
    expect(payload.text).toContain(CONFIRMATION_LINK);
  });

  // Remitente e inbox de soporte salen de app_config: una fila inactiva o con
  // basura no puede cambiar la dirección a la que se envía el correo.
  describe('direcciones de salida (app_config)', () => {
    it('envía desde app_config["email.from"] por encima de EMAIL_FROM', async () => {
      appConfigRows['email.from'] = {
        value: 'notificaciones@role.ec',
        active: true,
      };

      await onboardSuccessfully(body, 'user-1');

      expect(resendSend.mock.calls[0]![0].from).toBe(
        'Rolé <notificaciones@role.ec>',
      );
    });

    it('cae a EMAIL_FROM si la fila de app_config está inactiva', async () => {
      env.EMAIL_FROM = 'Rolé <hola@role.ec>';
      appConfigRows['email.from'] = {
        value: 'notificaciones@role.ec',
        active: false,
      };

      await onboardSuccessfully(body, 'user-1');

      expect(resendSend.mock.calls[0]![0].from).toBe('Rolé <hola@role.ec>');
    });

    it('muestra el inbox de support de app_config en el correo', async () => {
      appConfigRows['contact.negocios_email'] = {
        value: 'negocios@role.ec',
        active: true,
      };

      await onboardSuccessfully(body, 'user-1');

      const payload = resendSend.mock.calls[0]![0];
      expect(payload.html).toContain('negocios@role.ec');
      expect(payload.text).toContain('Escríbenos a negocios@role.ec');
    });

    it('usa el inbox de respaldo si app_config no lo tiene', async () => {
      await onboardSuccessfully(body, 'user-1');

      const payload = resendSend.mock.calls[0]![0];
      expect(payload.html).toContain('negocios@role.ec');
      expect(payload.html).not.toContain('role.app');
    });
  });

  it('skips the send and still succeeds without RESEND_API_KEY', async () => {
    delete env.RESEND_API_KEY;
    const noKeyService = await buildService();

    const res = await onboardSuccessfully(body, 'user-1', noKeyService);

    expect(res.message).toContain('revisión');
    expect(mockSupabaseAdmin.auth.admin.generateLink).not.toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
  });

  // Regression guard: the auth user and the business row already exist when the
  // confirmation is attempted. Rethrowing here would turn a transient email
  // outage into a locked-out business — the owner's retry hits "Email is
  // already registered" and the link never reaches them.
  it('still succeeds and keeps the user when the send throws', async () => {
    resendSend.mockRejectedValue(new Error('resend 500'));

    const res = await onboardSuccessfully(body, 'user-7');

    expect(res.message).toContain('revisión');
    expect(resendSend).toHaveBeenCalledTimes(1);
    expect(mockSupabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('still succeeds when generateLink fails', async () => {
    mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
      data: { properties: {} },
      error: { message: 'rate limited' },
    });

    const res = await onboardSuccessfully(body, 'user-8');

    expect(res.message).toContain('revisión');
    expect(resendSend).not.toHaveBeenCalled();
    expect(mockSupabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('treats a Resend error payload as a failed send without failing onboarding', async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified' },
    });

    const res = await onboardSuccessfully(body, 'user-9');

    expect(res.message).toContain('revisión');
    expect(mockSupabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  // El contrato de `docs/operations.md` prohíbe registrar mensajes crudos. Aquí
  // el mensaje crudo de Resend solía entrar recortado a 200 caracteres, y el
  // recorte no cambia nada: sigue siendo texto de proveedor. Lo que se
  // conserva es el código de máquina, que sí es accionable.
  it('registra el fallo de envío con el código del proveedor, no con su texto', async () => {
    // `Logger` enlaza sus métodos a la instancia en el constructor, así que un
    // spy sobre el prototype llega tarde: se sustituye el logger del servicio.
    const logged: unknown[] = [];
    (service as any).logger = {
      log: (entry: unknown) => logged.push(entry),
      error: (entry: unknown) => logged.push(entry),
    };
    resendSend.mockResolvedValue({
      data: null,
      error: {
        message:
          'The from address is not verified for re_9fJ2secret. owner@panaderia.com',
        name: 'invalid_from_address',
        statusCode: 422,
      },
    });

    await onboardSuccessfully(body, 'user-10');

    const failureCall = logged.find(
      (entry) =>
        (entry as { event?: string })?.event ===
        'business_confirmation_email_failed',
    );
    expect(failureCall).toBeDefined();
    const payload = failureCall as Record<string, unknown>;
    expect(payload.errorType).toBe('invalid_from_address');
    expect(JSON.stringify(payload)).not.toContain('re_9fJ2secret');
    expect(JSON.stringify(payload)).not.toContain('not verified');
  });
});
