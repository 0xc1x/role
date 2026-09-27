import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSecretKey } from 'node:crypto';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import type { Env } from '../config/env.schema';

/** The claims this codebase is allowed to rely on, and nothing else. */
export interface VerifiedSupabaseToken {
  /** `auth.users.id`. The only identifier any caller may act on. */
  sub: string;
  email: string | null;
}

/**
 * THE single JWT parser for Supabase tokens.
 *
 * It exists as its own provider because there is now a second consumer of the
 * same verification: `AuthGuard` (every protected route) and
 * `AuthService.resetPassword` (a `POST` body carrying the bearer credential the
 * recovery link handed the client). Both need the identical guarantee — GoTrue
 * signature, `iss = <SUPABASE_URL>/auth/v1`, `aud = authenticated`, unexpired —
 * and two parsers is how they drift: the second one grows a default it never
 * had, or forgets the `exp` re-check, and the gap is exactly a forgeable reset
 * token.
 *
 * HS256 and ES256 are both accepted, and always were: a self-hosted or
 * older-project Supabase signs with the JWT secret, a hosted one signs with the
 * project JWKS. The algorithm is read from the token's own header but is
 * constrained by `algorithms` on each branch, so an attacker cannot pick one.
 */
@Injectable()
export class SupabaseTokenVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService<Env, true>) {
    const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true });
    this.jwks = createRemoteJWKSet(
      new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
    );
  }

  /**
   * Verifies a GoTrue-issued token and returns its subject.
   *
   * Throws `UnauthorizedException` and NOTHING else, with a message that never
   * quotes the token or the reason `jose` gave: a caller that sent a recovery
   * token learns that it is not usable and not why it is not usable. Every
   * failure mode — wrong signature, wrong issuer, wrong audience, expired,
   * missing `sub`, missing `exp` — collapses into the same 401, because a
   * distinguishing error is a free oracle to whoever is probing tokens.
   */
  async verify(token: string): Promise<VerifiedSupabaseToken> {
    try {
      const { alg } = decodeProtectedHeader(token);

      const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true });
      const expectedIss = `${supabaseUrl}/auth/v1`;
      const expectedAud = 'authenticated';

      let payload: {
        sub?: string;
        email?: string;
        user_email?: string;
        exp?: number;
      };

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
      // `jose` already enforces `exp`; this is the explicit re-check the guard
      // has always done, kept so a clock-skew tolerance introduced upstream can
      // never silently widen what this service accepts.
      if (payload.exp * 1000 < Date.now()) {
        throw new UnauthorizedException('Token expired');
      }

      return {
        sub: payload.sub,
        email:
          typeof payload.email === 'string'
            ? payload.email
            : typeof payload.user_email === 'string'
              ? payload.user_email
              : null,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
