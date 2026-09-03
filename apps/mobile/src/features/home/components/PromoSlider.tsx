import { useCallback, useEffect, useRef, useState } from "react";
import {
	View,
	Text,
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
import { strings } from "@/core/i18n/strings";
import { usePromoSlides, type PromoSlide } from "@/features/slides";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = Math.min((CARD_WIDTH * 9) / 16, 220);
const DOT_ANIM_DURATION = 250;

export function PromoSlider() {
	const { colors } = useTheme();
	const { data: slides = [] } = usePromoSlides();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isPaused, setIsPaused] = useState(false);
	const scrollRef = useRef<ScrollView>(null);
	const step = CARD_WIDTH + spacing.sm;

	// Detecta el salto de "loop" (última slide -> primera) para no animar
	// el indicador cruzando hacia atrás por todos los dots intermedios.
	const prevIndexRef = useRef(0);
	const isWrapRef = useRef(false);

	const goTo = useCallback(
		(index: number, animated = true) => {
			const total = slides.length;
			if (total === 0) {
				setCurrentIndex(0);
				return;
			}
			const nextIndex = ((index % total) + total) % total;
			isWrapRef.current = prevIndexRef.current === total - 1 && nextIndex === 0;
			prevIndexRef.current = nextIndex;
			setCurrentIndex(nextIndex);
			scrollRef.current?.scrollTo({
				x: index * step,
				animated,
			});
		},
		[step, slides.length],
	);

	useEffect(() => {
		const interval = setInterval(() => {
			if (!isPaused && slides.length > 1) {
				goTo(currentIndex + 1);
			}
		}, 5000);
		return () => clearInterval(interval);
	}, [currentIndex, isPaused, goTo]);

	const scrollX = useRef(0);
	const dragStartX = useRef<number | null>(null);
	const dragStartScrollX = useRef(0);
	const dragAreaRef = useRef<View>(null);

	const setIndexFromSnap = useCallback(
		(index: number) => {
			const total = slides.length;
			const isWrap = prevIndexRef.current === total - 1 && index === 0;
			isWrapRef.current = isWrap;
			prevIndexRef.current = index;
			setCurrentIndex(index);
		},
		[slides.length],
	);

	const snapToNearest = useCallback(() => {
		const index = Math.round(scrollX.current / step);
		if (index >= slides.length) {
			setIndexFromSnap(0);
			scrollRef.current?.scrollTo({ x: 0, animated: true });
			return;
		}
		const clamped = Math.max(0, Math.min(index, slides.length - 1));
		setIndexFromSnap(clamped);
		scrollRef.current?.scrollTo({ x: clamped * step, animated: true });
	}, [slides.length, step, setIndexFromSnap]);

	useEffect(() => {
		if (Platform.OS !== "web") return;
		const area = dragAreaRef.current as unknown as HTMLElement | null;
		if (!area) return;

		const maxScroll = step * slides.length;

		const handleDown = (e: MouseEvent) => {
			dragStartX.current = e.pageX;
			dragStartScrollX.current = scrollX.current;
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
			dragStartX.current = null;
			setIsPaused(false);
			snapToNearest();
		};

		area.addEventListener("mousedown", handleDown);
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			area.removeEventListener("mousedown", handleDown);
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, [snapToNearest, step, slides.length]);

	const handleScroll = (event: {
		nativeEvent: { contentOffset: { x: number } };
	}) => {
		scrollX.current = event.nativeEvent.contentOffset.x;
	};

	const handleMomentumEnd = () => {
		setIsPaused(false);
		snapToNearest();
	};

	// Sin contenido activo (o mientras carga) el carrusel no se renderiza.
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
						onMomentumScrollBegin={() => setIsPaused(true)}
						onMomentumScrollEnd={handleMomentumEnd}
						onTouchStart={() => setIsPaused(true)}
						onTouchEnd={handleMomentumEnd}
						contentContainerStyle={{
							paddingHorizontal: spacing.lg,
							gap: spacing.sm,
						}}
						style={{ height: CARD_HEIGHT }}
					>
						{/* Clon de la primera slide al final para el loop continuo. */}
						{[...slides, slides[0]].map((item, i) => (
							<View key={i < slides.length ? item.id : `clone-${item.id}`} style={styles.card}>
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
					inactiveColor={colors.foreground + "33"}
				/>
			)}
		</View>
	);
}

// ─── DotsIndicator ──────────────────────────────────────────────────
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
	// Un Animated.Value por dot (0 = inactivo, 1 = activo).
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
				// En el salto de loop (última -> primera) no animamos:
				// el carrusel ya "avanzó" visualmente hacia el clon, así
				// que el indicador solo debe reflejar el estado final.
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
		// Convención: "/" = ruta interna de la app (ej. /explore); resto, URL externa.
		if (item.redirectUrl.startsWith("/")) {
			router.push(item.redirectUrl as Href);
			return;
		}
		void Linking.openURL(item.redirectUrl).catch(() => {});
	};

	return (
		<View style={[styles.cardInner, { backgroundColor: colors.greenDark, flexDirection: "row" }]}>
			{/* Lado izquierdo sólido — sin Blur ni overlay traslúcido */}
			<View style={styles.cardLeft}>
				<View style={styles.badge}>
					<Text
						style={{
							color: colors.greenDarkForeground + "B3",
							fontSize: 11,
							fontWeight: "600",
							letterSpacing: 0.4,
						}}
					>
						{badgeLabel.toUpperCase()}
					</Text>
				</View>
				<View style={{ gap: 6 }}>
					<Text
						style={{
							color: textColor,
							fontSize: 18,
							fontWeight: "700",
							letterSpacing: -0.3,
							lineHeight: 22,
						}}
					>
						{item.title}
					</Text>
					<Text
						numberOfLines={2}
						style={{
							color: textColor + "CC",
							fontSize: 12,
							lineHeight: 16,
						}}
					>
						{item.caption}
					</Text>
				</View>
				{item.ctaLabel &&
				(item.type === "coupon" ? item.couponCode : item.redirectUrl) ? (
					<Pressable
						accessibilityRole="button"
						onPress={handleCtaPress}
						style={({ pressed }) => [
							styles.promoButton,
							{ backgroundColor: item.buttonColor ?? colors.primary },
							pressed && styles.promoButtonPressed,
						]}
					>
						<Text
							style={{
								color: colors.primaryForeground,
								fontSize: 14,
								fontWeight: "700",
							}}
						>
							{item.ctaLabel}
						</Text>
					</Pressable>
				) : null}
			</View>
			{/* Lado derecho imagen limpia — sin velo */}
			<View style={styles.cardRight}>
				{item.imageUrl ? (
					<Image source={{ uri: item.imageUrl }} style={styles.cardRightImage} resizeMode="cover" />
				) : (
					<View style={[styles.cardRightImage, { backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }]} />
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
		boxShadow: `0px 8px 20px #00000014`,
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
		backgroundColor: "rgba(255,255,255,0.14)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.18)",
	},
	promoButton: {
		height: 38,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 16,
		boxShadow: `0px 4px 12px #00000022`,
	},
	promoButtonPressed: {
		opacity: 0.85,
		transform: [{ scale: 0.98 }],
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