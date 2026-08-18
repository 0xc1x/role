import { useMemo, useState } from "react";
import {
	KeyboardAvoidingView,
	Modal,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useCategories } from "@/features/hooks";
import type { EmbeddedCategory } from "@/features/offers/domain/offer";

export interface OfferFilterState {
	category: string | null;
	maxPrice: number | null;
	maxDistanceKm: number | null;
}

export const emptyOfferFilters: OfferFilterState = {
	category: null,
	maxPrice: null,
	maxDistanceKm: null,
};

const DISTANCE_OPTIONS = [2, 5, 10] as const;
const PRICE_OPTIONS = [2, 5, 10] as const;

export function OfferFiltersSheet({
	current,
	onApply,
	onClose,
}: {
	current: OfferFilterState;
	onApply: (filters: OfferFilterState) => void;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { data: categories } = useCategories();

	const [state, setState] = useState<OfferFilterState>(current);

	const hasActiveFilters =
		state.category != null ||
		state.maxPrice != null ||
		state.maxDistanceKm != null;

	const catName = useMemo(() => {
		if (!state.category) return null;
		return (
			categories?.find((c) => c.id === state.category)?.name ??
			state.category
		);
	}, [categories, state.category]);

	const renderOption = (
		key: string,
		label: string,
		selected: boolean,
		onPress: () => void,
	) => (
		<Pressable
			key={key}
			onPress={onPress}
			style={[
				styles.optionChip,
				{
					backgroundColor: selected ? colors.secondary : colors.inputBackground,
					borderColor: selected ? colors.secondary : colors.borderSolid,
				},
			]}
		>
			<AppText
				variant="bodySmall"
				weight="semiBold"
				style={{ color: selected ? colors.secondaryForeground : colors.foreground }}
			>
				{label}
			</AppText>
		</Pressable>
	);

	const renderSection = (
		title: string,
		children: React.ReactNode,
	) => (
		<View style={styles.section}>
			<AppText variant="labelSmall" weight="bold" style={{ color: colors.mutedForeground }}>
				{title}
			</AppText>
			<View style={styles.optionsWrap}>{children}</View>
		</View>
	);

	return (
		<Modal
			visible
			transparent
			statusBarTranslucent
			animationType="slide"
			onRequestClose={onClose}
		>
			<View style={styles.backdrop}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<KeyboardAvoidingView
					behavior={Platform.OS === "ios" ? "padding" : undefined}
					style={styles.keyboardView}
				>
				<View
					style={[
						styles.sheet,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
							paddingBottom: insets.bottom,
						},
					]}
				>
					<View style={[styles.grabber, { backgroundColor: colors.borderSolid }]} />
					<View style={styles.header}>
						<AppText variant="h3" weight="bold">
							{strings.allOffers.filters}
						</AppText>
						{hasActiveFilters ? (
							<Pressable onPress={() => setState(emptyOfferFilters)} hitSlop={8}>
								<AppText
									variant="bodySmall"
									weight="semiBold"
									style={{ color: colors.primary }}
								>
									{strings.allOffers.clearAll}
								</AppText>
							</Pressable>
						) : (
							<Pressable onPress={onClose} hitSlop={8}>
								<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
									{strings.common.close}
								</AppText>
							</Pressable>
						)}
					</View>
					<ScrollView
						showsVerticalScrollIndicator={false}
						contentContainerStyle={styles.scrollContent}
						keyboardShouldPersistTaps="handled"
					>
						{renderSection(
							strings.allOffers.category,
							(categories ?? []).map((cat: EmbeddedCategory) =>
								renderOption(
									cat.id,
									cat.name,
									state.category === cat.id,
									() =>
										setState((s) => ({
											...s,
											category: s.category === cat.id ? null : cat.id,
										})),
								),
							),
						)}
						{renderSection(
							strings.allOffers.maxDistance,
							DISTANCE_OPTIONS.map((km) =>
								renderOption(
									`dist-${km}`,
									`${km} ${strings.allOffers.km}`,
									state.maxDistanceKm === km,
									() =>
										setState((s) => ({
											...s,
											maxDistanceKm: s.maxDistanceKm === km ? null : km,
										})),
								),
							),
						)}
						{renderSection(
							strings.allOffers.maxPrice,
							PRICE_OPTIONS.map((price) =>
								renderOption(
									`price-${price}`,
									strings.allOffers.price.replace(
										"{n}",
										`$${price}`,
									),
									state.maxPrice === price,
									() =>
										setState((s) => ({
											...s,
											maxPrice: s.maxPrice === price ? null : price,
										})),
								),
							),
						)}
					</ScrollView>
					<View style={styles.footer}>
						<Button
							label={
								hasActiveFilters
									? strings.allOffers.applyFilters
									: strings.common.close
							}
							onPress={() => {
								if (hasActiveFilters) {
									onApply(state);
								}
								onClose();
							}}
							fullWidth
							size="lg"
						/>
					</View>
				</View>
			</KeyboardAvoidingView>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	keyboardView: { width: "100%", maxHeight: "88%" },
	sheet: {
		borderTopLeftRadius: radii.xl,
		borderTopRightRadius: radii.xl,
		borderWidth: 1,
		overflow: "hidden",
	},
	grabber: {
		alignSelf: "center",
		width: 48,
		height: 5,
		borderRadius: 2.5,
		marginTop: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
	},
	scrollContent: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.md,
		gap: spacing.lg,
	},
	section: {
		gap: spacing.sm,
	},
	optionsWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	optionChip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	footer: {
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.sm,
	},
});