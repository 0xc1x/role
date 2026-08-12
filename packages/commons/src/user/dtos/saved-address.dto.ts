import type { z } from 'zod';
import type {
  CreateSavedAddressSchema,
  SavedAddressSchema,
  UpdateSavedAddressSchema,
} from '../schemas/saved-address.schema';

export type SavedAddressDto = z.infer<typeof SavedAddressSchema>;
export type CreateSavedAddressDto = z.infer<typeof CreateSavedAddressSchema>;
export type UpdateSavedAddressDto = z.infer<typeof UpdateSavedAddressSchema>;
