import { Ionicons } from "@expo/vector-icons";
import type { Coupon } from "@0xc1x/role-commons";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, TextField } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

interface CouponSectionProps {
	input: string;
	onChangeInput: (value: string) => void;
	error: string | null;
	applied: Coupon | null;
	applying: boolean;
	onApply: () => void;
	onClear: () => void;
}

/** Coupon input / applied chip (ported from Rolé v1 `CouponSection`). */
export function CouponSection({
	input,
	onChangeInput,
	error,
	applied,
	applying,
	onApply,
	onClear,
}: CouponSectionProps) {
	const { colors } = useTheme();

	if (applied) {
		return (
			<View
				style={[
					styles.appliedChip,
					{
						backgroundColor: colors.surfaceSuccess,
						borderColor: colors.surfaceSuccessBorder,
					},
				]}
			>
				<Ionicons name="checkmark-circle" size={18} color={colors.successDark} />
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={{ color: colors.successDark, flex: 1 }}
				>
					{strings.checkout.couponApplied} · {applied.code}
				</AppText>
				<Pressable
					onPress={onClear}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.common.cancel}
				>
					<Ionicons name="close" size={18} color={colors.successDark} />
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.wrap}>
			<TextField
				label={strings.checkout.couponLabel}
				value={input}
				onChangeText={onChangeInput}
				autoCapitalize="characters"
				autoCorrect={false}
				error={error}
			/>
			<Button
				label={strings.checkout.applyCoupon}
				variant="outline"
				onPress={onApply}
				loading={applying}
				disabled={input.trim().length === 0}
				fullWidth
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: spacing.sm },
	appliedChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radii.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
});