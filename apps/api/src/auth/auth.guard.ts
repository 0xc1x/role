import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createSecretKey } from 'node:crypto';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import type { AppRole } from '@0xc1x/role-commons';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type { Env } from '../config/env.schema';
import { type Database } from '../database/database.module';
import { DRIZZLE } from '../database/database.tokens';
import { profiles } from '../database/schema';
import type { AuthUser } from './auth.types';

interface ProfileCacheEntry {
  profile: { id: string; email: string | null; role: AppRole };
  expiresAt: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
  protected readonly reflector: Reflector;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly profileCache = new Map<string, ProfileCacheEntry>();
  private readonly cacheTtl = 30000; // 30 seconds

  constructor(
    reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {
    this.reflector = reflector;
    const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true });
    this.jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthUser;
    }>();

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    let sub: string;
    let email: string | null = null;

    try {
      const { alg } = decodeProtectedHeader(token);

      let payload: { sub?: string; email?: string; user_email?: string; iss?: string; aud?: string | string[]; exp?: number };

      const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true });
      const expectedIss = `${supabaseUrl}/auth/v1`;
      const expectedAud = 'authenticated';

      if (alg === 'HS256') {
        const secret = this.config.get('SUPABASE_JWT_SECRET', { infer: true });
        const key = createSecretKey(Buffer.from(secret, 'utf8'));
        const result = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          issuer: expectedIss,
          audience: expectedAud,
        });
        payload = result.payload;
      } else {
        const result = await jwtVerify(token, this.jwks, {
          algorithms: ['ES256'],
          issuer: expectedIss,
          audience: expectedAud,
        });
        payload = result.payload;
      }

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid token subject');
      }
      if (!payload.exp || typeof payload.exp !== 'number') {
        throw new UnauthorizedException('Token missing expiration');
      }
      if (payload.exp * 1000 < Date.now()) {
        throw new UnauthorizedException('Token expired');
      }
      sub = payload.sub;
      email =
        typeof payload.email === 'string'
          ? payload.email
          : typeof payload.user_email === 'string'
            ? payload.user_email
            : null;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // Check cache first
    const cached = this.profileCache.get(sub);
    if (cached && cached.expiresAt > Date.now()) {
      request.user = {
        id: cached.profile.id,
        email: cached.profile.email ?? email,
        role: cached.profile.role,
      };
      return true;
    }

    const [profile] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, sub))
      .limit(1);

    if (!profile) {
      throw new UnauthorizedException('Profile not found for authenticated user');
    }

    // Cache the profile
    this.profileCache.set(sub, {
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role as AppRole,
      },
      expiresAt: Date.now() + this.cacheTtl,
    });

    request.user = {
      id: profile.id,
      email: profile.email ?? email,
      role: profile.role as AppRole,
    };

    return true;
  }
}
