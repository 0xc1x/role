/** Row shape for `public.consumer_notification_preferences` */
export interface ConsumerNotificationPreferences {
  user_id: string;
  push_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  whatsapp_enabled: boolean;
  favorite_alerts_enabled: boolean;
  pickup_reminders_enabled: boolean;
  last_minute_deals_enabled: boolean;
  weekly_summary_enabled: boolean;
  /** `HH:MM:SS` time string */
  quiet_hours_from: string | null;
  /** `HH:MM:SS` time string */
  quiet_hours_to: string | null;
  created_at: string;
  updated_at: string;
}
