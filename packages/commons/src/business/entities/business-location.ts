/** Row shape for `public.business_locations` */
export interface BusinessLocation {
  id: string;
  business_id: string;
  name: string;
  address: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  zone: string | null;
  is_headquarter: boolean;
  created_at: string;
  updated_at: string;
}
