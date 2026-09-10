import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	EmptyState,
	ErrorState,
	FilterChip,
	LoadingView,
	Screen,
	SearchBar,
	useWebPullToRefresh,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import {
	useBusinesses,
	useBusinessLocations,
	useBusinessOffers,
} from "@/features/business/hooks";
import {
	filterAndSortProducts,
	productStats,
	type ProductsSort,
} from "@/features/business/domain/products";
import { NoBusinessPrompt } from "@/features/business/components/NoBusinessPrompt";
import { BranchSelector } from "@/features/business/components/products/BranchSelector";
import { BusinessStatsRow } from "@/features/business/components/products/BusinessStatsRow";
import { ProductsSortControl } from "@/features/business/components/products/ProductsSortControl";
import { ProductFilters } from "@/features/business/components/products/ProductFilters";
import { ProductCard } from "@/features/business/components/products/ProductCard";
import { useCategories } from "@/features/hooks";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function BusinessProductsScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading: businessesLoading } = useBusinesses(
		profile?.id ?? "",
	);
	const business = businesses?.[0];
	const businessId = business?.id ?? "";

	const { data: locations } = useBusinessLocations(businessId);
	const {
		data: offers,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useBusinessOffers(businessId);
	const { data: categories } = useCategories();

	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [categoryId, setCategoryId] = useState<string | null>(null);
	const [sort, setSort] = useState<ProductsSort>("newest");
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	useEffect(() => {
		setBranchId(null);
		setSearchQuery("");
		setCategoryId(null);
		setSort("newest");
	}, [businessId]);

	const filtered = filterAndSortProducts(offers ?? [], {
		branchId,
		searchQuery,
		categoryId,
		sort,
	});

	const renderItem = useCallback(
		({ item: product }: { item: (typeof filtered)[number] }) => (
			<ProductCard businessId={businessId} product={product} />
		),
		[businessId],
	);

	const renderSeparator = useCallback(
		() => <View style={styles.separator} />,
		[],
	);

	if (businessesLoading || !business) {
		if (!businessesLoading && !business) {
			return <NoBusinessPrompt />;
		}
		return <LoadingView />;
	}

	const stats = productStats(offers ?? []);
	const activeCategoryName = categories?.find(
		(c) => c.id === categoryId,
	)?.name;

	const createRoute = () => router.push(`/business/${businessId}/offer/new`);

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.productsTitle}
				</AppText>
				{locations && locations.length > 0 ? (
					<BranchSelector
						locations={locations}
						selectedId={branchId}
						onSelect={setBranchId}
					/>
				) : null}
			</View>

			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={filtered}
				keyExtractor={(product) => product.offer.id}
				renderItem={renderItem}
				ItemSeparatorComponent={renderSeparator}
				showsVerticalScrollIndicator={false}
				contentContainerStyle={styles.content}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListHeaderComponent={
					<View style={styles.headerContainer}>
						<BusinessStatsRow stats={stats} />

						<Button
							label={strings.business.newProduct}
							icon={<Ionicons name="add" size={20} color={colors.primaryForeground} />}
							onPress={createRoute}
							fullWidth
							size="lg"
							style={styles.cta}
						/>

						<View style={styles.sectionHeader}>
							<AppText variant="h4" weight="bold">
								{strings.business.allProducts}
							</AppText>
							<ProductsSortControl value={sort} onChange={setSort} />
						</View>

						<View style={styles.searchRow}>
							<SearchBar
								value={searchQuery}
								onChangeText={setSearchQuery}
								placeholder={strings.business.searchProducts}
								containerStyle={styles.searchBarFull}
							/>
						</View>
						<View style={styles.filterRow}>
							<ProductFilters activeCategoryId={categoryId} onApply={setCategoryId} />
						</View>

						{categoryId ? (
							<View style={styles.chipsRow}>
								<FilterChip
									label={activeCategoryName ?? categoryId}
									onClear={() => setCategoryId(null)}
								/>
							</View>
						) : null}

						{isLoading ? <LoadingView /> : null}
						{isError ? (
							<ErrorState error={error} onRetry={() => void refetch()} />
						) : null}

						{!isLoading && !isError && offers && offers.length === 0 ? (
							<EmptyState
								icon={
									<Ionicons
										name="cube-outline"
										size={28}
										color={colors.mutedForeground}
									/>
								}
								title={strings.business.noProductsTitle}
								message={strings.business.noProductsBody}
								action={
									<Button
										label={strings.business.createFirstProduct}
										onPress={createRoute}
									/>
								}
							/>
						) : null}

						{!isLoading &&
						!isError &&
						offers &&
						offers.length > 0 &&
						filtered.length === 0 ? (
							<EmptyState
								title={strings.allOffers.noResultsTitle}
								message={strings.allOffers.noResultsBody}
							/>
						) : null}
					</View>
				}
			/>
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		paddingBottom: spacing.md,
	},
	headerContainer: {
		gap: spacing.md,
		marginBottom: spacing.md,
	},
	separator: {
		height: spacing.md,
	},
	content: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
	},
	cta: {
		marginTop: spacing.xs,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: spacing.sm,
	},
	searchRow: {
		width: "100%",
	},
	searchBarFull: { width: "100%" },
	filterRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	searchBar: { flex: 1 },
	chipsRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
});