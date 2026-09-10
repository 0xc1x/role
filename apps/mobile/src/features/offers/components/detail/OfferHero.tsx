import { Animated, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { CircleIconButton, goBackOr, HeartButton } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";

export function OfferHero({
	image,
	headerHeight,
	headerOpacity,
	topOffset,
	isFavorite,
	onToggleFavorite,
}: {
	image: string | null;
	headerHeight: Animated.AnimatedInterpolation<number>;
	headerOpacity: Animated.AnimatedInterpolation<number>;
	topOffset: number;
	isFavorite: boolean;
	onToggleFavorite: () => void;
}) {
	const { colors } = useTheme();
	return (
		<>
			<Animated.View
				style={[
					styles.header,
					{ height: headerHeight, opacity: headerOpacity, pointerEvents: "none" },
				]}
			>
				{image ? (
					<Image
						source={{ uri: image }}
						style={styles.headerImage}
						contentFit="cover"
					/>
				) : (
					<View
						style={[styles.headerImage, { backgroundColor: colors.muted }]}
					/>
				)}
				<LinearGradient
					colors={[
						`${withAlpha(colors.foreground, 0.451)}`,
						"transparent",
						colors.background,
					]}
					locations={[0, 0.5, 1]}
					style={styles.headerGradient}
				/>
			</Animated.View>

			<View style={[styles.topBar, { top: topOffset }]}>
				<CircleIconButton
					icon={
						<Ionicons
							name="chevron-back"
							size={20}
							color={colors.foreground}
						/>
					}
					onPress={() => goBackOr("/(consumer)")}
				/>
				<HeartButton
					isFavorite={isFavorite}
					onPress={onToggleFavorite}
				/>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	header: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		overflow: "hidden",
	},
	headerImage: {
		width: "100%",
		height: "100%",
		position: "absolute",
	},
	headerGradient: {
		position: "absolute",
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
	},
	topBar: {
		position: "absolute",
		left: spacing.xl,
		right: spacing.xl,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});
