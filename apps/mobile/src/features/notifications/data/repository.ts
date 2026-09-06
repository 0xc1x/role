import { supabase } from "@/core/supabase/client";

export type DeviceTokenPlatform = "ios" | "android" | "web";

/**
 * Upsert idempotente del token de push del usuario (conflicto por `token`).
 * Lanza el PostgrestError crudo: el llamador decide el copy y trata
 * `23505` (token ya registrado) como éxito.
 */
export async function upsertDeviceToken(
	userId: string,
	token: string,
	platform: DeviceTokenPlatform,
): Promise<void> {
	const { error } = await supabase
		.from("device_tokens")
		.upsert(
			{
				user_id: userId,
				token,
				platform,
				is_active: true,
			},
			{ onConflict: "token" },
		);
	if (error) throw error;
}

/**
 * Borra todos los tokens del usuario (logout). Sin check de error: el
 * logout nunca se bloquea por esto (el llamador ya ignora fallos).
 */
export async function deleteDeviceTokens(userId: string): Promise<void> {
	await supabase.from("device_tokens").delete().eq("user_id", userId);
}
