import type { Coupon } from "@0xc1x/role-commons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, ErrorState, LoadingView, Screen, ScreenHeader } from "@/core/ui";
import { formatMoney } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { useOffer, useReserveOffer } from "@/features/hooks";
import {
	couponDiscount,
	couponIsValid,
	type ReservationSuccess,
} from "@/features/orders/domain/order";
import { orderRepository } from "@/features/orders/data/repository";
import { isOfferAvailable } from "@/features/offers/domain/offer";
import {
	CouponSection,
	PaymentMethodSection,
	PickupDetailsCard,
	PriceBreakdownCard,
	ProductSummaryCard,
	ConfirmationView,
} from "@/features/orders/components/checkout";

export default function CheckoutScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const {
		data: offerDetail,
		isLoading,
		isError,
		error,
		refetch,
	} = useOffer(id ?? "");
	const reserve = useReserveOffer();

	const [couponInput, setCouponInput] = useState("");
	const [couponError, setCouponError] = useState<string | null>(null);
	const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
	const [couponApplying, setCouponApplying] = useState(false);
	const [confirmation, setConfirmation] = useState<ReservationSuccess | null>(null);

	if (isLoading) return <LoadingView />;
	if (isError || !offerDetail)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const { offer, business, location } = offerDetail;
	const isAvailable = isOfferAvailable(offerDetail);
	const couponDiscountValue = appliedCoupon
		? couponDiscount(appliedCoupon, offer.discounted_price)
		: 0;
	const total = Math.max(offer.discounted_price - couponDiscountValue, 0);

	const applyCoupon = async () => {
		const code = couponInput.trim().toUpperCase();
		if (!code) return;
		setCouponApplying(true);
		try {
			const coupon = await orderRepository.getCouponByCode(code, offer.business_id);
			if (!coupon || !couponIsValid(coupon)) {
				setCouponError(strings.checkout.couponUnavailable);
				return;
			}
			if (
				coupon.min_order_amount != null &&
				offer.discounted_price < coupon.min_order_amount
			) {
				setCouponError(
					strings.checkout.couponMinNotMet.replace(
						"{amount}",
						formatMoney(coupon.min_order_amount),
					),
				);
				return;
			}
			setAppliedCoupon(coupon);
			setCouponError(null);
		} catch {
			setCouponError(strings.checkout.invalidCoupon);
		} finally {
			setCouponApplying(false);
		}
	};

	const confirmReservation = () => {
		reserve.mutate(
			{ offerId: offer.id, couponId: appliedCoupon?.id },
			{
				onSuccess: (result) => {
					if (result.ok) {
						setConfirmation(result);
					} else {
						toast.error(result.message);
					}
				},
				onError: () => toast.error(strings.checkout.reservationError),
			},
		);
	};

	if (confirmation) {
		return (
			<Screen edges={["top", "bottom"]}>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={[styles.container, styles.confirmationScroll]}
				>
					<ConfirmationView
						result={confirmation}
						business={business}
						location={location}
					/>
				</ScrollView>
			</Screen>
		);
	}

	return (
		<Screen edges={["top", "bottom"]}>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.container}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<ScreenHeader title={strings.checkout.title} />
				<ProductSummaryCard offer={offer} business={business} location={location} />
				<PickupDetailsCard offer={offer} location={location} />
				<CouponSection
					input={couponInput}
					onChangeInput={(value) => {
						setCouponInput(value);
						setCouponError(null);
					}}
					error={couponError}
					applied={appliedCoupon}
					applying={couponApplying}
					onApply={() => void applyCoupon()}
					onClear={() => {
						setAppliedCoupon(null);
						setCouponInput("");
					}}
				/>
				<PaymentMethodSection />
				<PriceBreakdownCard offer={offer} appliedCoupon={appliedCoupon} />
			</ScrollView>

			<View
				style={[
					styles.bottomBar,
					{ borderTopColor: colors.borderSolid, backgroundColor: colors.card },
				]}
			>
				<View style={styles.totalRow}>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{strings.checkout.total}
					</AppText>
					<AppText variant="priceLarge" style={{ color: colors.primary }}>
						{formatMoney(total)}
					</AppText>
				</View>
				<Button
					label={strings.checkout.confirm}
					onPress={confirmReservation}
					loading={reserve.isPending}
					disabled={!isAvailable}
					fullWidth
					size="lg"
				/>
				<AppText style={[styles.termsNote, { color: colors.mutedForeground }]}>
					{strings.checkout.termsNote}
				</AppText>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	scroll: { flex: 1 },
	container: {
		padding: spacing.xl,
		gap: spacing.lg,
		paddingBottom: spacing.xxl,
	},
	confirmationScroll: { paddingTop: spacing.md },
	bottomBar: {
		borderTopWidth: 1,
		padding: spacing.lg,
		paddingBottom: spacing.lg,
		gap: spacing.sm,
	},
	totalRow: {
		flexDirection: "row",
		alignItems: "baseline",
		justifyContent: "space-between",
	},
	termsNote: { fontSize: 11, textAlign: "center", lineHeight: 15 },
});