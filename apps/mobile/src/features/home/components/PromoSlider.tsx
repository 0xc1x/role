import { useCallback, useEffect, useRef, useState } from "react";
import {
	View,
	StyleSheet,
	ScrollView,
	Image,
	Dimensions,
	Pressable,
	Platform,
	Linking,
	Animated,
} from "react-native";
import { type Href, router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { toast } from "sonner-native";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import { AppText, Button } from "@/core/ui";
import { strings } from "@/core/i18n/strings";
import { usePromoSlides, type PromoSlide } from "@/features/slides";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = Math.min((CARD_WIDTH * 9) / 16, 220);
const DOT_ANIM_DURATION = 250;
const SCROLL_SETTLE_DELAY = 120;

export function PromoSlider() {
	const { colors } = useTheme();
	const { data: slides = [] } = usePromoSlides();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isPaused, setIsPaused] = useState(false);

	const scrollRef = useRef<ScrollView>(null);
	const step = CARD_WIDTH + spacing.sm;

	// ── Loop infinito ────────────────────────────────────────────────
	const total = slides.length;
	const hasLoop = total > 1;

	const loopSlides = hasLoop
		? [slides[total - 1], ...slides, slides[0]]
		: slides;

	// offset real dentro del ScrollView (1 = primera slide real)
	const toScrollX = useCallback(
		(logicalIndex: number) => (hasLoop ? logicalIndex + 1 : logicalIndex) * step,
		[hasLoop, step],
	);

	const prevIndexRef = useRef(0);
	const isWrapRef = useRef(false);

	const goTo = useCallback(
		(logicalIndex: number, animated = true) => {
			if (total === 0) {
				setCurrentIndex(0);
				return;
			}
			const next = ((logicalIndex % total) + total) % total;
			isWrapRef.current =
				(prevIndexRef.current === total - 1 && next === 0) ||
				(prevIndexRef.current === 0 && next === total - 1);
			prevIndexRef.current = next;
			setCurrentIndex(next);
			scrollRef.current?.scrollTo({
				x: toScrollX(next),
				animated,
			});
		},
		[total, toScrollX],
	);

	// Posicionar en la primera slide real al montar / cuando llegan datos
	const didInit = useRef(false);
	useEffect(() => {
		if (total === 0 || didInit.current) return;
		didInit.current = true;
		// Sin animación para no “parpadear”
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({ x: toScrollX(0), animated: false });
		});
	}, [total, toScrollX]);

	// Autoplay
	useEffect(() => {
		if (!hasLoop) return;
		const interval = setInterval(() => {
			if (!isPaused) {
				goTo(currentIndex + 1);
			}
		}, 5000);
		return () => clearInterval(interval);
	}, [currentIndex, isPaused, goTo, hasLoop]);

	const scrollX = useRef(hasLoop ? step : 0); // empezamos en la primera real
	const dragStartX = useRef<number | null>(null);
	const dragStartScrollX = useRef(0);
	const dragAreaRef = useRef<View>(null);

	const setIndexFromSnap = useCallback(
		(logicalIndex: number) => {
			const isWrap =
				(prevIndexRef.current === total - 1 && logicalIndex === 0) ||
				(prevIndexRef.current === 0 && logicalIndex === total - 1);
			isWrapRef.current = isWrap;
			prevIndexRef.current = logicalIndex;
			setCurrentIndex(logicalIndex);
		},
		[total],
	);

	/** Convierte offset de scroll → índice lógico [0..total-1] y corrige clones. */
	const normalizeAndSnap = useCallback(() => {
		if (total === 0) return;

		let rawIndex = Math.round(scrollX.current / step);

		if (!hasLoop) {
			const clamped = Math.max(0, Math.min(rawIndex, total - 1));
			setIndexFromSnap(clamped);
			scrollRef.current?.scrollTo({ x: clamped * step, animated: true });
			return;
		}

		if (rawIndex <= 0) {
			// Estamos en el clon de la izquierda → saltar a la última real
			const logical = total - 1;
			setIndexFromSnap(logical);
			scrollRef.current?.scrollTo({ x: toScrollX(logical), animated: false });
			scrollX.current = toScrollX(logical);
			return;
		}

		if (rawIndex >= total + 1) {
			setIndexFromSnap(0);
			scrollRef.current?.scrollTo({ x: toScrollX(0), animated: false });
			scrollX.current = toScrollX(0);
			return;
		}

		// Slide real
		const logical = rawIndex - 1;
		setIndexFromSnap(logical);
		scrollRef.current?.scrollTo({ x: toScrollX(logical), animated: true });
	}, [total, hasLoop, step, toScrollX, setIndexFromSnap]);

	// ── Coordinación de snap ─────────────────────────────────────────
	const isUserInteractingRef = useRef(false);
	const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearSettleTimeout = useCallback(() => {
		if (settleTimeout.current) {
			clearTimeout(settleTimeout.current);
			settleTimeout.current = null;
		}
	}, []);

	useEffect(() => () => clearSettleTimeout(), [clearSettleTimeout]);

	const handleTouchStart = useCallback(() => {
		isUserInteractingRef.current = true;
		clearSettleTimeout();
		setIsPaused(true);
	}, [clearSettleTimeout]);

	// Drag con mouse (web)
	useEffect(() => {
		if (Platform.OS !== "web") return;
		const area = dragAreaRef.current as unknown as HTMLElement | null;
		if (!area) return;

		const maxScroll = step * (hasLoop ? total + 1 : total - 1);

		const handleDown = (e: MouseEvent) => {
			dragStartX.current = e.pageX;
			dragStartScrollX.current = scrollX.current;
			isUserInteractingRef.current = true;
			clearSettleTimeout();
			setIsPaused(true);
		};

		const handleMove = (e: MouseEvent) => {
			if (dragStartX.current == null) return;
			const dx = e.pageX - dragStartX.current;
			const newX = Math.max(0, Math.min(dragStartScrollX.current - dx, maxScroll));
			scrollX.current = newX;
			scrollRef.current?.scrollTo({ x: newX, animated: false });
		};

		const handleUp = () => {
			if (dragStartX.current == null) return;
			dragStartX.current = null;
			clearSettleTimeout();
			isUserInteractingRef.current = false;
			setIsPaused(false);
			normalizeAndSnap();
		};

		area.addEventListener("mousedown", handleDown);
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			area.removeEventListener("mousedown", handleDown);
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [normalizeAndSnap, step, total, hasLoop, clearSettleTimeout]);

	const handleScroll = (event: {
		nativeEvent: { contentOffset: { x: number } };
	}) => {
		scrollX.current = event.nativeEvent.contentOffset.x;
		if (!isUserInteractingRef.current) return;

		clearSettleTimeout();
		settleTimeout.current = setTimeout(() => {
			isUserInteractingRef.current = false;
			setIsPaused(false);
			normalizeAndSnap();
		}, SCROLL_SETTLE_DELAY);
	};

	if (slides.length === 0) return null;

	return (
		<View style={styles.container}>
			<View style={styles.sliderWrap}>
				<View ref={dragAreaRef}>
					<ScrollView
						ref={scrollRef}
						horizontal
						showsHorizontalScrollIndicator={false}
						snapToInterval={step}
						snapToAlignment="center"
						decelerationRate="fast"
						disableIntervalMomentum
						pagingEnabled={false}
						onScroll={handleScroll}
						scrollEventThrottle={16}
						onTouchStart={handleTouchStart}
						contentContainerStyle={{
							paddingHorizontal: spacing.lg,
							gap: spacing.sm,
						}}
						style={{ height: CARD_HEIGHT }}
					>
						{loopSlides.map((item, i) => (
							<View
								key={
									hasLoop
										? i === 0
											? `clone-last-${item.id}`
											: i === loopSlides.length - 1
												? `clone-first-${item.id}`
												: item.id
										: item.id
								}
								style={[
									styles.card,
									{ boxShadow: `0px 8px 20px ${colors.shadow}` },
								]}
							>
								<PromoCard item={item} />
							</View>
						))}
					</ScrollView>
				</View>
			</View>

			{slides.length > 1 && (
				<DotsIndicator
					count={slides.length}
					activeIndex={currentIndex}
					isWrap={isWrapRef.current}
					onPressDot={(index) => goTo(index)}
					activeColor={colors.primary}
					inactiveColor={withAlpha(colors.foreground, 0.2)}
				/>
			)}
		</View>
	);
}

