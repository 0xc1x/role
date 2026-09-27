import type { z } from "zod";
import type { UpdateConsumerNotificationPreferencesSchema } from "../schemas/consumer-notification-preferences.schema";
import type {
	MeAccountSchema,
	MeNotificationPreferencesSchema,
	MePreferencesSchema,
	RegisterMyDeviceSchema,
	UpdateMyPreferencesSchema,
	UpdateMyProfileSchema,
	UpsertMyConsentSchema,
} from "../schemas/me.schema";

export type MeAccountDto = z.infer<typeof MeAccountSchema>;
export type MePreferencesDto = z.infer<typeof MePreferencesSchema>;
export type MeNotificationPreferencesDto = z.infer<
	typeof MeNotificationPreferencesSchema
>;
export type UpdateMyProfileDto = z.infer<typeof UpdateMyProfileSchema>;
export type UpdateMyPreferencesDto = z.infer<typeof UpdateMyPreferencesSchema>;
export type UpdateMyNotificationPreferencesDto = z.infer<
	typeof UpdateConsumerNotificationPreferencesSchema
>;
export type UpsertMyConsentDto = z.infer<typeof UpsertMyConsentSchema>;
export type RegisterMyDeviceDto = z.infer<typeof RegisterMyDeviceSchema>;
