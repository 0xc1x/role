import type { Platform } from '../../_common/enums/platform';

/** Row shape for `public.device_tokens` */
export interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
  platform: Platform;
  device_info: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
