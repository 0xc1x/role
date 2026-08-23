import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText, SearchBar } from "@/core/ui";
import { Logo } from "@/core/ui/Logo";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";

/**
 * Header principal de la pantalla de Explorar (portado de fudi):
 * logo, título, barra de búsqueda y botones píldora de mapa/filtros.
 */
export function ExploreHeader({
	search,
	onSearchChange,
	onSubmitSearch,
	onToggleMap,
	onFilterTap,
	hasActiveFilters,
}: {
	search: string;
	onSearchChange: (text: string) => void;
	onSubmitSearch?: (text: string) => void;
	onToggleMap: () => void;
	onFilterTap: () => void;
	hasActiveFilters: boolean;
}) {
	const { colors, scheme } = useTheme();
	const insets = useSafeAreaInsets();
	const onBrand = scheme === "light";
	const brandBackground = onBrand ? colors.primary : colors.background;
	const brandForeground = onBrand ? colors.primaryForeground : colors.foreground;

	return (
		<View
			style={[
				styles.container,
				{
					backgroundColor: brandBackground,
					paddingTop: insets.top + spacing.lg,
				},
			]}
		>
			<Logo
				width={44}
				height={32}
				color={brandForeground}
			/>
			<AppText
				variant="h1"
				weight="extraBold"
				style={{ color: brandForeground, marginTop: spacing.md }}
			>
				{strings.explore.title}
			</AppText>
			<View style={{ marginTop: spacing.md }}>
				<SearchBar
					value={search}
					onChangeText={onSearchChange}
					onSubmit={onSubmitSearch}
					placeholder={strings.explore.searchHint}
					containerStyle={[
						styles.search,
						{
							backgroundColor: onBrand
								? colors.background
								: colors.inputBackground,
							borderColor: onBrand
								? colors.background
								: colors.borderSolid,
						},
					]}
				/>
			</View>
			<View style={styles.pillsRow}>
				<ExploreHeaderPillButton
					iconName="map-outline"
					label={strings.explore.viewMap}
					onPress={onToggleMap}
					onBrand={onBrand}
					brandForeground={brandForeground}
				/>
				<ExploreHeaderPillButton
					iconName="options-outline"
					label={strings.explore.filters}
					onPress={onFilterTap}
					hasIndicator={hasActiveFilters}
					onBrand={onBrand}
					brandForeground={brandForeground}
				/>
			</View>
		</View>
	);
}

function ExploreHeaderPillButton({
	iconName,
	label,
	onPress,
	hasIndicator = false,
	onBrand,
	brandForeground,
}: {
	iconName: keyof typeof Ionicons.glyphMap;
	label: string;
	onPress: () => void;
	hasIndicator?: boolean;
	onBrand: boolean;
	brandForeground: string;
}) {
	const { colors, scheme } = useTheme();
	const pillColor = onBrand
		? "rgba(255,255,255,0.18)"
		: scheme === "dark"
			? colors.primaryForeground + "14"
			: colors.card;

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={[
				styles.pill,
				{
					backgroundColor: pillColor,
					paddingHorizontal: spacing.md,
					paddingVertical: spacing.sm,
				},
			]}
		>
			<Ionicons name={iconName} size={16} color={brandForeground} />
			<AppText variant="bodySmall" weight="semiBold" style={{ color: brandForeground }}>
				{label}
			</AppText>
			{hasIndicator ? (
				<View style={[styles.indicator, { backgroundColor: brandForeground }]} />
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.xl,
	},
	search: {
		borderWidth: 0,
	},
	pillsRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.md,
	},
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		borderRadius: radii.md,
	},
	indicator: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
});