import type { z } from 'zod';
import type {
  CreateDeviceTokenSchema,
  DeviceTokenSchema,
  UpdateDeviceTokenSchema,
} from '../schemas/device-token.schema';

export type DeviceTokenDto = z.infer<typeof DeviceTokenSchema>;
export type CreateDeviceTokenDto = z.infer<typeof CreateDeviceTokenSchema>;
export type UpdateDeviceTokenDto = z.infer<typeof UpdateDeviceTokenSchema>;
