import type { z } from "zod";
import type {
	BusinessSubscriptionSchema,
	UpdateBusinessSubscriptionSchema,
} from "../schemas/business-subscription.schema";
import type { SubscriptionPlanSchema } from "../schemas/subscription-plan.schema";

export type SubscriptionPlanDto = z.infer<typeof SubscriptionPlanSchema>;
export type BusinessSubscriptionDto = z.infer<
	typeof BusinessSubscriptionSchema
>;
export type UpdateBusinessSubscriptionDto = z.infer<
	typeof UpdateBusinessSubscriptionSchema
>;
