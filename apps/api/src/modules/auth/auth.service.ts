import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import type { Env } from '../../config/env.schema';
import { type Database } from '../../database/database.module';
import { DRIZZLE } from '../../database/database.tokens';
import { profiles } from '../../database/schema';
import type { LoginRequest, RegisterRequest, RefreshRequest, LogoutRequest } from '@0xc1x/role-commons';

@Injectable()
export class AuthService {
  private supabaseAnon;
  private supabaseAdmin;

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Inject(DRIZZLE) private readonly db: Database,
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

    const [profile] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

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
      email_confirm: true,
    });

    if (error) {
      if (error.message?.includes('already')) {
        throw new ConflictException('Email is already registered');
      }
      throw new InternalServerErrorException(error.message);
    }

    const user = data.user;

    await this.db.insert(profiles).values({
      id: user.id,
      email: body.email,
      full_name: body.full_name,
      role: 'user',
    });

    const { data: signInData, error: signInError } =
      await this.supabaseAnon.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

    if (signInError || !signInData.session) {
      return {
        id: user.id,
        email: body.email,
        message:
          'Account created. Please sign in with your credentials.',
      };
    }

    const session = signInData.session;

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
      user: {
        id: user.id,
        email: body.email,
        full_name: body.full_name,
        avatar_url: null,
        role: 'user' as const,
      },
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

    const [profile] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        full_name: profiles.full_name,
        avatar_url: profiles.avatar_url,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);

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

  async logout(_body: LogoutRequest): Promise<{ message: string }> {
    // Refresh/access tokens are client-held; global signOut clears server session cookies if any.
    void _body;
    const { error } = await this.supabaseAnon.auth.signOut({
      scope: 'global',
    });

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return { message: 'Logged out successfully' };
  }
}
