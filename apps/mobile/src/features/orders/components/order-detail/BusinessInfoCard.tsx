import { Clock, MapPin, Phone, Store, type LucideIcon } from "lucide-react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import {
	formatShortDate,
	formatTime,
} from "@/src/core/utils/formatters";
import {
	isActiveStatus,
	type OrderDetail,
} from "@/src/features/orders/domain/order";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function BusinessInfoCard({ item }: { item: OrderDetail }) {
	const { colors, scheme } = useTheme();
	const { order } = item;
	const isActive = isActiveStatus(order.status);

	const openDirections = () => {
		const url = item.businessLocationId
			? `https://www.google.com/maps/dir/?api=1&destination=place_id:${encodeURIComponent(item.businessLocationId)}`
			: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.businessAddress ?? "")}`;
		void Linking.openURL(url);
	};

	return (
		<Card>
			<CardHeader>
				<AppText variant="h4" weight="bold" style={{ flex: 1 }}>
					{strings.orders.businessTitle}
				</AppText>
			</CardHeader>
			<CardContent style={styles.body}>
			<View style={styles.businessTitleRow}>
				{item.businessImageUrl ? (
					<Image
						source={{ uri: item.businessImageUrl }}
						style={styles.businessLogo}
						contentFit="cover"
					/>
				) : (
					<View
						style={[
							styles.businessIcon,
							{ backgroundColor: withAlpha(colors.secondary, 0.302) },
						]}
					>
						<Store size={18} color={colors.primary} />
					</View>
				)}
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
					icon={MapPin}
					label={strings.orders.businessAddressLabel}
					text={item.businessAddress}
				/>
			) : null}
			{item.businessPhone ? (
				<InfoRow
					icon={Phone}
					label={strings.orders.businessPhoneLabel}
					text={item.businessPhone}
				/>
			) : null}
			{order.pickup_time ? (
				<InfoRow
					icon={Clock}
					label={strings.orders.pickupTimeLabel}
					text={`${formatShortDate(order.pickup_time)} · ${formatTime(order.pickup_time)} hs`}
				/>
			) : null}

			<View style={styles.businessActions}>
				{isActive ? (
					<Button
						size="sm"
						style={styles.businessActionBtn}
						onPress={openDirections}
					>
						{strings.orders.getDirections}
					</Button>
				) : null}
				<Button
					variant="secondary"
					size="sm"
					style={styles.businessActionBtn}
					onPress={() => router.push(`/business-profile/${order.business_id}`)}
				>
					{strings.orders.viewBusiness}
				</Button>
			</View>
			</CardContent>
		</Card>
	);
}

export function InfoRow({
	icon: Icon,
	label,
	text,
}: {
	icon: LucideIcon;
	label: string;
	text: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Icon size={16} color={colors.mutedForeground} />
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
	body: { gap: spacing.sm },
	businessTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.xs,
	},
	businessIcon: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	businessLogo: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
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