// ─── DotsIndicator (sin cambios) ────────────────────────────────────
function DotsIndicator({
	count,
	activeIndex,
	isWrap,
	onPressDot,
	activeColor,
	inactiveColor,
}: {
	count: number;
	activeIndex: number;
	isWrap: boolean;
	onPressDot: (index: number) => void;
	activeColor: string;
	inactiveColor: string;
}) {
	const animsRef = useRef<Animated.Value[]>([]);
	if (animsRef.current.length !== count) {
		animsRef.current = Array.from(
			{ length: count },
			(_, i) => new Animated.Value(i === activeIndex ? 1 : 0),
		);
	}

	useEffect(() => {
		const animations = animsRef.current.map((anim, i) =>
			Animated.timing(anim, {
				toValue: i === activeIndex ? 1 : 0,
				duration: isWrap ? 0 : DOT_ANIM_DURATION,
				useNativeDriver: false,
			}),
		);
		Animated.parallel(animations).start();
	}, [activeIndex, isWrap]);

	return (
		<View style={styles.dotsContainer}>
			{animsRef.current.map((anim, index) => {
				const width = anim.interpolate({
					inputRange: [0, 1],
					outputRange: [8, 22],
				});
				const backgroundColor = anim.interpolate({
					inputRange: [0, 1],
					outputRange: [inactiveColor, activeColor],
				});
				return (
					<Pressable key={index} onPress={() => onPressDot(index)} hitSlop={6}>
						<Animated.View style={[styles.dot, { width, backgroundColor }]} />
					</Pressable>
				);
			})}
		</View>
	);
}

