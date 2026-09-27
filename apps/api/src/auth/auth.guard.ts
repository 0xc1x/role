import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import type { AppRole } from '@0xc1x/role-commons';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { type Database } from '../database/database.module';
import { DRIZZLE } from '../database/database.tokens';
import { profiles } from '../database/schema';
import type { AuthUser } from './auth.types';
import { SupabaseTokenVerifier } from './supabase-token-verifier';

interface ProfileCacheEntry {
  profile: { id: string; email: string | null; role: AppRole };
  expiresAt: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
  protected readonly reflector: Reflector;
  private readonly profileCache = new Map<string, ProfileCacheEntry>();
  private readonly cacheTtl = 30000; // 30 seconds

  constructor(
    reflector: Reflector,
    // The JWT parsing itself is not here: `SupabaseTokenVerifier` owns it, so the
    // recovery token `POST /auth/reset-password` verifies cannot drift away from
    // the token every protected route accepts.
    private readonly verifier: SupabaseTokenVerifier,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {
    this.reflector = reflector;
  }

  /** Cache con techo: purga expirados y, si sigue lleno, reinicia. */
  private setCachedProfile(sub: string, entry: ProfileCacheEntry): void {
    if (this.profileCache.size >= 500) {
      const now = Date.now();
      for (const [key, value] of this.profileCache) {
        if (value.expiresAt <= now) this.profileCache.delete(key);
      }
      if (this.profileCache.size >= 500) this.profileCache.clear();
    }
    this.profileCache.set(sub, entry);
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
      throw new UnauthorizedException(
        'Missing or invalid Authorization header',
      );
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    const { sub, email } = await this.verifier.verify(token);

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
      throw new UnauthorizedException(
        'Profile not found for authenticated user',
      );
    }

    // Cache the profile (con techo: evita crecimiento sin límite)
    this.setCachedProfile(sub, {
      profile: {
        id: profile.id,
        email: profile.email,
        role: profile.role,
      },
      expiresAt: Date.now() + this.cacheTtl,
    });

    request.user = {
      id: profile.id,
      email: profile.email ?? email,
      role: profile.role,
    };

    return true;
  }
}
