import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderStatus as OrderStatusType } from "@0xc1x/role-commons";

import { strings } from "@/core/i18n/strings";
import { AppText, BottomSheetModal, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { orderStatusLabels } from "@/features/orders/domain/order";

const ALL_STATUSES: OrderStatusType[] = [
	"pending",
	"confirmed",
	"ready_for_pickup",
	"picked_up",
	"completed",
	"cancelled",
	"expired",
];

/** Filter pill (highlighted while a status is active) + status bottom sheet. */
export function OrdersFiltersControl({
	status,
	onApply,
}: {
	status: OrderStatusType | null;
	onApply: (status: OrderStatusType | null) => void;
}) {
	const { colors } = useTheme();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<OrderStatusType | null>(null);

	const openSheet = () => {
		setDraft(status);
		setOpen(true);
	};

	return (
		<>
			<Pressable
				onPress={openSheet}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.pill,
					{
						backgroundColor: status ? colors.primary : colors.inputBackground,
						borderColor: status ? colors.primary : colors.borderSolid,
						opacity: pressed ? 0.8 : 1,
					},
				]}
			>
				<Ionicons
					name="funnel-outline"
					size={14}
					color={status ? "#FFFFFF" : colors.mutedForeground}
				/>
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: status ? "#FFFFFF" : colors.foreground }}
				>
					{strings.business.ordersFilter}
				</AppText>
			</Pressable>

			{open ? (
				<BottomSheetModal
					title={strings.business.ordersFilterStatus}
					onClose={() => setOpen(false)}
					footer={
						<Button
							label={strings.business.ordersApplyFilter}
							fullWidth
							size="lg"
							onPress={() => {
								onApply(draft);
								setOpen(false);
							}}
						/>
					}
				>
					<ScrollView
						style={styles.scroll}
						contentContainerStyle={styles.scrollContent}
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
					>
						<Pressable
							onPress={() => setDraft(null)}
							style={({ pressed }) => [
								styles.option,
								{
									backgroundColor: draft === null ? colors.secondary : colors.inputBackground,
									borderColor:
										draft === null ? colors.secondary : colors.borderSolid,
									opacity: pressed ? 0.85 : 1,
								},
							]}
						>
							<AppText
								variant="bodyMedium"
								weight={draft === null ? "semiBold" : "regular"}
								style={{
									color: draft === null ? colors.secondaryForeground : colors.foreground,
								}}
							>
								{strings.business.ordersClear}
							</AppText>
							{draft === null ? (
								<Ionicons name="checkmark" size={18} color={colors.secondaryForeground} />
							) : null}
						</Pressable>

						{ALL_STATUSES.map((item) => {
						const selected = draft === item;
						return (
							<Pressable
								key={item}
								onPress={() => setDraft(item)}
								style={({ pressed }) => [
									styles.option,
									{
										backgroundColor: selected
											? colors.secondary
											: colors.inputBackground,
										borderColor: selected ? colors.secondary : colors.borderSolid,
										opacity: pressed ? 0.85 : 1,
									},
								]}
							>
								<View style={styles.optionLabel}>
									<View
										style={[
											styles.statusDot,
											{ backgroundColor: statusDotColor(item, colors) },
										]}
									/>
									<AppText
										variant="bodyMedium"
										weight={selected ? "semiBold" : "regular"}
										style={{
											color: selected
												? colors.secondaryForeground
												: colors.foreground,
										}}
									>
										{orderStatusLabels[item]}
									</AppText>
								</View>
								{selected ? (
									<Ionicons
										name="checkmark"
										size={18}
										color={colors.secondaryForeground}
									/>
								) : null}
							</Pressable>
						);
						})}
					</ScrollView>
				</BottomSheetModal>
			) : null}
		</>
	);
}

function statusDotColor(
	status: OrderStatusType,
	colors: ReturnType<typeof useTheme>["colors"],
): string {
	switch (status) {
		case "pending":
			return colors.warning;
		case "confirmed":
		case "picked_up":
			return colors.info;
		case "ready_for_pickup":
		case "completed":
			return colors.success;
		case "cancelled":
		case "expired":
			return colors.destructive;
	}
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	scroll: { maxHeight: 380 },
	scrollContent: { gap: 8, paddingHorizontal: spacing.xl },
	option: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
	},
	optionLabel: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		flex: 1,
	},
	statusDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
});