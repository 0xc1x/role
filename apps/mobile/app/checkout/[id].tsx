import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, ErrorState, LoadingView, Screen, ScreenHeader } from "@/core/ui";
import { formatMoney } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { useApplyCoupon, useOffer, useReserveOffer } from "@/features/hooks";
import {
	type ReservationSuccess,
} from "@/features/orders/domain/order";
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
	const {
		couponInput,
		couponError,
		appliedCoupon,
		applying,
		total,
		applyCoupon,
		clearCoupon,
		changeInput,
	} = useApplyCoupon(offerDetail ?? undefined);
	const [confirmation, setConfirmation] = useState<ReservationSuccess | null>(null);

	if (isLoading) return <LoadingView />;
	if (isError || !offerDetail)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const { offer, business, location } = offerDetail;
	const isAvailable = isOfferAvailable(offerDetail);

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
					onChangeInput={changeInput}
					error={couponError}
					applied={appliedCoupon}
					applying={applying}
					onApply={() => void applyCoupon()}
					onClear={clearCoupon}
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
				<AppText variant="caption" style={[styles.termsNote, { color: colors.mutedForeground }]}>
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
	termsNote: { textAlign: "center" },
});