import { useCallback, useEffect, useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, CircleIconButton, SearchBar, SelectableChipsBar } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useAllBusinesses, useSelectedAddress } from "@/features/hooks";
import { BusinessGridCard } from "@/features/business/components/BusinessGridCard";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";

const SEARCH_DEBOUNCE_MS = 400;

const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_LABELS);

export default function AllBusinessesScreen() {
	const { colors } = useTheme();
	const params = useLocalSearchParams<{ type?: string }>();

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedType, setSelectedType] = useState<string | null>(
		params.type ?? null,
	);

	const selectedAddress = useSelectedAddress();
	const { data, isLoading, isError, error, refetch } = useAllBusinesses(
		selectedAddress?.latitude ?? null,
		selectedAddress?.longitude ?? null,
		debouncedSearch.length > 0 ? debouncedSearch : null,
		selectedType,
	);

	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [search]);

	const chipItems = useMemo<string[]>(
		() => ["all", ...BUSINESS_TYPES],
		[],
	);
	const selectedChip = selectedType ?? "all";

	const labelFor = useCallback(
		(type: string) =>
			type === "all" ? strings.allBusinesses.all : BUSINESS_TYPE_LABELS[type],
		[],
	);

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			<View style={styles.header}>
				<View style={styles.headerRow}>
					<CircleIconButton
						icon={
							<Ionicons name="chevron-back" size={22} color={colors.foreground} />
						}
						onPress={() => router.back()}
						accessibilityLabel={strings.common.back}
					/>
					<AppText variant="h2" weight="bold">
						{strings.allBusinesses.title}
					</AppText>
				</View>
				<SearchBar
					value={search}
					onChangeText={setSearch}
					placeholder={strings.allBusinesses.searchHint}
				/>
			</View>

			<SelectableChipsBar
				items={chipItems}
				selectedItem={selectedChip}
				labelFor={labelFor}
				onSelect={(item) =>
					setSelectedType(item === "all" ? null : item)
				}
				style={styles.chipsBar}
			/>

			{isLoading ? (
				<View style={styles.businessGrid}>
					<FlatList
						data={[0, 1, 2]}
						keyExtractor={(i) => String(i)}
						numColumns={3}
						columnWrapperStyle={styles.businessRow}
						contentContainerStyle={styles.businessContent}
						scrollEnabled={false}
						renderItem={() => (
							<View style={[styles.skeletonCard, { backgroundColor: colors.card }]} />
						)}
					/>
				</View>
			) : isError ? (
				<View style={styles.centerBox}>
					<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
						{error instanceof Error ? error.message : strings.common.error}
					</AppText>
					<Pressable
						onPress={() => void refetch()}
						style={[styles.retry, { backgroundColor: colors.primary }]}
					>
						<AppText weight="bold" style={{ color: colors.primaryForeground }}>
							{strings.common.retry}
						</AppText>
					</Pressable>
				</View>
			) : data && data.length === 0 ? (
				<View style={styles.centerBox}>
					<Ionicons name="storefront-outline" size={44} color={colors.mutedForeground} />
					<AppText variant="h4" weight="bold" style={{ marginTop: spacing.md }}>
						{strings.allBusinesses.noResultsTitle}
					</AppText>
					<AppText
						variant="bodyMedium"
						style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
					>
						{strings.allBusinesses.noResultsBody}
					</AppText>
				</View>
			) : (
				<FlatList
					data={data}
					keyExtractor={(item) => item.id}
					numColumns={3}
					columnWrapperStyle={styles.businessRow}
					contentContainerStyle={styles.businessContent}
					showsVerticalScrollIndicator={false}
					renderItem={({ item }) => (
						<View style={styles.businessItem}>
							<BusinessGridCard
								business={item}
								userLat={selectedAddress?.latitude}
								userLng={selectedAddress?.longitude}
							/>
						</View>
					)}
				/>
			)}
		</View>
	);
}

const GRID_GAP = spacing.md;

const styles = StyleSheet.create({
	flex: { flex: 1 },
	header: {
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.lg,
		gap: spacing.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	chipsBar: {
		marginTop: spacing.md,
		marginBottom: spacing.sm,
	},
	businessGrid: {
		flex: 1,
	},
	businessContent: {
		padding: spacing.xl,
		gap: spacing.md,
		paddingTop: spacing.sm,
	},
	businessRow: {
		gap: GRID_GAP,
	},
	businessItem: {
		flex: 1,
	},
	skeletonCard: {
		flex: 1,
		height: 200,
		borderRadius: 16,
	},
	centerBox: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
	},
	retry: {
		marginTop: spacing.lg,
		paddingHorizontal: 24,
		paddingVertical: spacing.md,
		borderRadius: 12,
	},
});