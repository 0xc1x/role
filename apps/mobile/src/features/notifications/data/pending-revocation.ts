import AsyncStorage from "@react-native-async-storage/async-storage";

import { deleteDeviceTokens } from "./repository";

/**
 * Revocación de token push pendiente, para reintentar tras un logout fallido.
 *
 * POR QUÉ EXISTE: si el `DELETE` de `device_tokens` falla durante el cierre de
 * sesión, la fila sobrevive a la sesión cerrada y Supabase sigue entregando
 * push a un dispositivo sin sesión — un defecto de privacidad y de ciclo de
 * vida de datos, no una pérdida de observabilidad. "Cerrar sesión igual" sigue
 * siendo lo correcto (el logout nunca se bloquea), pero la revocación no puede
 * abandonarse en silencio: se registra antes de tocar la red (write-ahead) y se
 * reintenta en el próximo arranque.
 *
 * POR QUÉ UNA sola clave y no una por usuario: RLS solo permite borrar los
 * tokens del usuario autenticado (`auth.uid() = user_id`), así que el reintento
 * solo es válido con la sesión de ese mismo usuario. Como el logout destruye
 * esa sesión, no puede haber más de una revocación viva a la vez; una clave por
 * usuario solo acumularía registros que nunca podrían drenarse.
 */
const STORAGE_KEY = "role.pending-device-token-revocation.v1";

interface PendingRevocation {
	userId: string;
}

/** Evita dos drenados concurrentes sobre la misma clave (doble `DELETE`). */
let draining = false;

function parse(raw: string): string | null {
	try {
		const pending = JSON.parse(raw) as PendingRevocation;
		return typeof pending?.userId === "string" && pending.userId.length > 0
			? pending.userId
			: null;
	} catch {
		// Payload corrupto: no hay nada reintentable, se descarta.
		return null;
	}
}

async function read(): Promise<string | null> {
	const raw = await AsyncStorage.getItem(STORAGE_KEY);
	if (raw === null) return null;
	const userId = parse(raw);
	if (userId === null) await AsyncStorage.removeItem(STORAGE_KEY);
	return userId;
}

export const pendingDeviceTokenRevocationRepository = {
	/**
	 * Write-ahead: registra la intención de revocar ANTES de llamar a la API.
	 * Un corte a mitad del logout deja el registro y el siguiente arranque lo
	 * drena; al revés, un registro posterior a la llamada perdería la revocación
	 * si el proceso muriera entre ambas.
	 */
	async schedule(userId: string): Promise<void> {
		const pending: PendingRevocation = { userId };
		await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
	},

	async clear(): Promise<void> {
		await AsyncStorage.removeItem(STORAGE_KEY);
	},

	/**
	 * Revoca los tokens del usuario autenticado y borra el registro solo si la
	 * API lo confirma. Ante fallo devuelve `false` y conserva el registro: el
	 * logout ya se completó y el siguiente arranque autenticado reintenta.
	 */
	async drain(authenticatedUserId: string): Promise<boolean> {
		if (draining) return false;
		const userId = await read();
		if (userId === null || userId !== authenticatedUserId) return false;

		draining = true;
		try {
			await deleteDeviceTokens(userId);
			await AsyncStorage.removeItem(STORAGE_KEY);
			return true;
		} catch {
			return false;
		} finally {
			draining = false;
		}
	},
};
