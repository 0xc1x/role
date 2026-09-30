import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { DRIZZLE } from '../../database/database.tokens';
import { EmailMarketingRepository } from '../email-marketing/email-marketing.repository';
import { UserDefaultsService } from '../users/user-defaults.service';
import { AuthAccountRepository } from './auth-account.repository';
import { SupabaseTokenVerifier } from '../../auth/supabase-token-verifier';

const mockSupabaseAnon = {
  auth: {
    signInWithPassword: jest.fn(),
    refreshSession: jest.fn(),
    signOut: jest.fn(),
  },
};

const mockSupabaseAdmin = {
  auth: {
    admin: {
      createUser: jest.fn(),
      signOut: jest.fn(),
      generateLink: jest.fn(),
      updateUserById: jest.fn(),
      deleteUser: jest.fn(),
    },
  },
};

const mockDb = {
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

const mockUserDefaults = {
  seed: jest.fn().mockResolvedValue(undefined),
};

const mockEmailRepo = {
  listTemplates: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
  findTemplateById: jest.fn().mockResolvedValue(null),
  insertSends: jest.fn().mockResolvedValue([]),
};

const mockAccounts = {
  countRetained: jest.fn(),
  anonymise: jest.fn().mockResolvedValue(undefined),
  eraseAccount: jest.fn().mockResolvedValue(true),
};

const mockVerifier = {
  verify: jest.fn(),
};

const TEMPLATE = { id: 'tmpl-1', name: 'auth-password-recovery' };

const knownEmail = 'conocida@correo.cl';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    mockConfig.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        AUTH_REDIRECT_TO: 'https://app.role.ec/reset',
        NODE_ENV: 'test',
      };
      return values[key];
    });

    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.limit.mockResolvedValue([]);

    // Reset all mocks
    jest.clearAllMocks();
    mockSupabaseAnon.auth.signInWithPassword.mockReset();
    mockSupabaseAnon.auth.refreshSession.mockReset();
    mockSupabaseAnon.auth.signOut.mockReset();
    mockSupabaseAdmin.auth.admin.createUser.mockReset();
    mockSupabaseAdmin.auth.admin.signOut.mockReset();
    mockSupabaseAdmin.auth.admin.generateLink.mockReset();
    mockSupabaseAdmin.auth.admin.updateUserById.mockReset();
    mockSupabaseAdmin.auth.admin.deleteUser.mockReset();
    mockUserDefaults.seed.mockReset();
    mockUserDefaults.seed.mockResolvedValue(undefined);
    mockEmailRepo.listTemplates.mockReset();
    mockEmailRepo.findTemplateById.mockReset();
    mockEmailRepo.insertSends.mockReset();
    mockAccounts.countRetained.mockReset();
    mockAccounts.anonymise.mockReset();
    mockAccounts.eraseAccount.mockReset();
    mockVerifier.verify.mockReset();
    // Defaults, set AFTER the resets: `mockReset` drops the implementation a
    // factory installed, and a suite that depends on that is one edit away from
    // silently asserting on `undefined`.
    mockAccounts.countRetained.mockResolvedValue({
      orders: 0,
      businesses: 0,
      reviews: 0,
    });
    mockEmailRepo.listTemplates.mockResolvedValue({
      rows: [TEMPLATE],
      total: 1,
    });
    mockEmailRepo.findTemplateById.mockResolvedValue(TEMPLATE);

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: DRIZZLE, useValue: mockDb },
        { provide: UserDefaultsService, useValue: mockUserDefaults },
        { provide: EmailMarketingRepository, useValue: mockEmailRepo },
        { provide: AuthAccountRepository, useValue: mockAccounts },
        { provide: SupabaseTokenVerifier, useValue: mockVerifier },
      ],
    }).compile();

    service = module.get(AuthService);

    // Manually inject the mock Supabase clients
    (service as any).supabaseAnon = mockSupabaseAnon;
    (service as any).supabaseAdmin = mockSupabaseAdmin;
  });

  describe('login', () => {
    it('should return tokens and user on successful login', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' };
      const mockSession = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      const mockProfile = {
        id: 'user-1',
        email: 'test@test.com',
        full_name: 'Test User',
        avatar_url: null,
        role: 'user',
      };

      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      mockDb.limit.mockResolvedValueOnce([mockProfile]);

      const result = await service.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.access_token).toBe('access-token');
      expect(result.refresh_token).toBe('refresh-token');
      expect(result.user.email).toBe('test@test.com');
      expect(result.user.role).toBe('user');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { status: 400, message: 'Invalid credentials' },
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw InternalServerErrorException for other errors', async () => {
      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { status: 500, message: 'Server error' },
      });

      await expect(
        service.login({ email: 'test@test.com', password: 'password123' }),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should return fallback user when profile not found', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' };
      const mockSession = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };

      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(result.user.id).toBe('user-1');
      expect(result.user.role).toBe('user');
      expect(result.user.full_name).toBeNull();
    });

    it('repairs a missing profile and returns the seeded one', async () => {
      const mockUser = {
        id: 'user-1',
        email: 'test@test.com',
        phone: '+593900000000',
        user_metadata: { full_name: 'Test User', role: 'business' },
      };
      const mockSession = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      const seededProfile = {
        id: 'user-1',
        email: 'test@test.com',
        full_name: 'Test User',
        avatar_url: null,
        role: 'business',
      };

      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      // First read finds nothing; the repair runs and the re-read finds the row
      // the seeder just wrote.
      mockDb.limit
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([seededProfile]);

      const result = await service.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(mockUserDefaults.seed).toHaveBeenCalledWith({
        id: 'user-1',
        email: 'test@test.com',
        fullName: 'Test User',
        avatarUrl: null,
        phone: '+593900000000',
        // Passed through verbatim: the seeder owns the allowlist.
        requestedRole: 'business',
      });
      expect(result.user).toEqual(seededProfile);
    });

    it('does not seed when the profile already exists', async () => {
      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: {
          user: { id: 'user-1', email: 'test@test.com' },
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          },
        },
        error: null,
      });

      mockDb.limit.mockResolvedValueOnce([
        {
          id: 'user-1',
          email: 'test@test.com',
          full_name: 'Test User',
          avatar_url: null,
          role: 'user',
        },
      ]);

      const result = await service.login({
        email: 'test@test.com',
        password: 'password123',
      });

      expect(mockUserDefaults.seed).not.toHaveBeenCalled();
      expect(result.user.full_name).toBe('Test User');
    });
  });

  describe('register', () => {
    it('creates the user unconfirmed and seeds the default rows', async () => {
      const mockUser = { id: 'new-user-1', email: 'new@test.com' };

      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const result = await service.register({
        email: 'new@test.com',
        password: 'password123',
        full_name: 'New User',
      });

      // Registro con verificación por email: sin confirmar no hay sesión.
      expect(mockSupabaseAdmin.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email_confirm: false,
          user_metadata: { full_name: 'New User' },
        }),
      );
      // El registro no pide rol: el allowlist vive en el seeder, así que el
      // metadata de un signup nunca puede pedir 'admin'.
      expect(mockUserDefaults.seed).toHaveBeenCalledWith({
        id: 'new-user-1',
        email: 'new@test.com',
        fullName: 'New User',
      });
      expect(mockSupabaseAnon.auth.signInWithPassword).not.toHaveBeenCalled();
      expect(result.id).toBe('new-user-1');
      expect(result.email).toBe('new@test.com');
      expect(result.message).toContain('confirm your email');
    });

    it('succeeds even if the seeding fails (login repairs it)', async () => {
      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: { id: 'new-user-2', email: 'new2@test.com' } },
        error: null,
      });
      mockUserDefaults.seed.mockRejectedValue(new Error('database is down'));

      // El usuario de auth ya existe y su correo de confirmación puede estar en
      // camino: un fallo transitorio de la BD no puede devolver 500 (ni borrar
      // la cuenta). El login repara el perfil.
      const result = await service.register({
        email: 'new2@test.com',
        password: 'password123',
        full_name: 'Another User',
      });

      expect(result.id).toBe('new-user-2');
      expect(result.message).toContain('confirm your email');
    });

    it('should throw ConflictException when email already registered', async () => {
      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'User already registered' },
      });

      await expect(
        service.register({
          email: 'existing@test.com',
          password: 'password123',
          full_name: 'Existing',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw InternalServerErrorException for other errors', async () => {
      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Server error' },
      });

      await expect(
        service.register({
          email: 'new@test.com',
          password: 'password123',
          full_name: 'New User',
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('refresh', () => {
    it('should return new tokens on successful refresh', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' };
      const mockSession = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      const mockProfile = {
        id: 'user-1',
        email: 'test@test.com',
        full_name: 'Test User',
        avatar_url: null,
        role: 'user',
      };

      mockSupabaseAnon.auth.refreshSession.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      mockDb.limit.mockResolvedValueOnce([mockProfile]);

      const result = await service.refresh({
        refresh_token: 'valid-refresh-token',
      });

      expect(result.access_token).toBe('new-access-token');
      expect(result.refresh_token).toBe('new-refresh-token');
      expect(result.user.email).toBe('test@test.com');
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      mockSupabaseAnon.auth.refreshSession.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid token' },
      });

      await expect(
        service.refresh({ refresh_token: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return fallback user when profile not found', async () => {
      const mockUser = { id: 'user-1', email: 'test@test.com' };
      const mockSession = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };

      mockSupabaseAnon.auth.refreshSession.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.refresh({
        refresh_token: 'valid-refresh-token',
      });

      expect(result.user.id).toBe('user-1');
      expect(result.user.role).toBe('user');
    });
  });

  describe('logout', () => {
    it('revoca la sesión real (refresh del token + signOut local en GoTrue)', async () => {
      const mockSession = {
        access_token: 'fresh-access-token',
        refresh_token: 'rotated-refresh-token',
      };

      mockSupabaseAnon.auth.refreshSession.mockResolvedValue({
        data: { user: {}, session: mockSession },
        error: null,
      });
      mockSupabaseAdmin.auth.admin.signOut.mockResolvedValue({ error: null });

      const result = await service.logout({ refresh_token: 'any-token' });

      expect(mockSupabaseAdmin.auth.admin.signOut).toHaveBeenCalledWith(
        'fresh-access-token',
        'local',
      );
      expect(result.message).toBe('Logged out successfully');
    });

    it('tolera un refresh token inválido o ya revocado (idempotente)', async () => {
      mockSupabaseAnon.auth.refreshSession.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid Refresh Token' },
      });

      const result = await service.logout({ refresh_token: 'stale-token' });

      expect(mockSupabaseAdmin.auth.admin.signOut).not.toHaveBeenCalled();
      expect(result.message).toBe('Logged out successfully');
    });

    it('tolera logout sin refresh token', async () => {
      const result = await service.logout({ refresh_token: '' });

      expect(mockSupabaseAnon.auth.refreshSession).not.toHaveBeenCalled();
      expect(result.message).toBe('Logged out successfully');
    });

    it('propaga InternalServerErrorException si GoTrue falla al revocar', async () => {
      mockSupabaseAnon.auth.refreshSession.mockResolvedValue({
        data: { user: {}, session: { access_token: 'acc' } },
        error: null,
      });
      mockSupabaseAdmin.auth.admin.signOut.mockResolvedValue({
        error: { message: 'Sign out failed' },
      });

      await expect(
        service.logout({ refresh_token: 'any-token' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('forgotPassword', () => {
    const known = { email: 'conocida@correo.cl' };
    const unknown = { email: 'nadie@correo.cl' };

    it('answers a known and an unknown address with the SAME body', async () => {
      mockSupabaseAdmin.auth.admin.generateLink
        .mockResolvedValueOnce({
          data: {
            user: { id: 'user-1' },
            properties: { action_link: 'https://link/conocida' },
          },
          error: null,
        })
        // GoTrue answers 404 for an address it does not hold.
        .mockResolvedValueOnce({
          data: { user: null, properties: {} },
          error: { status: 404, message: 'User not found' },
        });

      const withAccount = await service.forgotPassword(known);
      const withoutAccount = await service.forgotPassword(unknown);

      // Not "similar": the same object. A different status, a different message
      // or a different key set would make this an account-enumeration oracle,
      // and the route is unauthenticated.
      expect(withAccount).toEqual(withoutAccount);
      expect(withAccount).toEqual({
        message:
          'If that address matches an account, a password recovery link is on its way.',
      });
    });

    it('enqueues exactly one send for a known address', async () => {
      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: {
          user: { id: 'user-1' },
          properties: { action_link: 'https://link/abc?token_hash=secret' },
        },
        error: null,
      });

      await service.forgotPassword(known);

      expect(mockEmailRepo.insertSends).toHaveBeenCalledTimes(1);
      const [rows] = mockEmailRepo.insertSends.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'transactional',
        source_type: 'auth',
        source_id: 'user-1',
        user_id: 'user-1',
        template_id: 'tmpl-1',
        email: known.email,
        status: 'pending',
        attempts: 0,
        max_attempts: 5,
      });
      // The link is a bearer credential: it travels in the queued variables and
      // nowhere else. It is never logged, never in the response.
      expect(
        (rows[0].variables_used as Record<string, string>).recovery_url,
      ).toBe('https://link/abc?token_hash=secret');
      // No `nombre`: this is the one template an anonymous request can trigger,
      // so it carries no field of account data beyond the link.
      expect(Object.keys(rows[0].variables_used as object)).toEqual([
        'recovery_url',
      ]);
    });

    it('enqueues nothing for an unknown address', async () => {
      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: { user: null, properties: {} },
        error: { status: 404, message: 'User not found' },
      });

      const result = await service.forgotPassword(unknown);

      expect(mockEmailRepo.insertSends).not.toHaveBeenCalled();
      // The template lookup still ran: both branches pay the same two round
      // trips, so the lookup cannot become the timing signal.
      expect(mockEmailRepo.listTemplates).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        message:
          'If that address matches an account, a password recovery link is on its way.',
      });
    });

    it('still answers 200 when the template has not been seeded', async () => {
      mockEmailRepo.listTemplates.mockResolvedValue({ rows: [], total: 0 });
      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: {
          user: { id: 'user-1' },
          properties: { action_link: 'https://l' },
        },
        error: null,
      });

      // Degraded, not broken: the caller cannot tell, and the log is how an
      // operator finds out.
      await expect(service.forgotPassword(known)).resolves.toMatchObject({
        message: expect.any(String),
      });
      expect(mockEmailRepo.insertSends).not.toHaveBeenCalled();
    });

    it('does not let the caller choose the recovery redirect', async () => {
      mockSupabaseAdmin.auth.admin.generateLink.mockResolvedValue({
        data: {
          user: { id: 'user-1' },
          properties: { action_link: 'https://l' },
        },
        error: null,
      });

      await service.forgotPassword(known);

      // The redirect is server configuration. A caller-supplied one on an
      // unauthenticated endpoint is a phishing primitive.
      expect(mockSupabaseAdmin.auth.admin.generateLink).toHaveBeenCalledWith({
        type: 'recovery',
        email: known.email,
        options: { redirectTo: 'https://app.role.ec/reset' },
      });
    });
  });

  describe('resetPassword', () => {
    it('rejects a token the verifier does not accept, changing nothing', async () => {
      // Expired, forged or wrong-issuer all arrive here identically, and the
      // password write is never reached: the first thing the method does is
      // verify, and a throw skips everything after it.
      mockVerifier.verify.mockRejectedValue(new UnauthorizedException('nope'));

      await expect(
        service.resetPassword({
          access_token: 'expired',
          password: 'nueva-clave',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(
        mockSupabaseAdmin.auth.admin.updateUserById,
      ).not.toHaveBeenCalled();
      expect(mockSupabaseAdmin.auth.admin.signOut).not.toHaveBeenCalled();
    });

    it('sets the password and revokes EVERY session with scope global', async () => {
      mockVerifier.verify.mockResolvedValue({
        sub: 'user-1',
        email: knownEmail,
      });
      mockSupabaseAdmin.auth.admin.signOut.mockResolvedValue({ error: null });
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      const result = await service.resetPassword({
        access_token: 'recovery-jwt',
        password: 'nueva-clave-1',
      });

      // 'global', not 'local' (one session — what logout uses) and not 'others'
      // (which would leave the recovery session, the very credential that just
      // changed the password, alive).
      expect(mockSupabaseAdmin.auth.admin.signOut).toHaveBeenCalledWith(
        'recovery-jwt',
        'global',
      );
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        'user-1',
        { password: 'nueva-clave-1' },
      );
      // Revocation BEFORE the write: if the write fails the sessions are
      // already gone, so no session can outlive the operation.
      expect(
        mockSupabaseAdmin.auth.admin.signOut.mock.invocationCallOrder[0],
      ).toBeLessThan(
        mockSupabaseAdmin.auth.admin.updateUserById.mock.invocationCallOrder[0],
      );
      expect(result.message).toContain('updated');
    });

    it('does not set the password when the revocation fails', async () => {
      mockVerifier.verify.mockResolvedValue({
        sub: 'user-1',
        email: knownEmail,
      });
      mockSupabaseAdmin.auth.admin.signOut.mockResolvedValue({
        error: { status: 500, message: 'boom' },
      });

      await expect(
        service.resetPassword({ access_token: 't', password: 'nueva-clave-1' }),
      ).rejects.toThrow(InternalServerErrorException);

      // The invariant is "no session outlives this operation", so a failure
      // stops the whole operation instead of half-applying it.
      expect(
        mockSupabaseAdmin.auth.admin.updateUserById,
      ).not.toHaveBeenCalled();
    });

    it('maps a GoTrue 422 to 422 and anything else to 500', async () => {
      mockVerifier.verify.mockResolvedValue({
        sub: 'user-1',
        email: knownEmail,
      });
      mockSupabaseAdmin.auth.admin.signOut.mockResolvedValue({ error: null });
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: { user: null },
        error: { status: 422, message: 'New password should be different' },
      });

      await expect(
        service.resetPassword({ access_token: 't', password: 'nueva-clave-1' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('changeEmail', () => {
    const user = {
      id: 'user-1',
      email: 'actual@correo.cl',
      role: 'user' as const,
    };

    beforeEach(() => {
      mockDb.limit.mockResolvedValue([
        {
          id: 'user-1',
          email: 'actual@correo.cl',
          full_name: 'Ana Torres',
          avatar_url: null,
          role: 'user',
        },
      ]);
      mockEmailRepo.listTemplates.mockResolvedValue({
        rows: [{ id: 'tmpl-2', name: 'auth-email-change-confirmation' }],
        total: 1,
      });
      mockEmailRepo.findTemplateById.mockResolvedValue({
        id: 'tmpl-2',
        name: 'auth-email-change-confirmation',
      });
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
    });

    it('initiates the change and writes NO profile column', async () => {
      const result = await service.changeEmail(user, {
        new_email: 'nuevo@correo.cl',
      });

      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        'user-1',
        { email: 'nuevo@correo.cl' },
      );
      // The copy is the trigger's job. Writing it here is what `PATCH /me`
      // refused to do, and it is the failure this route exists to avoid.
      expect(mockDb.values).not.toHaveBeenCalled();
      expect(result.pending_email).toBe('nuevo@correo.cl');
    });

    it('refuses the address the account already has', async () => {
      await expect(
        service.changeEmail(user, { new_email: 'ACTUAL@correo.cl' }),
      ).rejects.toThrow(UnprocessableEntityException);

      expect(
        mockSupabaseAdmin.auth.admin.updateUserById,
      ).not.toHaveBeenCalled();
    });

    it('answers 409 when GoTrue says the address is taken', async () => {
      mockSupabaseAdmin.auth.admin.updateUserById.mockResolvedValue({
        data: { user: null },
        error: {
          message: 'A user with this email has already been registered',
        },
      });

      await expect(
        service.changeEmail(user, { new_email: 'tomada@correo.cl' }),
      ).rejects.toThrow(ConflictException);
    });

    it('never sends the notice to the address being abandoned', async () => {
      await service.changeEmail(user, { new_email: 'nuevo@correo.cl' });

      const [rows] = mockEmailRepo.insertSends.mock.calls[0] as [
        Record<string, unknown>[],
      ];
      // To the CURRENT address: if a session was hijacked, this is how the real
      // owner finds out. GoTrue owns the confirmation of the new one.
      expect(rows[0].email).toBe('actual@correo.cl');
      expect(rows[0].source_id).toBe('user-1');
      expect((rows[0].variables_used as Record<string, string>).new_email).toBe(
        'nuevo@correo.cl',
      );
    });

    it('does not fail the change when the notice cannot be queued', async () => {
      mockEmailRepo.listTemplates.mockResolvedValue({ rows: [], total: 0 });

      // The change is already initiated and GoTrue's confirmation is on its
      // way; a queue error is a degraded notice, not a failed request.
      await expect(
        service.changeEmail(user, { new_email: 'nuevo@correo.cl' }),
      ).resolves.toMatchObject({ pending_email: 'nuevo@correo.cl' });
    });

    it('a body carrying role reaches GoTrue as nothing but the address', async () => {
      await service.changeEmail(user, {
        new_email: 'nuevo@correo.cl',
        role: 'admin',
      } as never);

      // `role` is not a key of `ChangeEmailRequestSchema`, so the pipe drops it
      // before this point; the assertion is that even if it arrived, the admin
      // attributes are built from the named field and nothing else.
      expect(mockSupabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
        'user-1',
        { email: 'nuevo@correo.cl' },
      );
    });
  });

  describe('deleteAccount', () => {
    const user = { id: 'user-1', email: 'u@correo.cl', role: 'user' as const };

    it('anonymises instead of deleting when order history exists', async () => {
      mockAccounts.countRetained.mockResolvedValue({
        orders: 4,
        businesses: 0,
        reviews: 0,
      });
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
        data: {},
        error: null,
      });

      await service.deleteAccount(user);

      // Soft delete: the identity goes and the row the orders point at stays.
      expect(mockSupabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(
        'user-1',
        true,
      );
      expect(mockAccounts.anonymise).toHaveBeenCalledWith('user-1');
      expect(mockAccounts.eraseAccount).not.toHaveBeenCalled();
    });

    it('anonymises a business owner with no orders of their own', async () => {
      // `business_ownership.owner_id` cascades from `profiles`, and so does
      // `orders.business_id` from `businesses`. An owner who never ordered
      // passes a "no orders" test and would take their customers' purchases with
      // them, so the gate is wider than orders.
      mockAccounts.countRetained.mockResolvedValue({
        orders: 0,
        businesses: 1,
        reviews: 0,
      });
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
        data: {},
        error: null,
      });

      await service.deleteAccount(user);

      expect(mockAccounts.anonymise).toHaveBeenCalledWith('user-1');
      expect(mockAccounts.eraseAccount).not.toHaveBeenCalled();
    });

    it('hard-deletes an account nothing else points at', async () => {
      mockAccounts.countRetained.mockResolvedValue({
        orders: 0,
        businesses: 0,
        reviews: 0,
      });
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
        data: {},
        error: null,
      });

      await service.deleteAccount(user);

      expect(mockSupabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(
        'user-1',
        false,
      );
      expect(mockAccounts.eraseAccount).toHaveBeenCalledWith('user-1');
      expect(mockAccounts.anonymise).not.toHaveBeenCalled();
    });

    it('resolves void in both branches, so neither is visible in the answer', async () => {
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
        data: {},
        error: null,
      });

      mockAccounts.countRetained.mockResolvedValue({
        orders: 9,
        businesses: 0,
        reviews: 0,
      });
      await expect(service.deleteAccount(user)).resolves.toBeUndefined();

      mockAccounts.countRetained.mockResolvedValue({
        orders: 0,
        businesses: 0,
        reviews: 0,
      });
      await expect(service.deleteAccount(user)).resolves.toBeUndefined();
    });

    it('a body carrying role cannot promote the account', async () => {
      // `AuthUser` carries a `role` because the guard read it, so this is the
      // one place a caller-controlled role could plausibly leak back in. It is
      // typed and never forwarded: the admin attributes this service builds
      // name `email`, `password` and nothing else.
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
        data: {},
        error: null,
      });

      await service.deleteAccount({
        id: 'user-1',
        email: 'u@correo.cl',
        role: 'admin',
      } as never);

      const [id, soft] = mockSupabaseAdmin.auth.admin.deleteUser.mock.calls[0];
      expect(id).toBe('user-1');
      expect(soft).toBe(false);
      expect(
        JSON.stringify(mockSupabaseAdmin.auth.admin.deleteUser.mock.calls),
      ).not.toContain('admin');
    });

    it('does not touch the database when the identity delete fails', async () => {
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValue({
        data: { user: null },
        error: { status: 500, message: 'boom' },
      });

      await expect(service.deleteAccount(user)).rejects.toThrow(
        InternalServerErrorException,
      );

      // Nothing destroyed yet: the caller can retry a clean no-op.
      expect(mockAccounts.anonymise).not.toHaveBeenCalled();
      expect(mockAccounts.eraseAccount).not.toHaveBeenCalled();
    });
  });
});
