import { useCallback, useMemo, useRef } from "react";
import {
	View,
	StyleSheet,
	Pressable,
	Platform,
	Linking,
	useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { type Href, router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { toast } from "sonner-native";
import { Carousel, type CarouselRef } from "react-native-reanimated-carousel";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	interpolateColor,
	type SharedValue,
} from "react-native-reanimated";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { AppText } from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { strings } from "@/src/core/i18n/strings";
import { usePromoSlides, type PromoSlide } from "@/src/features/slides";
import { Button } from "@/components/ui/button";

const AUTOPLAY_MS = 5000;

export function PromoSlider() {
	const { colors } = useTheme();
	const { width: screenWidth } = useWindowDimensions();
	const { data: slides = [], isLoading } = usePromoSlides();

	const CARD_WIDTH = screenWidth - spacing.lg * 2;
	const CARD_HEIGHT = Math.min((CARD_WIDTH * 9) / 16, 220);
	const slideStyle = useMemo(
		() => ({ width: screenWidth, paddingHorizontal: spacing.lg }),
		[screenWidth],
	);
	const cardStyle = useMemo(
		() => [
			styles.card,
			{
				width: CARD_WIDTH,
				height: CARD_HEIGHT,
				...Platform.select({
					ios: {
						shadowColor: colors.shadow,
						shadowOffset: { width: 0, height: 8 },
						shadowOpacity: 0.15,
						shadowRadius: 12,
					},
					android: { elevation: 6 },
					web: { boxShadow: `0px 8px 20px ${colors.shadow}` },
				}),
			},
		],
		[CARD_WIDTH, CARD_HEIGHT, colors.shadow],
	);

	const carouselRef = useRef<CarouselRef>(null);
	const progress = useSharedValue(0);

	const total = slides.length;
	const hasLoop = total > 1;

	const goTo = useCallback(
		(index: number) => {
			if (total === 0) return;
			carouselRef.current?.scrollTo({ index, animated: true });
		},
		[total],
	);

	if (isLoading) {
		return (
			<View style={styles.container}>
				<View style={{ paddingHorizontal: spacing.lg }}>
					<Skeleton
						style={{
							width: CARD_WIDTH,
							height: CARD_HEIGHT,
							borderRadius: radii.xl,
						}}
					/>
				</View>
			</View>
		);
	}

	if (slides.length === 0) return null;

	return (
		<View style={styles.container}>
			<Carousel
				ref={carouselRef}
				data={slides}
				loop={hasLoop}
				autoplay={hasLoop}
				autoplayInterval={AUTOPLAY_MS}
				style={{ width: screenWidth, height: CARD_HEIGHT }}
				progress={progress}
				renderItem={({ item }) => (
					<View style={slideStyle}>
						<View style={cardStyle}>
							<PromoCard item={item} />
						</View>
					</View>
				)}
			/>

			{total > 1 && (
				<DotsIndicator
					count={total}
					progress={progress}
					onPressDot={goTo}
					activeColor={colors.primary}
					inactiveColor={withAlpha(colors.foreground, 0.2)}
				/>
			)}
		</View>
	);
}

function DotsIndicator({
	count,
	progress,
	onPressDot,
	activeColor,
	inactiveColor,
}: {
	count: number;
	progress: SharedValue<number>;
	onPressDot: (index: number) => void;
	activeColor: string;
	inactiveColor: string;
}) {
	return (
		<View style={styles.dotsContainer}>
			{Array.from({ length: count }).map((_, index) => (
				<Dot
					key={`promo-dot-${index}`}
					index={index}
					count={count}
					progress={progress}
					onPress={() => onPressDot(index)}
					activeColor={activeColor}
					inactiveColor={inactiveColor}
				/>
			))}
		</View>
	);
}

function Dot({
	index,
	count,
	progress,
	onPress,
	activeColor,
	inactiveColor,
}: {
	index: number;
	count: number;
	progress: SharedValue<number>;
	onPress: () => void;
	activeColor: string;
	inactiveColor: string;
}) {
	const animatedStyle = useAnimatedStyle(() => {
		// progress.value no está acotado en modo loop (puede crecer o decrecer
		// indefinidamente tras varias vueltas), así que primero lo normalizamos
		// al rango [0, count) antes de medir la distancia más corta al índice.
		let diff = (progress.value - index) % count;
		if (diff < 0) diff += count;
		const loopedDiff = Math.min(diff, count - diff);
		const t = Math.max(0, 1 - Math.min(loopedDiff, 1)); // 1 = activo, 0 = inactivo

		return {
			width: 8 + t * 14,
			backgroundColor: interpolateColor(
				t,
				[0, 1],
				[inactiveColor, activeColor],
			),
		};
	});

	return (
		<Pressable onPress={onPress} hitSlop={6}>
			<Animated.View style={[styles.dot, animatedStyle]} />
		</Pressable>
	);
}

function PromoCard({ item }: { item: PromoSlide }) {
	const { colors } = useTheme();
	const badgeLabel =
		item.badgeText ??
		(item.isSponsored
			? strings.home.promoSponsored
			: item.type === "coupon"
				? strings.home.promoCoupon
				: strings.home.promoTips);
	const textColor = item.textColor ?? colors.accentForeground;
	const hasCta = Boolean(
		item.ctaLabel &&
			(item.type === "coupon" ? item.couponCode : item.redirectUrl),
	);

	const handleCtaPress = () => {
		if (item.type === "coupon") {
			if (!item.couponCode) return;
			void Clipboard.setStringAsync(item.couponCode).then(() => {
				toast.success(strings.home.couponCopied);
			});
			return;
		}
		if (!item.redirectUrl) return;
		if (item.redirectUrl.startsWith("/")) {
			router.push(item.redirectUrl as Href);
			return;
		}
		void Linking.openURL(item.redirectUrl).catch(() => {});
	};

	return (
		<View
			style={[
				styles.cardInner,
				{ backgroundColor: colors.accent, flexDirection: "row" },
			]}
		>
			<View style={styles.cardLeft}>
				<View
					style={[
						styles.cardLeftContent,
						{ justifyContent: hasCta ? "flex-start" : "center" },
					]}
				>
					<View
						style={[
							styles.badge,
							{
								backgroundColor: withAlpha(colors.onMedia, 0.14),
								borderColor: withAlpha(colors.onMedia, 0.18),
							},
						]}
					>
						<AppText
							weight="semiBold"
							style={{
								color: withAlpha(colors.accentForeground, 0.7),
								fontSize: 11,
								letterSpacing: 0.4,
							}}
						>
							{badgeLabel.toUpperCase()}
						</AppText>
					</View>

					<AppText
						weight="bold"
						numberOfLines={hasCta ? 1 : 2}
						style={{
							color: textColor,
							fontSize: 17,
							letterSpacing: -0.3,
							lineHeight: 21,
							marginTop: 6,
						}}
					>
						{item.title}
					</AppText>

					<AppText
						numberOfLines={hasCta ? 3 : 6}
						style={{
							color: withAlpha(textColor, 0.8),
							fontSize: 12,
							lineHeight: 16,
							marginTop: 4,
							flexShrink: 1,
						}}
					>
						{item.caption}
					</AppText>
				</View>

				{hasCta ? (
					<Button
						onPress={handleCtaPress}
						size="sm"
						// secondary (#DCCBF5 / texto #371949): default (primary #371949)
						// se fundiría con el fondo accent #311743 en light.
						variant="secondary"
						style={[
							item.buttonColor ? { backgroundColor: item.buttonColor } : null,
							{ marginTop: 8 },
						]}
					>
						{item.ctaLabel ?? ""}
					</Button>
				) : null}
			</View>

			<View style={styles.cardRight}>
				{item.imageUrl ? (
					<Image
						source={{ uri: item.imageUrl }}
						style={styles.cardRightImage}
						contentFit="cover"
					/>
				) : (
					<View
						style={[styles.cardRightImage, { backgroundColor: colors.muted }]}
					/>
				)}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.md,
	},
	card: {
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	cardInner: {
		flex: 1,
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	cardLeft: {
		width: "55%",
		paddingHorizontal: 14,
		paddingVertical: 12,
		justifyContent: "space-between",
	},
	cardLeftContent: {
		flex: 1,
		justifyContent: "flex-start",
	},
	cardRight: {
		width: "45%",
		overflow: "hidden",
	},
	cardRightImage: {
		width: "100%",
		height: "100%",
	},
	badge: {
		alignSelf: "flex-start",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	dotsContainer: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 8,
		marginTop: spacing.sm,
	},
	dot: {
		height: 8,
		borderRadius: radii.pill,
	},
});