// ─── PromoCard (sin cambios) ────────────────────────────────────────
function PromoCard({ item }: { item: PromoSlide }) {
	const { colors } = useTheme();
	const badgeLabel =
		item.badgeText ??
		(item.isSponsored
			? strings.home.promoSponsored
			: item.type === "coupon"
				? strings.home.promoCoupon
				: strings.home.promoTips);
	const textColor = item.textColor ?? colors.greenDarkForeground;

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
				{ backgroundColor: colors.greenDark, flexDirection: "row" },
			]}
		>
			<View style={styles.cardLeft}>
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
							color: withAlpha(colors.greenDarkForeground, 0.7),
							fontSize: 11,
							letterSpacing: 0.4,
						}}
					>
						{badgeLabel.toUpperCase()}
					</AppText>
				</View>
				<View style={{ gap: 6 }}>
					<AppText
						weight="bold"
						style={{
							color: textColor,
							fontSize: 18,
							letterSpacing: -0.3,
							lineHeight: 22,
						}}
					>
						{item.title}
					</AppText>
					<AppText
						numberOfLines={2}
						style={{
							color: withAlpha(textColor, 0.8),
							fontSize: 12,
							lineHeight: 16,
						}}
					>
						{item.caption}
					</AppText>
				</View>
				{item.ctaLabel &&
				(item.type === "coupon" ? item.couponCode : item.redirectUrl) ? (
					<Button
						label={item.ctaLabel}
						onPress={handleCtaPress}
						size="sm"
						style={{ backgroundColor: item.buttonColor ?? colors.primary }}
					/>
				) : null}
			</View>
			<View style={styles.cardRight}>
				{item.imageUrl ? (
					<Image
						source={{ uri: item.imageUrl }}
						style={styles.cardRightImage}
						resizeMode="cover"
					/>
				) : (
					<View
						style={[
							styles.cardRightImage,
							{
								backgroundColor: colors.muted,
								alignItems: "center",
								justifyContent: "center",
							},
						]}
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
	sliderWrap: {
		position: "relative",
	},
	card: {
		width: CARD_WIDTH,
		height: CARD_HEIGHT,
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	cardInner: {
		flex: 1,
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	cardLeft: {
		width: "54%",
		paddingHorizontal: 18,
		paddingVertical: 16,
		justifyContent: "space-between",
		gap: 10,
	},
	cardRight: {
		width: "46%",
		overflow: "hidden",
	},
	cardRightImage: {
		width: "100%",
		height: "100%",
	},
	badge: {
		alignSelf: "flex-start",
		paddingHorizontal: 10,
		paddingVertical: 5,
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
		borderRadius: 4,
	},
});