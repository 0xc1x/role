import { supabase } from "@/src/core/supabase/client";

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
	const { error } = await supabase.from("device_tokens").upsert(
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
 * Borra todos los tokens del usuario (logout, push desactivado).
 *
 * Lanza el PostgrestError crudo cuando la API no confirma el borrado. Es
 * deliberado: el write-ahead de `pending-revocation` solo sirve si el fallo
 * es visible, y supabase-js NO lanza — un `DELETE` denegado por RLS resuelve
 * con `{ error }` y sin excepción, así que un llamador que ignorara el
 * resultado borraría su registro de reintento y dejaría el token vivo para
 * siempre, que es exactamente el defecto que el registro existe para evitar.
 * Los llamadores que no pueden bloquear (el logout) ya ignoran el fallo.
 */
export async function deleteDeviceTokens(userId: string): Promise<void> {
	const { error } = await supabase
		.from("device_tokens")
		.delete()
		.eq("user_id", userId);
	if (error) throw error;
}
