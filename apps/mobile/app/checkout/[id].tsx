import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
} from "@/src/core/ui";
import { formatMoney } from "@/src/core/utils/formatters";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import {
	createReservationIdempotencyKey,
	useApplyCoupon,
	useOffer,
	useReserveOffer,
} from "@/src/features/hooks";
import type { ReservationSuccess } from "@/src/features/orders/domain/order";
import {
	isOfferAvailable,
	isOfferExpired,
	isOfferOutOfStock,
	type OfferDetail,
} from "@/src/features/offers/domain/offer";
import {
	CouponSection,
	PaymentMethodSection,
	PickupDetailsCard,
	PriceBreakdownCard,
	ProductSummaryCard,
	ConfirmationView,
} from "@/src/features/orders/components/checkout";
import { Button } from "@/components/ui/button";

export default function CheckoutScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	// Remonta por oferta: cupón y confirmación reinician solos, sin efectos.
	return <CheckoutBody key={id ?? "empty"} offerId={id ?? ""} />;
}

function CheckoutBody({ offerId }: { offerId: string }) {
	const { colors } = useTheme();
	const {
		data: offerDetail,
		isLoading,
		isError,
		error,
		refetch,
	} = useOffer(offerId);
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
	const [confirmation, setConfirmation] = useState<ReservationSuccess | null>(
		null,
	);
	const reservationAttempt = useRef<{
		scope: string;
		idempotencyKey: string;
	} | null>(null);

	if (isLoading) return <LoadingView />;
	if (isError || !offerDetail)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const { offer, business, location } = offerDetail;
	const isAvailable = isOfferAvailable(offerDetail);
	const unavailableReason = unavailableCopy(offerDetail);
	const confirmReservation = () => {
		const scope = `${offer.id}:${appliedCoupon?.id ?? "none"}`;
		if (reservationAttempt.current?.scope !== scope) {
			reservationAttempt.current = {
				scope,
				idempotencyKey: createReservationIdempotencyKey(),
			};
		}
		reserve.mutate(
			{
				offerId: offer.id,
				couponId: appliedCoupon?.id,
				idempotencyKey: reservationAttempt.current.idempotencyKey,
			},
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
				<ProductSummaryCard
					offer={offer}
					business={business}
					location={location}
				/>
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
				{unavailableReason ? (
					<View
						accessible
						accessibilityRole="alert"
						accessibilityLabel={unavailableReason}
					>
						<AppText
							variant="bodySmall"
							style={[styles.unavailable, { color: colors.destructive }]}
						>
							{unavailableReason}
						</AppText>
					</View>
				) : null}
				<View style={styles.totalRow}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{strings.checkout.total}
					</AppText>
					<AppText variant="priceLarge" style={{ color: colors.primary }}>
						{formatMoney(total)}
					</AppText>
				</View>
				<Button
					onPress={confirmReservation}
					loading={reserve.isPending}
					disabled={!isAvailable}
					fullWidth
					size="lg"
				>
					{isAvailable
						? strings.checkout.confirm
						: strings.checkout.confirmUnavailable}
				</Button>

				{/* Solo la aceptación y el enlace. Antes esto.listaba las reglas
				    acá, y dos de las cuatro no las aplica la app: `cancel_order`
				    no mira ventana de 10 minutos ni cupo de cancelaciones, solo
				    dueño y estado. Los términos (#4 pagos y #5 cancelaciones) sí
				    describen el pago al recoger, la ventana y la liberación de lo
				    no recogido, así que el enlace alcanza. Copiar reglas acá solo
				    convertía defaults de `app_config` en promesas que nadie
				    cumple. */}
				<View style={styles.terms}>
					<AppText variant="caption" style={{ color: colors.mutedForeground }}>
						{strings.checkout.termsPrefix}{" "}
						<Pressable
							onPress={() => router.push("/(consumer)/profile/terms")}
							accessibilityRole="link"
							hitSlop={6}
						>
							<AppText
								variant="caption"
								style={[styles.termsLink, { color: colors.primary }]}
							>
								{strings.checkout.termsLink}
							</AppText>
						</Pressable>
					</AppText>
				</View>
			</View>
		</Screen>
	);
}

/**
 * Por qué no se puede confirmar, o `null` si sí se puede. Mismo criterio que
 * `OfferBottomBar`: el botón cambia de etiqueta y la razón se escribe, en vez
 * de dejar un control muerto sin explicación.
 */
function unavailableCopy(detail: OfferDetail): string | null {
	if (isOfferAvailable(detail)) return null;
	if (isOfferOutOfStock(detail)) return strings.checkout.reasonSoldOut;
	if (isOfferExpired(detail)) return strings.checkout.reasonWindowClosed;
	return strings.checkout.reasonPaused;
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
	unavailable: { textAlign: "center" },
	terms: { gap: 2, marginTop: spacing.xs },
	termsLink: { fontWeight: "700" },
});
