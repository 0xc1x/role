import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import {
	createNativeStorage,
	createWebStorage,
	type SessionStorage,
} from "./storage-adapter";

export const supabaseSessionStorage: SessionStorage =
	Platform.OS === "web"
		? createWebStorage(
				typeof globalThis !== "undefined" && "localStorage" in globalThis
					? (globalThis.localStorage as Storage)
					: null,
			)
		: createNativeStorage(SecureStore);
