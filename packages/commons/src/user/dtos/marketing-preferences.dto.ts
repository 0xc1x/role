import type { z } from "zod";
import type {
	MarketingPreferencesSchema,
	MeMarketingPreferencesSchema,
	UpdateMyMarketingPreferencesSchema,
} from "../schemas/marketing-preferences.schema";

export type MarketingPreferencesDto = z.infer<
	typeof MarketingPreferencesSchema
>;
export type MeMarketingPreferencesDto = z.infer<
	typeof MeMarketingPreferencesSchema
>;
export type UpdateMyMarketingPreferencesDto = z.infer<
	typeof UpdateMyMarketingPreferencesSchema
>;
