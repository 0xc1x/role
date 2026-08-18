import type { BusinessNotificationPreferences } from "@0xc1x/role-commons";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";

import { DEFAULT_BUSINESS_NOTIFICATION_PREFS } from "../domain/business";

/** Business-side notification preference repository. */
export const notificationRepository = {
	async getPreferences(
		businessId: string,
	): Promise<BusinessNotificationPreferences> {
		const { data, error } = await supabase
			.from("business_notification_preferences")
			.select("*")
			.eq("business_id", businessId)
			.maybeSingle();
		if (error)
			throw toAppError(error, "Error al cargar preferencias de notificación");
		if (!data)
			return {
				...DEFAULT_BUSINESS_NOTIFICATION_PREFS,
				business_id: businessId,
			};
		return {
			...DEFAULT_BUSINESS_NOTIFICATION_PREFS,
			...(data as unknown as BusinessNotificationPreferences),
		};
	},

	async updatePreferences(
		businessId: string,
		prefs: Partial<BusinessNotificationPreferences>,
	): Promise<void> {
		const { error } = await supabase
			.from("business_notification_preferences")
			.upsert(
				{ business_id: businessId, ...prefs },
				{ onConflict: "business_id" },
			);
		if (error)
			throw toAppError(error, "Error al guardar preferencias de notificación");
	},
};
