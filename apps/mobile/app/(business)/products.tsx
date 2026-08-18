import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, View } from "react-native";

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
	} = useBusinessOffers(businessId);
	const { data: categories } = useCategories();

	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [categoryId, setCategoryId] = useState<string | null>(null);
	const [sort, setSort] = useState<ProductsSort>("newest");

	useEffect(() => {
		setBranchId(null);
		setSearchQuery("");
		setCategoryId(null);
		setSort("newest");
	}, [businessId]);

	if (businessesLoading || !business) {
		if (!businessesLoading && !business) {
			return (
				<Screen>
					<EmptyState
						title={strings.business.noBusiness}
						action={
							<Button
								label={strings.business.createBusiness}
								onPress={() => router.push("/business-signup")}
							/>
						}
					/>
				</Screen>
			);
		}
		return <LoadingView />;
	}

	const filtered = filterAndSortProducts(offers ?? [], {
		branchId,
		searchQuery,
		categoryId,
		sort,
	});
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

			<ScrollView
				showsVerticalScrollIndicator={false}
				contentContainerStyle={styles.content}
			>
				<BusinessStatsRow stats={stats} />

				<Button
					label={strings.business.newProduct}
					icon={<Ionicons name="add" size={20} color="#FFFFFF" />}
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
						containerStyle={styles.searchBar}
					/>
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

				{filtered.map((product) => (
					<ProductCard
						key={product.offer.id}
						businessId={businessId}
						product={product}
					/>
				))}
			</ScrollView>
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.lg,
		paddingBottom: spacing.md,
	},
	content: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
		gap: spacing.md,
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