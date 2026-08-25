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
	useBusinessOrders,
} from "@/features/business/hooks";
import {
	filterAndSortOrders,
	orderStats,
	type OrdersSort,
	type OrdersTab,
} from "@/features/business/domain/orders";
import { orderStatusLabels } from "@/features/orders/domain/order";
import { NoBusinessPrompt } from "@/features/business/components/NoBusinessPrompt";
import { BranchSelector } from "@/features/business/components/products/BranchSelector";
import { OrderStatsRow } from "@/features/business/components/orders/OrderStatsRow";
import { OrdersTabs } from "@/features/business/components/orders/OrdersTabs";
import { OrdersSortControl } from "@/features/business/components/orders/OrdersSortControl";
import { OrdersFiltersControl } from "@/features/business/components/orders/OrdersFiltersControl";
import { OrderCard } from "@/features/business/components/orders/OrderCard";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { OrderStatus as OrderStatusType } from "@0xc1x/role-commons";

export default function BusinessOrdersScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses, isLoading: businessesLoading } = useBusinesses(
		profile?.id ?? "",
	);
	const business = businesses?.[0];
	const businessId = business?.id ?? "";

	const { data: locations } = useBusinessLocations(businessId);
	const {
		data: orders,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessOrders(businessId);

	const [tab, setTab] = useState<OrdersTab>("active");
	const [branchId, setBranchId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [status, setStatus] = useState<OrderStatusType | null>(null);
	const [sort, setSort] = useState<OrdersSort>("newest");

	useEffect(() => {
		setTab("active");
		setBranchId(null);
		setSearchQuery("");
		setStatus(null);
		setSort("newest");
	}, [businessId]);

	if (businessesLoading || !business) {
		if (!businessesLoading && !business) {
			return <NoBusinessPrompt />;
		}
		return <LoadingView />;
	}

	const stats = orderStats(orders ?? []);
	const filtered = filterAndSortOrders(orders ?? [], {
		tab,
		branchId,
		status,
		searchQuery,
		sort,
	});

	const isHistory = tab === "history";

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.ordersTitle}
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
				<OrderStatsRow stats={stats} />

				<OrdersTabs tab={tab} onChange={setTab} />

				<View style={styles.searchRow}>
					<SearchBar
						value={searchQuery}
						onChangeText={setSearchQuery}
						placeholder={strings.business.ordersSearchHint}
						containerStyle={styles.searchBar}
					/>
					<OrdersFiltersControl status={status} onApply={setStatus} />
					<OrdersSortControl value={sort} onChange={setSort} />
				</View>

				{status ? (
					<View style={styles.chipsRow}>
						<FilterChip
							label={orderStatusLabels[status]}
							onClear={() => setStatus(null)}
						/>
					</View>
				) : null}

				{isLoading ? <LoadingView /> : null}
				{isError ? (
					<ErrorState error={error} onRetry={() => void refetch()} />
				) : null}

				{!isLoading && !isError && orders && orders.length === 0 ? (
					<EmptyState
						icon={
							<Ionicons
								name="bag-handle-outline"
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={
							isHistory
								? strings.business.ordersNoHistoryTitle
								: strings.business.ordersNoActiveTitle
						}
						message={
							isHistory
								? strings.business.ordersNoHistoryBody
								: strings.business.ordersNoActiveBody
						}
					/>
				) : null}

				{!isLoading &&
				!isError &&
				orders &&
				orders.length > 0 &&
				filtered.length === 0 ? (
					<EmptyState
						icon={
							<Ionicons
								name="search-outline"
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={strings.allOffers.noResultsTitle}
						message={strings.allOffers.noResultsBody}
					/>
				) : null}

				{filtered.map((item) => (
					<OrderCard key={item.order.id} businessId={businessId} item={item} />
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