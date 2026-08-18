import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createSecretKey } from 'node:crypto';
import { SignJWT } from 'jose';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { Env } from '../config/env.schema';

const SUPABASE_URL = 'https://test.supabase.co';
const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const ISS = `${SUPABASE_URL}/auth/v1`;

async function signHs256Token(
  claims: { sub: string; email?: string; exp?: number | string },
  opts?: { omitExp?: boolean; badIss?: boolean; badAud?: boolean },
): Promise<string> {
  const key = createSecretKey(Buffer.from(JWT_SECRET, 'utf8'));
  let jwt = new SignJWT({
    email: claims.email ?? 'user@test.com',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer(opts?.badIss ? 'https://evil.example/auth/v1' : ISS)
    .setAudience(opts?.badAud ? 'anon' : 'authenticated');

  if (!opts?.omitExp) {
    jwt = jwt.setExpirationTime(claims.exp ?? '1h');
  }

  return jwt.sign(key);
}

function mockExecutionContext(authorization?: string) {
  const request: {
    headers: { authorization?: string };
    user?: unknown;
  } = {
    headers: authorization ? { authorization } : {},
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
    /** Expose request for assertions */
    _request: request,
  } as any;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;
  let db: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };

  beforeEach(() => {
    reflector = new Reflector();
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'SUPABASE_URL') return SUPABASE_URL;
        if (key === 'SUPABASE_JWT_SECRET') return JWT_SECRET;
        return undefined;
      }),
    } as unknown as ConfigService;

    db = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
    };

    guard = new AuthGuard(
      reflector,
      config as unknown as ConfigService<Env, true>,
      db as any,
    );
  });

  it('allows public routes without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = mockExecutionContext();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      expect.anything(),
      expect.anything(),
    ]);
  });

  it('rejects missing Authorization header on protected routes', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = mockExecutionContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects non-Bearer Authorization', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = mockExecutionContext('Basic abc');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects empty Bearer token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = mockExecutionContext('Bearer   ');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects invalid JWT', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = mockExecutionContext('Bearer not-a-jwt');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token with wrong issuer', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const token = await signHs256Token({ sub: 'user-1' }, { badIss: true });
    const ctx = mockExecutionContext(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects token with wrong audience', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const token = await signHs256Token({ sub: 'user-1' }, { badAud: true });
    const ctx = mockExecutionContext(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when profile is not found', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const token = await signHs256Token({ sub: 'missing-user' });
    db.limit.mockResolvedValueOnce([]);
    const ctx = mockExecutionContext(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Profile not found/i);
  });

  it('attaches user from profile on valid HS256 token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const token = await signHs256Token({
      sub: 'user-1',
      email: 'from-token@test.com',
    });
    db.limit.mockResolvedValueOnce([
      {
        id: 'user-1',
        email: 'profile@test.com',
        role: 'user',
      },
    ]);

    const ctx = mockExecutionContext(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(ctx._request.user).toEqual({
      id: 'user-1',
      email: 'profile@test.com',
      role: 'user',
    });
  });

  it('uses cached profile on second request for same sub', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const token = await signHs256Token({ sub: 'user-1' });
    db.limit.mockResolvedValueOnce([
      { id: 'user-1', email: 'p@test.com', role: 'business' },
    ]);

    const ctx1 = mockExecutionContext(`Bearer ${token}`);
    await guard.canActivate(ctx1);
    expect(db.limit).toHaveBeenCalledTimes(1);

    const ctx2 = mockExecutionContext(`Bearer ${token}`);
    await guard.canActivate(ctx2);
    expect(db.limit).toHaveBeenCalledTimes(1);
    expect(ctx2._request.user).toMatchObject({
      id: 'user-1',
      role: 'business',
    });
  });

  it('rejects expired token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const token = await signHs256Token({
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const ctx = mockExecutionContext(`Bearer ${token}`);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
