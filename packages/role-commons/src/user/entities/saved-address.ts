import type { AddressType } from '../../_common/enums/address-type';

/** Row shape for `public.saved_addresses` */
export interface SavedAddress {
  id: string;
  user_id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
  type: AddressType;
  references: string | null;
  housing_type: string | null;
  created_at: string;
  updated_at: string;
}
