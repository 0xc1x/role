import { router, useLocalSearchParams } from "expo-router";
import { FlatList, Image, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	StatusBadge,
} from "@/core/ui";
import { useBusinessOffers } from "@/features/business/hooks";
import { discountPercentage } from "@/features/offers/domain/offer";
import { formatMoney } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

/** Business offer list (from hub menu). */
export default function BusinessOffersScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const { data, isLoading, isError, error, refetch } = useBusinessOffers(
		id ?? "",
	);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.products}
				</AppText>
				<Button
					label={strings.business.newProduct}
					size="sm"
					onPress={() => router.push(`/business/${id}/offer/new`)}
				/>
			</View>
			{!data || data.length === 0 ? (
				<EmptyState
					title="Sin productos aún"
					message="Publica tu primer excedente de comida."
				/>
			) : (
				<FlatList
					data={data}
					keyExtractor={(item) => item.offer.id}
					contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
					renderItem={({ item }) => {
						const discount = discountPercentage(item.offer);
						return (
							<Card
								onPress={() =>
									router.push(`/business/${id}/offer/${item.offer.id}`)
								}
							>
								<View style={styles.row}>
									{item.offer.image ? (
										<Image
											source={{ uri: item.offer.image }}
											style={styles.image}
										/>
									) : null}
									<View style={{ flex: 1, gap: 2 }}>
										<AppText variant="h4" weight="bold" numberOfLines={1}>
											{item.offer.title}
										</AppText>
										<AppText
											variant="bodySmall"
											style={{ color: colors.mutedForeground }}
										>
											{formatMoney(item.offer.discounted_price)} · {discount}%
											OFF
										</AppText>
										<StatusBadge
											label={item.offer.is_active ? "Activo" : "Inactivo"}
											tone={item.offer.is_active ? "success" : "neutral"}
										/>
									</View>
								</View>
							</Card>
						);
					}}
				/>
			)}
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.lg,
		marginBottom: spacing.md,
	},
	row: { flexDirection: "row", gap: spacing.md },
	image: { width: 64, height: 64, borderRadius: 10 },
});
