import type { z } from "zod";
import type { MarketingPreferencesSchema } from "../schemas/marketing-preferences.schema";

/** Row shape for `public.marketing_preferences` — derivado del schema Zod (SSOT). */
export type MarketingPreferences = z.infer<typeof MarketingPreferencesSchema>;
