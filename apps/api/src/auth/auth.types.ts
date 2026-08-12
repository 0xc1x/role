import type { AppRole } from '@0xc1x/role-commons';

export interface AuthUser {
  id: string;
  email: string | null;
  role: AppRole;
}
