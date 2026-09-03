import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, Screen, ScreenHeader, SectionTitle, ThemeOptionCard} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useTheme, type ThemeMode } from "@/core/theme";
import { usePreferences, useUpdatePreferences } from "@/features/profile/hooks";
import { spacing, radii } from "@/core/theme/spacing";

const MODES: Array<{ key: ThemeMode; label: string; icon: string }> = [
	{ key: "light", label: strings.settings.light, icon: "sunny-outline" },
	{ key: "dark", label: strings.settings.dark, icon: "moon-outline" },
	{ key: "system", label: strings.settings.system, icon: "phone-portrait-outline" },
];


function SectionLabel({ children }: { children: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.sectionLabelRow}>
			<AppText
				variant="bodyMedium"
				weight="semiBold"
				style={{ color: colors.foreground }}
			>
				{children}
			</AppText>
		</View>
	);
}

export default function SettingsScreen() {
	const { mode, setMode, colors } = useTheme();
	const { profile, status, initialized } = useAuthStore();
	const userId = profile?.id ?? "";
	const { data: prefs } = usePreferences(userId);
	const updatePrefs = useUpdatePreferences(userId);
	const [radius, setRadius] = useState(5);

	// Sync radius from persisted preferences.
	useEffect(() => {
		setRadius(prefs?.notification_radius_km ?? 5);
	}, [prefs?.notification_radius_km]);

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	const persistRadius = (value: number) => {
		updatePrefs.mutate({ notification_radius_km: value });
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.settings.title} fallback="/(consumer)/profile" />

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

				<SectionTitle>{strings.settings.searchRadius}</SectionTitle>
				<Card style={styles.radiusCard}>
					<View style={styles.radiusHeader}>
						<SectionLabel>{strings.settings.maxDistance}</SectionLabel>
						<View
							style={[styles.radiusPill, { backgroundColor: colors.primary + "14" }]}
						>
							<AppText
								variant="labelSmall"
								weight="bold"
								style={{ color: colors.primary }}
							>
								{radius} {strings.settings.km}
							</AppText>
						</View>
					</View>
					<Slider
						value={radius}
						minimumValue={1}
						maximumValue={50}
						step={1}
						minimumTrackTintColor={colors.primary}
						maximumTrackTintColor={colors.muted}
						thumbTintColor={colors.primary}
						onValueChange={setRadius}
						onSlidingComplete={persistRadius}
					/>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, lineHeight: 18 }}
					>
						{strings.settings.searchRadiusHint}
					</AppText>
				</Card>


			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	themeRow: { flexDirection: "row", gap: spacing.sm },
	
	radiusCard: { gap: spacing.sm },
	radiusHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	radiusPill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.sm,
	},
	row: {
		flexDirection: "row",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
	},
	sectionLabelRow: {},
});