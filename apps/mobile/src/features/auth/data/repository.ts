import { supabase } from '@/core/supabase/client';
import { Errors } from '@/core/error/app-error';

import type { UserProfile } from '../domain/user';
import { parseRole } from '../domain/user';

export interface SignUpResult {
  requiresEmailConfirmation: boolean;
  profile: UserProfile | null;
}

/**
 * Auth data operations against Supabase Auth.
 */
export const authRepository = {
  async signInWithEmail(email: string, password: string): Promise<UserProfile> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw mapAuthError(error);
    const user = data.user;
    if (!user) throw Errors.unauthorized('No se pudo iniciar sesión con esas credenciales');
    return profileFromUser(user);
  },

  async signUpWithEmail(input: {
    fullName: string;
    email: string;
    password: string;
    role: 'user' | 'business';
    analyticsConsentGranted: boolean;
  }): Promise<SignUpResult> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.fullName,
          role: input.role,
          analytics_consent_granted: input.analyticsConsentGranted,
        },
      },
    });
    if (error) throw mapAuthError(error);
    const user = data.user;
    if (!user) throw Errors.validation('No se pudo crear la cuenta');

    const hasActiveSession = data.session != null;
    if (hasActiveSession && input.analyticsConsentGranted) {
      await syncAnalyticsConsent(user.id);
    }
    if (!hasActiveSession) return { requiresEmailConfirmation: true, profile: null };
    return { requiresEmailConfirmation: false, profile: profileFromUser(user) };
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  async sendPasswordResetEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        process.env.EXPO_PUBLIC_AUTH_RESET_REDIRECT_URL || undefined,
    });
    if (error) throw mapAuthError(error);
  },

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw mapAuthError(error);
  },

  async updateEmail(email: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ email });
    if (error) throw mapAuthError(error);
  },

  async fetchProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, phone, city, role')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      email: data.email ?? '',
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      phone: data.phone,
      city: data.city,
      role: parseRole(data.role),
      analyticsConsentGranted: false,
    };
  },
};

function profileFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): UserProfile {
  return {
    id: user.id,
    email: user.email ?? '',
    fullName: (user.user_metadata?.full_name as string | null) ?? null,
    avatarUrl: (user.user_metadata?.avatar_url as string | null) ?? null,
    phone: null,
    city: null,
    role: parseRole(user.user_metadata?.role as string | undefined),
    analyticsConsentGranted:
      user.user_metadata?.analytics_consent_granted === true,
  };
}

async function syncAnalyticsConsent(userId: string): Promise<void> {
  const { data } = await supabase
    .from('user_consents')
    .select('granted')
    .eq('user_id', userId)
    .eq('consent_type', 'analytics')
    .maybeSingle();
  if (data?.granted) return;
  await supabase.from('user_consents').upsert({
    user_id: userId,
    consent_type: 'analytics',
    granted: true,
    granted_at: new Date().toISOString(),
  });
}

function mapAuthError(error: { message: string }): Error {
  const message = error.message.toLowerCase();
  if (/invalid login credentials|invalid credentials/.test(message)) {
    return Errors.unauthorized('Correo o contraseña inválidos');
  }
  if (/email not confirmed/.test(message)) {
    return Errors.unauthorized('Debes confirmar tu correo antes de iniciar sesión');
  }
  if (/already registered|already been registered|user already registered/.test(message)) {
    return Errors.conflict('Ese correo ya está registrado');
  }
  if (/session.*expired/.test(message)) {
    return Errors.unauthorized('Tu sesión expiró. Inicia sesión de nuevo.');
  }
  return Errors.unknown(error.message);
}
