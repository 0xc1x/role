/** Row shape for `public.user_consents` */
export interface UserConsent {
  id: string;
  user_id: string;
  consent_type: string;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}
