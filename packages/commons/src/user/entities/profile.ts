import type { AppRole } from '../../_common/enums/app-role';

/** Row shape for `public.profiles` */
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: AppRole;
  city: string | null;
  created_at: string;
  updated_at: string;
}
