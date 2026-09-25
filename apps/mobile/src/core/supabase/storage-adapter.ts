export interface SessionStorage {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
}

type WebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface SecureStoreAdapter {
	getItemAsync: (key: string) => Promise<string | null>;
	setItemAsync: (key: string, value: string) => Promise<void>;
	deleteItemAsync: (key: string) => Promise<void>;
}

/** Web keeps the existing browser session behavior and remains SSR-safe. */
export function createWebStorage(storage?: WebStorage | null): SessionStorage {
	return {
		async getItem(key) {
			if (!storage) return null;
			try {
				return storage.getItem(key);
			} catch {
				return null;
			}
		},
		async setItem(key, value) {
			try {
				storage?.setItem(key, value);
			} catch {
				// Browsers can deny localStorage in private/restricted contexts.
			}
		},
		async removeItem(key) {
			try {
				storage?.removeItem(key);
			} catch {
				// A denied storage backend should not break sign-out.
			}
		},
	};
}

/** Native auth sessions belong in the platform keychain, never AsyncStorage. */
export function createNativeStorage(
	secureStore: SecureStoreAdapter,
): SessionStorage {
	return {
		getItem: (key) => secureStore.getItemAsync(key),
		setItem: (key, value) => secureStore.setItemAsync(key, value),
		removeItem: (key) => secureStore.deleteItemAsync(key),
	};
}
