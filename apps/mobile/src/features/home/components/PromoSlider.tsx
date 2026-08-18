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
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { strings } from "@/core/i18n/strings";

interface PromoItem {
	id: string;
	title: string;
	message: string;
	imageUrl: string;
	icon?: string;
	isSponsored?: boolean;
}

const PROMO_ITEMS: PromoItem[] = [
	{
		id: "1",
		title: strings.home.promo1Title,
		message: strings.home.promo1Body,
		imageUrl:
			"https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&fit=crop",
	},
	{
		id: "2",
		title: strings.home.promo2Title,
		message: strings.home.promo2Body,
		imageUrl:
			"https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=400&fit=crop",
	},
	{
		id: "3",
		title: strings.home.promo3Title,
		message: strings.home.promo3Body,
		imageUrl:
			"https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&fit=crop",
	},
	{
		id: "4",
		title: strings.home.promo4Title,
		message: strings.home.promo4Body,
		imageUrl:
			"https://images.unsplash.com/photo-1574484284002-952d92456975?w=400&fit=crop",
		isSponsored: true,
	},
];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;
const CARD_HEIGHT = Math.min((CARD_WIDTH * 9) / 16, 220);

export function PromoSlider() {
	const { colors } = useTheme();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isPaused, setIsPaused] = useState(false);
	const scrollRef = useRef<ScrollView>(null);
	const step = CARD_WIDTH + spacing.sm;

	const goTo = useCallback(
		(index: number, animated = true) => {
			const total = PROMO_ITEMS.length;
			const clamped = ((index % total) + total) % total;
			setCurrentIndex(clamped);
			scrollRef.current?.scrollTo({
				x: clamped * step,
				animated,
			});
		},
		[step],
	);

	const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
	const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

	useEffect(() => {
		const interval = setInterval(() => {
			if (!isPaused && PROMO_ITEMS.length > 1) {
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
		if (index >= 0 && index < PROMO_ITEMS.length) setCurrentIndex(index);
	};

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
						{PROMO_ITEMS.map((item) => (
							<View key={item.id} style={styles.card}>
								<PromoCard item={item} />
							</View>
						))}
					</ScrollView>
				</View>
				{PROMO_ITEMS.length > 1 && (
					<>
						<Pressable
							onPress={goPrev}
							accessibilityLabel="Anterior"
							style={[
								styles.navButton,
								styles.navLeft,
								{ backgroundColor: colors.card + "CC" },
							]}
						>
							<Ionicons name="chevron-back" size={22} color={colors.foreground} />
						</Pressable>
						<Pressable
							onPress={goNext}
							accessibilityLabel="Siguiente"
							style={[
								styles.navButton,
								styles.navRight,
								{ backgroundColor: colors.card + "CC" },
							]}
						>
							<Ionicons name="chevron-forward" size={22} color={colors.foreground} />
						</Pressable>
					</>
				)}
			</View>

			{PROMO_ITEMS.length > 1 && (
				<View style={styles.dotsContainer}>
					{PROMO_ITEMS.map((_, index) => (
						<Pressable key={index} onPress={() => goTo(index)}>
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

function PromoCard({ item }: { item: PromoItem }) {
	const { colors } = useTheme();
	const halfWidth = CARD_WIDTH / 2;

	return (
		<View style={[styles.cardInner, { backgroundColor: colors.greenDark }]}>
			<Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
			<BlurView intensity={40} tint="dark" style={styles.cardImage} />
			<View style={styles.gradientOverlay} />
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
			<View style={styles.cardContent}>
				<View style={styles.badge}>
					<Text
						style={{
							color: colors.greenDarkForeground + "B3",
							fontSize: 11,
							fontWeight: "500",
						}}
					>
						{item.isSponsored
							? strings.home.promoSponsored
							: strings.home.promoTips}
					</Text>
				</View>
				<View>
					<Text
						style={{
							color: colors.greenDarkForeground,
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
							color: colors.greenDarkForeground + "B3",
							fontSize: 12,
							lineHeight: 17,
							marginTop: 6,
						}}
					>
						{item.message}
					</Text>
				</View>
				<Pressable
					style={({ pressed }) => [
						styles.promoButton,
						{ backgroundColor: colors.primary },
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
						{strings.home.promoSeeMore}
					</Text>
				</Pressable>
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
	navButton: {
		position: "absolute",
		top: "50%",
		marginTop: -20,
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 10,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 6,
		elevation: 4,
	},
	navLeft: {
		left: spacing.lg,
	},
	navRight: {
		right: spacing.lg,
	},
	card: {
		width: CARD_WIDTH,
		height: CARD_HEIGHT,
		borderRadius: radii.md,
		overflow: "hidden",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.12,
		shadowRadius: 16,
		elevation: 4,
	},
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
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 10,
		elevation: 4,
	},
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
