import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { safeErrorFields } from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { profiles } from '../../database/schema';
import {
  UserDefaultsService,
  type SeedUserDefaultsInput,
} from '../users/user-defaults.service';
import type {
  LoginRequest,
  RegisterRequest,
  RefreshRequest,
  LogoutRequest,
} from '@0xc1x/role-commons';

/** Columns of the session user that the login response is built from. */
type SessionProfile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'business' | 'admin';
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private supabaseAnon;
  private supabaseAdmin;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly userDefaults: UserDefaultsService,
  ) {
    const url = this.config.get('SUPABASE_URL', { infer: true });
    const anonKey = this.config.get('SUPABASE_ANON_KEY', { infer: true });
    const serviceRoleKey = this.config.get('SUPABASE_SERVICE_ROLE_KEY', {
      infer: true,
    });

    this.supabaseAnon = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    this.supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  async login(body: LoginRequest) {
    const { data, error } = await this.supabaseAnon.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) {
      if (error.status === 400) {
        throw new UnauthorizedException('Invalid email or password');
      }
      throw new InternalServerErrorException(error.message);
    }

    const user = data.user;
    const session = data.session;

    const profile = await this.resolveProfile(user);

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      user: profile
        ? {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            role: profile.role,
          }
        : {
            id: user.id,
            email: user.email,
            full_name: null,
            avatar_url: null,
            role: 'user' as const,
          },
    };
  }

  async register(body: RegisterRequest) {
    const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      // Verificación por email: sin confirmar no hay sesión. El API siembra los
      // defaults del usuario (perfil, preferencias y consents) justo después,
      // espejo idempotente de los triggers de Supabase (ADR-0008 fase 1.5).
      email_confirm: false,
      user_metadata: { full_name: body.full_name },
    });

    if (error) {
      if (error.message?.includes('already')) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException(error.message);
    }

    // Best-effort, and deliberately NOT compensated: the auth user already
    // exists and its confirmation email may be on its way, so a transient
    // database error must not turn into a 500 that invites the caller to
    // register again (or, worse, a deleted account). The account is repaired
    // on its first successful login by `resolveProfile`.
    await this.seedUserDefaults(
      { id: data.user.id, email: body.email, fullName: body.full_name },
      'register',
    );

    return {
      id: data.user.id,
      email: data.user.email,
      message: 'Account created. Please confirm your email and sign in.',
    };
  }

  async refresh(body: RefreshRequest) {
    const { data, error } = await this.supabaseAnon.auth.refreshSession({
      refresh_token: body.refresh_token,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const session = data.session;
    const user = data.user;

    const profile = await this.findProfile(user.id);

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      user: profile
        ? {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            avatar_url: profile.avatar_url,
            role: profile.role,
          }
        : {
            id: user.id,
            email: user.email ?? '',
            full_name: null,
            avatar_url: null,
            role: 'user' as const,
          },
    };
  }

  async logout(body: LogoutRequest): Promise<{ message: string }> {
    // Revocación real: intercambia el refresh por un access y pide a GoTrue
    // cerrar esa sesión (scope local). Un refresh ya revocado o expirado no
    // es un error de logout (idempotente).
    if (body.refresh_token) {
      const { data, error } = await this.supabaseAnon.auth.refreshSession({
        refresh_token: body.refresh_token,
      });

      if (!error && data.session) {
        const { error: signOutError } =
          await this.supabaseAdmin.auth.admin.signOut(
            data.session.access_token,
            'local',
          );
        if (signOutError) {
          throw new InternalServerErrorException(signOutError.message);
        }
      }
    }

    return { message: 'Logged out successfully' };
  }

  private async findProfile(
    userId: string,
  ): Promise<SessionProfile | undefined> {
    const [profile] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return profile;
  }

  /**
   * Profile of a signing-in user, repairing the account when the row is
   * missing.
   *
   * Self-healing seam for ADR-0008 phase 1.5: the profile used to be created
   * atomically inside the `auth.users` INSERT, by the trigger. Seeding it from
   * the API is a separate step, so a failure can leave an auth user with no
   * profile — and `AuthGuard` answers 401 to every protected route for an
   * account that has no profile, which is a permanent lockout.
   *
   * The repair is the alternative to deleting the auth user on failure: a
   * transient database error would destroy an account whose confirmation email
   * may already have been sent, and the caller cannot retry a registration that
   * already returned 201. Re-running the same idempotent seeding makes a
   * registration whose seeding failed indistinguishable, on the next sign-in
   * attempt, from one the trigger provisioned.
   *
   * Repair failures stay swallowed: login keeps returning its session with the
   * documented `role: 'user'` fallback instead of a 500, and the next sign-in
   * tries again.
   */
  private async resolveProfile(user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    user_metadata?: Record<string, unknown> | null;
  }): Promise<SessionProfile | undefined> {
    const profile = await this.findProfile(user.id);
    if (profile) return profile;

    // The metadata is read the way the trigger read it: the auth user's own
    // `raw_user_meta_data`, allowlisted inside the seeder (`admin` can never
    // land from metadata).
    const metadata = user.user_metadata ?? {};
    await this.seedUserDefaults(
      {
        id: user.id,
        // GoTrue allows an email-less (phone) user; the trigger would have hit
        // the NOT NULL on profiles.email there, and a profile row with an empty
        // email still beats an account that 401s forever.
        email: user.email ?? '',
        fullName:
          typeof metadata.full_name === 'string' ? metadata.full_name : null,
        avatarUrl:
          typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
        phone: user.phone ?? null,
        requestedRole: typeof metadata.role === 'string' ? metadata.role : null,
      },
      'login',
    );

    return this.findProfile(user.id);
  }

  /**
   * Seeds the user defaults and never throws. The auth user exists by the time
   * this runs, so the only honest reaction to a database failure is to log it:
   * the account is repaired on the next successful login.
   *
   * `docs/operations.md` bans raw error messages in logs, hence
   * `safeErrorFields` (name/type only) and no email in the payload.
   */
  private async seedUserDefaults(
    input: SeedUserDefaultsInput,
    flow: 'register' | 'login',
  ): Promise<void> {
    try {
      await this.userDefaults.seed(input);
    } catch (err) {
      this.logger.error({
        event: 'user_defaults_seeding_failed',
        flow,
        userId: input.id,
        ...safeErrorFields(err),
      });
    }
  }
}
