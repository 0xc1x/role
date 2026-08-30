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
} from "react-native";

import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { strings } from "@/core/i18n/strings";
import { usePromoSlides, type PromoSlide } from "@/features/slides";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = Math.min((CARD_WIDTH * 9) / 16, 220);

export function PromoSlider() {
	const { colors } = useTheme();
	const { data: slides = [] } = usePromoSlides();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isPaused, setIsPaused] = useState(false);
	const scrollRef = useRef<ScrollView>(null);
	const step = CARD_WIDTH + spacing.sm;

	const goTo = useCallback(
		(index: number, animated = true) => {
			const total = slides.length;
			setCurrentIndex(total === 0 ? 0 : ((index % total) + total) % total);
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
	const dragAreaRef = useRef<View>(null);

	const snapToNearest = useCallback(() => {
		const index = Math.round(scrollX.current / step);
		if (index >= slides.length) {
			setCurrentIndex(0);
			scrollRef.current?.scrollTo({ x: 0, animated: true });
			return;
		}
		const clamped = Math.max(0, Math.min(index, slides.length - 1));
		setCurrentIndex(clamped);
		scrollRef.current?.scrollTo({ x: clamped * step, animated: true });
	}, [slides.length, step]);

	useEffect(() => {
		if (Platform.OS !== "web") return;
		const area = dragAreaRef.current as unknown as HTMLElement | null;
		if (!area) return;

		const handleDown = (e: MouseEvent) => {
			dragStartX.current = e.pageX;
			setIsPaused(true);
		};
		const handleMove = (e: MouseEvent) => {
			if (dragStartX.current == null) return;
			const dx = e.pageX - dragStartX.current;
			if (scrollRef.current) {
				scrollRef.current.scrollTo({
					x: scrollX.current - dx,
					animated: false,
				});
			}
		};
		const handleUp = () => {
			if (dragStartX.current != null) {
				// actualiza scrollX con el delta final antes de snear
				// el último handleMove ya dejó scrollX desfasado, recalcula
			}
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
	}, [snapToNearest]);

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
				<View style={styles.dotsContainer}>
					{slides.map((item, index) => (
						<Pressable key={item.id} onPress={() => goTo(index)}>
							<View
								style={[
									styles.dot,
									index === currentIndex && styles.dotActive,
									{
										backgroundColor:
											index === currentIndex
												? colors.primary
												: colors.foreground + "33",
									},
								]}
							/>
						</Pressable>
					))}
				</View>
			)}
		</View>
	);
}

function PromoCard({ item }: { item: PromoSlide }) {
	const { colors } = useTheme();
	const badgeLabel =
		item.badgeText ??
		(item.isSponsored ? strings.home.promoSponsored : strings.home.promoTips);
	const textColor = item.textColor ?? colors.greenDarkForeground;

	const openRedirect = () => {
		if (!item.redirectUrl) return;
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
				{item.ctaLabel && item.redirectUrl ? (
					<Pressable
						accessibilityRole="button"
						onPress={openRedirect}
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
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	dotActive: {
		width: 22,
	},
});
