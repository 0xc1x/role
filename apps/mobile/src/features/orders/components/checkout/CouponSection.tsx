import { CircleCheck, X } from "lucide-react-native";
import type { Coupon } from "@0xc1x/role-commons";
import { StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, TextField } from "@/src/core/ui";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";

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
				<CircleCheck size={18} color={colors.successDark} fill={colors.successDark} />
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={{ color: colors.successDark, flex: 1 }}
				>
					{strings.checkout.couponApplied} · {applied.code}
				</AppText>
				<Button
					variant="ghost"
					size="icon"
					onPress={onClear}
					hitSlop={8}
					accessibilityRole="button"
					aria-label={strings.checkout.removeCoupon}
					style={{ width: 32, height: 32 }}
					icon={<X size={18} color={colors.successDark} />}
				/>
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
				variant="outline"
				onPress={onApply}
				loading={applying}
				disabled={input.trim().length === 0}
				fullWidth
			>
				{strings.checkout.applyCoupon}
			</Button>
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