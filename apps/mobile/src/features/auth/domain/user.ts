import { AppRole } from '@0xc1x/role-commons';

export type UserRole = AppRole;

/** Parses a role string defensively. */
export function parseRole(value: string | null | undefined): UserRole {
  if (value === 'business') return 'business';
  if (value === 'admin') return 'admin';
  return 'user';
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  city: string | null;
  role: UserRole;
  analyticsConsentGranted: boolean;
}
