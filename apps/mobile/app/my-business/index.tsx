import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	Screen,
	ScreenHeader,
	SectionTitle,
	ThemeOptionCard
} from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { ThemeMode, useTheme } from "@/core/theme";

const THEME_MODES: Array<{ key: ThemeMode; label: string; icon: string }> = [
	{ key: "light", label: strings.settings.light, icon: "sunny-outline" },
	{ key: "dark", label: strings.settings.dark, icon: "moon-outline" },
	{ key: "system", label: strings.settings.system, icon: "phone-portrait-outline" },
];

export default function BusinessProfileScreen() {
	const { mode, setMode } = useTheme();
	const MODES = THEME_MODES;

	return (
		<Screen scroll>
			<View style={styles.container}>
				{/* Hub de configuración: atrás vuelve a Mi negocio si el stack no tiene historia. */}
				<ScreenHeader
					title={strings.settings.title}
					fallback="/(business)/management"
				/>

				<SectionTitle>{strings.settings.appearance}</SectionTitle>
				<View style={styles.themeRow}>
					{MODES.map((m) => (
						<ThemeOptionCard
							key={m.key}
							label={m.label}
							icon={m.icon}
							isSelected={mode === m.key}
							onPress={() => setMode(m.key)}
						/>
					))}
				</View>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	themeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
