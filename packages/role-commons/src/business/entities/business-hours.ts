import type { DayOfWeek } from '../../_common/enums/day-of-week';

/** Row shape for `public.business_hours` */
export interface BusinessHours {
  id: string;
  business_id: string;
  day: DayOfWeek;
  /** `HH:MM:SS` time string */
  open_time: string;
  /** `HH:MM:SS` time string */
  close_time: string;
  is_closed: boolean;
  created_at: string;
  updated_at: string;
}
