import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { DRIZZLE } from '../../database/database.tokens';

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

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: DRIZZLE, useValue: mockDb },
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
  });

  describe('register', () => {
    it('should create user and return tokens on success', async () => {
      const mockUser = { id: 'new-user-1', email: 'new@test.com' };
      const mockSession = {
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };

      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      mockDb.insert.mockReturnValue(mockDb);
      mockDb.values.mockReturnValue(mockDb);

      const result = await service.register({
        email: 'new@test.com',
        password: 'password123',
        full_name: 'New User',
      });

      expect(result.access_token).toBe('access-token');
      expect(result.user!.email).toBe('new@test.com');
      expect(result.user!.full_name).toBe('New User');
      expect(result.user!.role).toBe('user');
      // Public register must never elevate privileges.
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user' }),
      );
      expect(mockDb.values).not.toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
      );
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

    it('should return message when sign in fails after registration', async () => {
      const mockUser = { id: 'new-user-1', email: 'new@test.com' };

      mockSupabaseAdmin.auth.admin.createUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockSupabaseAnon.auth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Sign in failed' },
      });

      mockDb.values.mockReturnValue(mockDb);

      const result = await service.register({
        email: 'new@test.com',
        password: 'password123',
        full_name: 'New User',
      });

      expect(result.message).toBe('Account created. Please sign in with your credentials.');
      expect(result.id).toBe('new-user-1');
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
    it('should return success message on logout', async () => {
      mockSupabaseAnon.auth.signOut.mockResolvedValue({ error: null });

      const result = await service.logout({ refresh_token: 'any-token' });

      expect(result.message).toBe('Logged out successfully');
    });

    it('should throw InternalServerErrorException on signOut error', async () => {
      mockSupabaseAnon.auth.signOut.mockResolvedValue({
        error: { message: 'Sign out failed' },
      });

      await expect(
        service.logout({ refresh_token: 'any-token' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});