import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import {
	formatShortDate,
	formatTime,
} from "@/core/utils/formatters";
import {
	isActiveStatus,
	type OrderDetail,
} from "@/features/orders/domain/order";

type IoniconName = keyof typeof Ionicons.glyphMap;

export function BusinessInfoCard({ item }: { item: OrderDetail }) {
	const { colors } = useTheme();
	const { order } = item;
	const isActive = isActiveStatus(order.status);

	const openDirections = () => {
		const url = item.businessLocationId
			? `https://www.google.com/maps/dir/?api=1&destination=place_id:${encodeURIComponent(item.businessLocationId)}`
			: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.businessAddress ?? "")}`;
		void Linking.openURL(url);
	};

	return (
		<Card style={styles.cardBlock}>
			<View style={styles.businessTitleRow}>
				<View
					style={[
						styles.businessIcon,
						{ backgroundColor: withAlpha(colors.secondary, 0.302) },
					]}
				>
					<Ionicons name="storefront-outline" size={18} color={colors.primary} />
				</View>
				<AppText
					variant="h4"
					weight="bold"
					numberOfLines={2}
					style={styles.businessName}
				>
					{item.businessName}
				</AppText>
			</View>

			{item.businessAddress ? (
				<InfoRow
					icon="location-outline"
					label={strings.orders.businessAddressLabel}
					text={item.businessAddress}
				/>
			) : null}
			{item.businessPhone ? (
				<InfoRow
					icon="call-outline"
					label={strings.orders.businessPhoneLabel}
					text={item.businessPhone}
				/>
			) : null}
			{order.pickup_time ? (
				<InfoRow
					icon="time-outline"
					label={strings.orders.pickupTimeLabel}
					text={`${formatShortDate(order.pickup_time)} · ${formatTime(order.pickup_time)} hs`}
				/>
			) : null}

			<View style={styles.businessActions}>
				<Button
					label={strings.orders.viewBusiness}
					variant="secondary"
					size="sm"
					style={styles.businessActionBtn}
					onPress={() => router.push(`/business-profile/${order.business_id}`)}
				/>
				{isActive ? (
					<Button
						label={strings.orders.getDirections}
						variant="outline"
						size="sm"
						style={styles.businessActionBtn}
						onPress={openDirections}
					/>
				) : null}
			</View>
		</Card>
	);
}

export function InfoRow({
	icon,
	label,
	text,
}: {
	icon: IoniconName;
	label: string;
	text: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Ionicons name={icon} size={16} color={colors.mutedForeground} />
			<View style={styles.infoBody}>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<AppText variant="bodyMedium" weight="medium">
					{text}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	cardBlock: { gap: spacing.sm },
	businessTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.xs,
	},
	businessIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	businessName: { flex: 1 },
	businessActions: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.sm,
	},
	businessActionBtn: { flex: 1 },
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		paddingVertical: spacing.xs,
	},
	infoBody: { flex: 1 },
});
