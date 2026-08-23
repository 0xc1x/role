import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type PropsWithChildren,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { colorTokens, type ColorTokens, type ThemeScheme } from "./colors";
export { colorTokens, light, dark } from "./colors";

export type ThemeMode = "light" | "dark" | "system";

const THEME_MODE_KEY = "role.themeMode";

interface ThemeContextValue {
	/** Resolved scheme ('light' | 'dark') */
	scheme: ThemeScheme;
	/** User preference ('light' | 'dark' | 'system') */
	mode: ThemeMode;
	colors: ColorTokens;
	setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

async function loadPersistedMode(): Promise<ThemeMode> {
	try {
		const raw = await AsyncStorage.getItem(THEME_MODE_KEY);
		if (raw === "light" || raw === "dark" || raw === "system") return raw;
	} catch {
		// Storage unavailable — fall back to system.
	}
	return "system";
}

export function ThemeProvider({ children }: PropsWithChildren) {
	const systemScheme: ThemeScheme =
		useColorScheme() === "dark" ? "dark" : "light";
	const [mode, setModeState] = useState<ThemeMode>("system");
	const [hydrated, setHydrated] = useState(false);

	// Hydrate the persisted preference once on mount.
	useEffect(() => {
		void loadPersistedMode().then((m) => {
			setModeState(m);
			setHydrated(true);
		});
	}, []);

	// Sincroniza la clase .dark para Tailwind/NativeWind en web (global.css usa :root/.dark, no media query)
	useEffect(() => {
		if (typeof document === "undefined") return;
		const resolved: ThemeScheme = mode === "system" ? systemScheme : mode;
		document.documentElement.classList.toggle("dark", resolved === "dark");
		// actualiza color-scheme para scrollbars/form controls nativos
		document.documentElement.style.colorScheme = resolved;
	}, [mode, systemScheme]);

	const setMode = useCallback((next: ThemeMode) => {
		setModeState(next);
		void AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {});
	}, []);

	const scheme: ThemeScheme = mode === "system" ? systemScheme : mode;

	const value = useMemo<ThemeContextValue>(
		() => ({
			scheme,
			mode,
			colors: colorTokens[scheme],
			setMode,
		}),
		[scheme, mode, setMode],
	);

	if (!hydrated) {
		// Render nothing until the preference is loaded to avoid a
		// light/dark flash on startup.
		return null;
	}

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): ThemeContextValue {
	const ctx = useContext(ThemeContext);
	if (!ctx) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return ctx;
}
