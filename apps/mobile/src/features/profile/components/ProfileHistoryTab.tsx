import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, EmptyState, ErrorState, LoadingView } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useOrders } from "@/features/hooks";
import { OrderCard } from "@/features/orders/components/OrderCard";
import {
	isActiveStatus,
	isTerminalStatus,
} from "@/features/orders/domain/order";

export function HistoryTab() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch } = useOrders();

	if (isLoading) return <LoadingView />;
	if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data || data.length === 0) {
		return (
			<EmptyState title={strings.orders.empty} message={strings.orders.emptyHint} />
		);
	}

	const upcoming = data.filter((order) => isActiveStatus(order.order.status));
	const past = data.filter((order) => isTerminalStatus(order.order.status));

	return (
		<View style={{ gap: spacing.lg }}>
			{upcoming.length > 0 ? (
				<>
					<AppText variant="h1" weight="bold">
						{strings.profile.upcomingOrders}
					</AppText>
					{upcoming.map((order) => (
						<OrderCard key={order.order.id} item={order} />
					))}
				</>
			) : null}

			{past.length > 0 ? (
				<>
					<View style={styles.pastHeader}>
						<AppText variant="h1" weight="bold" style={styles.pastTitle}>
							{strings.profile.pastOrders}
						</AppText>
						<Link
							href="/profile/orders"
							style={[styles.viewAll, { color: colors.primary }]}
						>
							{past.length > 5
								? strings.profile.viewAllCount.replace("{n}", String(past.length))
								: strings.profile.viewAll}
						</Link>
					</View>
					{past.slice(0, 5).map((order) => (
						<OrderCard key={order.order.id} item={order} />
					))}
				</>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	pastHeader: { flexDirection: "row", alignItems: "center", paddingTop: spacing.xxl,},
	pastTitle: { flex: 1 },
	viewAll: { fontWeight: "600" },
});
