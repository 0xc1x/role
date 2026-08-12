/** Row shape for `public.user_preferences` */
export interface UserPreferences {
  id: string;
  user_id: string;
  notification_radius_km: number | null;
  favorite_categories: string[] | null;
  language: string | null;
  theme_mode: string;
  created_at: string;
  updated_at: string;
}
