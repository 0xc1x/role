/** Row shape for `public.business_notification_preferences` */
export interface BusinessNotificationPreferences {
  business_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  new_orders_enabled: boolean;
  pickup_ready_enabled: boolean;
  reviews_enabled: boolean;
  low_stock_enabled: boolean;
  daily_summary_enabled: boolean;
  /** `HH:MM:SS` time string */
  quiet_hours_from: string | null;
  /** `HH:MM:SS` time string */
  quiet_hours_to: string | null;
  created_at: string;
  updated_at: string;
}
