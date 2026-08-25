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
import { BlurView } from "expo-blur";

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
			dragStartX.current = null;
			setIsPaused(false);
		};

		area.addEventListener("mousedown", handleDown);
		window.addEventListener("mousemove", handleMove);
		window.addEventListener("mouseup", handleUp);
		return () => {
			area.removeEventListener("mousedown", handleDown);
			window.removeEventListener("mousemove", handleMove);
			window.removeEventListener("mouseup", handleUp);
		};
	}, []);

	const handleScroll = (event: {
		nativeEvent: { contentOffset: { x: number } };
	}) => {
		scrollX.current = event.nativeEvent.contentOffset.x;
		const index = Math.round(event.nativeEvent.contentOffset.x / step);
		// Llegó al clon de la primera slide: reset silencioso al inicio real.
		// El clon es idéntico, así que el salto es invisible.
		if (index >= slides.length) {
			setCurrentIndex(0);
			scrollRef.current?.scrollTo({ x: 0, animated: false });
			return;
		}
		if (index >= 0 && index < slides.length) setCurrentIndex(index);
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
						decelerationRate="fast"
						onScroll={handleScroll}
						scrollEventThrottle={16}
						onMomentumScrollBegin={() => setIsPaused(true)}
						onMomentumScrollEnd={() => setIsPaused(false)}
						onTouchStart={() => setIsPaused(true)}
						onTouchEnd={() => setIsPaused(false)}
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
	const halfWidth = CARD_WIDTH / 2;
	const badgeLabel =
		item.badgeText ??
		(item.isSponsored ? strings.home.promoSponsored : strings.home.promoTips);
	const textColor = item.textColor ?? colors.greenDarkForeground;

	const openRedirect = () => {
		if (!item.redirectUrl) return;
		void Linking.openURL(item.redirectUrl).catch(() => {
			// URL inválida o sin handler: no rompemos la UI.
		});
	};

	return (
		<View style={[styles.cardInner, { backgroundColor: colors.greenDark }]}>
			{item.imageUrl ? (
				<>
					<Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
					<BlurView intensity={40} tint="dark" style={styles.cardImage} />
				</>
			) : null}
			<View style={styles.gradientOverlay} />
			{item.imageUrl ? (
				<View
					style={[
						styles.rightImage,
						{
							left: halfWidth,
							width: halfWidth,
						},
					]}
				>
					<Image
						source={{ uri: item.imageUrl }}
						style={styles.cardImage}
						resizeMode="cover"
					/>
				</View>
			) : null}
			<View style={styles.cardContent}>
				<View style={styles.badge}>
					<Text
						style={{
							color: colors.greenDarkForeground + "B3",
							fontSize: 11,
							fontWeight: "500",
						}}
					>
						{badgeLabel}
					</Text>
				</View>
				<View>
					<Text
						style={{
							color: textColor,
							fontSize: 18,
							fontWeight: "600",
							letterSpacing: -0.2,
						}}
					>
						{item.title}
					</Text>
					<Text
						numberOfLines={3}
						style={{
							color: textColor + "B3",
							fontSize: 12,
							lineHeight: 17,
							marginTop: 6,
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
								fontSize: 15,
								fontWeight: "600",
							}}
						>
							{item.ctaLabel}
						</Text>
					</Pressable>
				) : null}
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
		borderRadius: radii.md,
		overflow: "hidden",
		boxShadow: `0px 6px 16px #0000001f`,	},
	cardInner: {
		flex: 1,
		borderRadius: radii.md,
		overflow: "hidden",
	},
	cardImage: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	gradientOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		bottom: 0,
		width: "70%",
		backgroundColor: "rgba(17,28,21,0.55)",
	},
	rightImage: {
		position: "absolute",
		top: 0,
		bottom: 0,
	},
	cardContent: {
		position: "absolute",
		top: 0,
		left: 0,
		bottom: 0,
		width: "52%",
		paddingHorizontal: 18,
		paddingVertical: 16,
		justifyContent: "space-between",
	},
	badge: {
		alignSelf: "flex-start",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		backgroundColor: "rgba(255,255,255,0.12)",
	},
	promoButton: {
		height: 42,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		boxShadow: `0px 4px 10px #0000004d`,	},
	promoButtonPressed: {
		opacity: 0.85,
	},
	dotsContainer: {
		flexDirection: "row",
		justifyContent: "center",
		gap: 6,
		marginTop: spacing.sm,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	dotActive: {
		width: 20,
	},
});
