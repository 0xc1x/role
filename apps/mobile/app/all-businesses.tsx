import { memo, useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/core/i18n/strings";
import { AppText, CircleIconButton, goBackOr, SearchBar, useWebPullToRefresh } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useAllBusinessesInfinite, useSelectedAddress } from "@/features/hooks";
import { BusinessGridCard } from "@/features/business/components/BusinessGridCard";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { ChipsBar } from "@/features/home/components/CategoryChips";

const SEARCH_DEBOUNCE_MS = 400;

const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_LABELS);

const SKELETON_DATA = [0, 1, 2];

type BusinessGridItem = ComponentProps<typeof BusinessGridCard>["business"];

const SkeletonRow = memo(function SkeletonRow() {
	return <Skeleton style={styles.skeletonCard} />;
});

function renderSkeletonItem() {
	return <SkeletonRow />;
}

const BusinessRow = memo(function BusinessRow({
	item,
	userLat,
	userLng,
}: {
	item: BusinessGridItem;
	userLat: number | undefined;
	userLng: number | undefined;
}) {
	return (
		<View style={styles.businessItem}>
			<BusinessGridCard business={item} userLat={userLat} userLng={userLng} />
		</View>
	);
});

function ListFooter({
	isFetchingNextPage,
	hasNextPage,
	hasData,
}: {
	isFetchingNextPage: boolean;
	hasNextPage: boolean;
	hasData: boolean;
}) {
	const { colors } = useTheme();
	if (isFetchingNextPage) {
		return (
			<View style={{ padding: spacing.lg, alignItems: "center" }}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					Cargando más…
				</AppText>
			</View>
		);
	}
	if (hasNextPage || !hasData) return null;
	return (
		<View style={{ padding: spacing.lg, alignItems: "center" }}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				No hay más negocios
			</AppText>
		</View>
	);
}

export default function AllBusinessesScreen() {
	const { colors } = useTheme();
	const params = useLocalSearchParams<{ type?: string }>();

	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [selectedType, setSelectedType] = useState<string | null>(
		params.type ?? null,
	);

	const selectedAddress = useSelectedAddress();
	const { data: infiniteData, isLoading, isError, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } = useAllBusinessesInfinite(
		selectedAddress?.latitude ?? null,
		selectedAddress?.longitude ?? null,
		debouncedSearch.length > 0 ? debouncedSearch : null,
		selectedType,
	);
	const data = useMemo(() => infiniteData?.pages.flat() ?? [], [infiniteData]);
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: !!isFetching,
	});

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

	const userLat = selectedAddress?.latitude;
	const userLng = selectedAddress?.longitude;

	const renderItem = useCallback(
		({ item }: { item: BusinessGridItem }) => (
			<BusinessRow item={item} userLat={userLat} userLng={userLng} />
		),
		[userLat, userLng],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const listFooter = useMemo(
		() => (
			<ListFooter
				isFetchingNextPage={isFetchingNextPage}
				hasNextPage={hasNextPage ?? false}
				hasData={data.length > 0}
			/>
		),
		[isFetchingNextPage, hasNextPage, data.length],
	);

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			{pull.indicator}
			<View style={styles.header}>
				<View style={styles.headerRow}>
					<CircleIconButton
						icon={
							<Ionicons name="chevron-back" size={22} color={colors.foreground} />
						}
						onPress={() => goBackOr("/(consumer)")}
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

			<View style={styles.chipsBar}>
				<ChipsBar
					items={chipItems}
					selectedId={selectedChip}
					labelFor={labelFor}
					onSelect={(item) =>
						setSelectedType(item === "all" ? null : item)
					}
				/>
			</View>

			{isLoading ? (
				<View style={styles.businessGrid}>
					<FlatList
						data={SKELETON_DATA}
						keyExtractor={(i) => String(i)}
						numColumns={3}
						columnWrapperStyle={styles.businessRow}
						contentContainerStyle={styles.businessContent}
						scrollEnabled={false}
						renderItem={renderSkeletonItem}
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
					ref={pull.ref}
					data={data}
					keyExtractor={(item) => item.id}
					numColumns={2}
					columnWrapperStyle={styles.businessRow}
					contentContainerStyle={styles.businessContent}
					showsVerticalScrollIndicator={false}
					refreshControl={<RefreshControl refreshing={!!isFetching} onRefresh={() => void refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
					onEndReached={handleEndReached}
					onEndReachedThreshold={0.5}
					ListFooterComponent={listFooter}
					renderItem={renderItem}
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
		paddingTop: spacing.xl,
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