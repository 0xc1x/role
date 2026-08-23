/**
 * Native stub: push tokens are handled by expo-notifications in
 * `syncDeviceToken`. This file only exists so the platform-split
 * import (`./web-push.web` vs `./web-push.native`) typechecks.
 */
export async function syncWebPushToken(_userId: string): Promise<boolean> {
	return false;
}
