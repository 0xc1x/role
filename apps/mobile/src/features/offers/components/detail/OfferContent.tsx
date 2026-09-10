import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import {
	discountPercentage,
	haversineKm,
	splitList,
	type OfferDetail,
} from "@/features/offers/domain/offer";
import { useSelectedAddress } from "@/features/hooks";
import {
	formatMoney,
	formatMoneyPrecise,
	formatDistanceKm,
	formatDateTime,
} from "@/core/utils/formatters";
import { CategoryBadge, InfoCard, InfoRow } from "./InfoPrimitives";

function distanceSubtitle(
	offer: OfferDetail,
	selectedAddress: ReturnType<typeof useSelectedAddress>,
): string {
	if (
		offer.location &&
		selectedAddress?.latitude != null &&
		selectedAddress?.longitude != null
	) {
		const distance = formatDistanceKm(
			haversineKm(
				selectedAddress.latitude,
				selectedAddress.longitude,
				offer.location.latitude,
				offer.location.longitude,
			),
		);
		return strings.offerDetail.distanceFromYou.replace("{distance}", distance);
	}
	return offer.location?.address ?? "";
}

export function OfferContent({ data }: { data: OfferDetail }) {
	const { colors, scheme } = useTheme();
	const selectedAddress = useSelectedAddress();
	const muted = colors.mutedForeground;
	const isDark = scheme === "dark";
	const cardBg = isDark ? colors.card : colors.background;

	const savings = Math.round(discountPercentage(data.offer));
	const saveAmount = Math.max(
		0,
		data.offer.original_price - data.offer.discounted_price,
	);
	const includes = splitList(data.offer.includes ?? "");
	const allergens = splitList(data.offer.allergens ?? "");

	return (
		<View style={styles.content}>
			{/* ── Categorías de la oferta + rating ────────────────── */}
			{data.categories.length > 0 || data.offer.rating > 0 ? (
				<View style={styles.categoryRow}>
					<View style={styles.categoryWrap}>
						{data.categories.map((c) => (
							<CategoryBadge
								key={c.id}
								label={c.emoji ? `${c.emoji} ${c.name}` : c.name}
							/>
						))}
					</View>
					{data.offer.rating > 0 ? (
						<View style={styles.ratingRow}>
							<Ionicons name="star" size={18} color={colors.yellow} />
							<AppText variant="bodyMedium" weight="bold">
								{data.offer.rating.toFixed(1)}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: muted }}
							>
								({data.offer.review_count})
							</AppText>
						</View>
					) : null}
				</View>
			) : null}

			{/* ── Título de la oferta + negocio ───────────────────── */}
			<AppText
				variant="h2"
				weight="extraBold"
				style={{ letterSpacing: -0.5, marginTop: spacing.sm }}
			>
				{data.offer.title}
			</AppText>
			<Pressable
				onPress={() =>
					router.push(`/business-profile/${data.offer.business_id}`)
				}
				hitSlop={8}
			>
				<View style={styles.businessSubtitle}>
					<Ionicons name="storefront-outline" size={14} color={muted} />
					<AppText variant="bodyMedium" style={{ color: muted }}>
						{data.business.name}
					</AppText>
				</View>
			</Pressable>

			{/* ── Badges activos: ahorro + stock bajo ─────────────── */}
			<View style={styles.badgeWrap}>
				<View
					style={[styles.pill, { backgroundColor: colors.foreground }]}
				>
					<AppText
						weight="bold"
						style={{ color: colors.background, fontSize: 12 }}
					>
						{strings.offerDetail.savingsBadge.replace(
							"{p}",
							String(savings),
						)}
					</AppText>
				</View>
				{data.offer.stock <= 3 && data.offer.stock > 0 ? (
					<View
						style={[
							styles.pill,
							styles.onlyLeftPill,
							{
								backgroundColor: `${withAlpha(colors.destructive, 0.122)}`,
								borderColor: `${withAlpha(colors.destructive, 0.302)}`,
							},
						]}
					>
						<AppText
							weight="bold"
							style={{ color: colors.destructive, fontSize: 12 }}
						>
							{strings.offerDetail.onlyLeftBadge.replace(
								"{n}",
								String(data.offer.stock),
							)}
						</AppText>
					</View>
				) : null}
			</View>

			{/* ── Precio + ahorro ─────────────────────────────────── */}
			<View style={styles.priceRow}>
				<AppText
					variant="h2"
					weight="extraBold"
					style={{ color: colors.primary }}
				>
					{formatMoneyPrecise(data.offer.discounted_price)}
				</AppText>
				<AppText
					variant="bodyMedium"
					style={{ textDecorationLine: "line-through", color: muted }}
				>
					{formatMoneyPrecise(data.offer.original_price)}
				</AppText>
				{saveAmount > 0 ? (
					<View
						style={[
							styles.savePill,
							{ backgroundColor: `${withAlpha(colors.success, 0.102)}` },
						]}
					>
						<AppText
							variant="labelSmall"
							weight="bold"
							style={{ color: colors.success }}
						>
							{strings.offerDetail.saveAmount.replace(
								"{amount}",
								formatMoney(saveAmount),
							)}
						</AppText>
					</View>
				) : null}
			</View>

			{/* ── Sobre esta oferta ───────────────────────────────── */}
			{data.offer.description || includes.length > 0 ? (
				<InfoCard title={strings.offerDetail.aboutTitle}>
					{data.offer.description ? (
						<AppText
							variant="bodyMedium"
							style={{ color: muted, lineHeight: 20 }}
						>
							{data.offer.description}
						</AppText>
					) : null}
					{includes.length > 0 ? (
						<View style={styles.includesBlock}>
							<AppText variant="labelMedium" weight="bold">
								{strings.offerDetail.whatIncludes}
							</AppText>
							{includes.map((item) => (
								<View key={item} style={styles.listRow}>
									<Ionicons
										name="checkmark-circle"
										size={18}
										color={colors.success}
									/>
									<AppText variant="bodyMedium" style={{ flex: 1 }}>
										{item}
									</AppText>
								</View>
							))}
						</View>
					) : null}
				</InfoCard>
			) : null}

			{/* ── Alérgenos ───────────────────────────────────────── */}
			{allergens.length > 0 ? (
				<InfoCard
					title={strings.business.allergensTitle}
				>
					<View
						style={[
							styles.allergenRow,
							{ backgroundColor: colors.surfaceWarning },
						]}
					>
						{allergens.map((item) => (
							<View
								key={item}
								style={[styles.allergenChip, { backgroundColor: colors.warning }]}
							>
								<AppText variant="bodySmall" weight="semiBold" color={colors.yellowDarkForeground}>
									{item}
								</AppText>
							</View>
						))}
					</View>
				</InfoCard>
			) : null}

			{/* ── Recogida ────────────────────────────────────────── */}
			<InfoCard
				title={strings.offerDetail.pickupSchedule}
			>
				<InfoRow
					icon="calendar-outline"
					label={strings.business.pickupFrom}
					value={formatDateTime(data.offer.pickup_start)}
				/>
				<InfoRow
					icon="time-outline"
					label={strings.business.availableUntil}
					value={formatDateTime(data.offer.pickup_end)}
				/>
				<InfoRow
					icon="cube-outline"
					label={strings.offerDetail.availablePacks}
					value={strings.offerDetail.packsLeftText
						.replace("{stock}", String(data.offer.stock))
						.replace(
							"{initial}",
							String(data.offer.initial_stock || data.offer.stock),
						)}
				/>
				<View style={[styles.noteRow, { backgroundColor: `${withAlpha(colors.primary, 0.051)}` }]}>
					<Ionicons
						name="information-circle-outline"
						size={18}
						color={colors.primary}
					/>
					<AppText
						variant="bodySmall"
						style={{ flex: 1, color: muted, lineHeight: 18 }}
					>
						{strings.offerDetail.counterInstructionsText}
					</AppText>
				</View>
			</InfoCard>

			{/* ── Establecimiento ─────────────────────────────────── */}
			<InfoCard
				title={strings.offerDetail.establishment}
				trailing={
					<Pressable
						onPress={() =>
							router.push(`/business-profile/${data.offer.business_id}`)
						}
					>
						<View
							style={[
								styles.seeLocalPill,
								{ backgroundColor: `${withAlpha(colors.primary, 0.102)}` },
							]}
						>
							<AppText
								weight="bold"
								style={{ color: colors.primary, fontSize: 12 }}
							>
								{strings.offerDetail.seeLocal}
							</AppText>
						</View>
					</Pressable>
				}
			>
				<View style={styles.businessHead}>
					{data.business.image ? (
						<Image
							source={{ uri: data.business.image }}
							style={styles.businessLogo}
						/>
					) : (
						<View style={[styles.businessLogo, styles.businessLogoPlaceholder, { backgroundColor: colors.borderSolid }]}>
							<Ionicons name="storefront-outline" size={20} color={muted} />
						</View>
					)}
					<View style={styles.businessMeta}>
						<AppText variant="h4" weight="bold" numberOfLines={1}>
							{data.business.name}
						</AppText>
						<AppText variant="bodySmall" style={{ color: muted }}>
							{BUSINESS_TYPE_LABELS[data.business.type] ??
								data.business.type}
						</AppText>
					</View>
				</View>
				{(data.business.rating ?? 0) > 0 ? (
					<View style={styles.businessRatingRow}>
						<Ionicons name="star" size={16} color={colors.yellow} />
						<AppText variant="bodyMedium" weight="bold">
							{(data.business.rating ?? 0).toFixed(1)}
						</AppText>
						<AppText variant="bodySmall" style={{ color: muted }}>
							({data.business.review_count})
						</AppText>
					</View>
				) : null}
				<View style={styles.addressRow}>
					<Ionicons name="location-outline" size={16} color={muted} />
					<AppText
						variant="bodyMedium"
						style={{ flex: 1, color: muted, lineHeight: 19 }}
					>
						{distanceSubtitle(data, selectedAddress) ||
							strings.businessProfile.notAvailable}
					</AppText>
				</View>
			</InfoCard>

			{/* ── Card ecológica ───────────────────────────────────── */}
			<View style={[styles.ecoCard, { backgroundColor: cardBg, boxShadow: `0px 4px 10px ${colors.shadow}` }]}>
				<Ionicons name="leaf-outline" size={28} color={colors.success} />
				<AppText
					variant="labelMedium"
					weight="bold"
					style={{ marginTop: spacing.sm }}
				>
					{strings.offerDetail.wasteHero}
				</AppText>
				<AppText
					style={{
						color: muted,
						textAlign: "center",
						lineHeight: 19,
						marginTop: 4,
					}}
				>
					{strings.offerDetail.wasteHeroText}
				</AppText>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: spacing.xl,
	},
	categoryRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	categoryWrap: {
		flex: 1,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	ratingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	businessSubtitle: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: 6,
	},
	badgeWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		marginTop: spacing.xl,
	},
	pill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 99,
	},
	onlyLeftPill: {
		borderWidth: 1,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: spacing.md,
		marginTop: spacing.md,
	},
	savePill: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
	},
	includesBlock: {
		gap: spacing.sm,
	},
	listRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	allergenRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		padding: spacing.md,
		borderRadius: radii.md,
	},
	allergenChip: {
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs + 2,
		borderRadius: radii.pill,
	},
	noteRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		padding: spacing.md,
		borderRadius: radii.md,
	},
	seeLocalPill: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
	},
	businessHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	businessLogo: {
		width: 48,
		height: 48,
		borderRadius: radii.md,
	},
	businessLogoPlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	businessMeta: {
		flex: 1,
		gap: 1,
	},
	businessRatingRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},
	addressRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
	},
	ecoCard: {
		width: "100%",
		alignItems: "center",
		padding: spacing.xl,
		borderRadius: 20,
		marginTop: spacing.xl,
	},
});
