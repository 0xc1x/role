import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { DRIZZLE } from '../../database/database.tokens';
import { UserDefaultsService } from '../users/user-defaults.service';

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

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    mockConfig.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
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
    mockUserDefaults.seed.mockReset();
    mockUserDefaults.seed.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: DRIZZLE, useValue: mockDb },
        { provide: UserDefaultsService, useValue: mockUserDefaults },
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

      const result = await service.login({ email: 'test@test.com', password: 'password123' });

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

      const result = await service.login({ email: 'test@test.com', password: 'password123' });

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
      mockDb.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
        seededProfile,
      ]);

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

      const result = await service.refresh({ refresh_token: 'valid-refresh-token' });

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

      const result = await service.refresh({ refresh_token: 'valid-refresh-token' });

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
});