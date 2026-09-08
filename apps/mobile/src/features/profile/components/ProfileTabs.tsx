import { useRef, useState } from "react";
import {
	Animated,
	Pressable,
	StyleSheet,
	View,
	type LayoutChangeEvent,
} from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

export type ProfileTab = "history" | "settings";

const TAB_INDICATOR_DURATION = 220;

export function ProfileTabs({
	active,
	onChange,
}: {
	active: ProfileTab;
	onChange: (tab: ProfileTab) => void;
}) {
	const { colors } = useTheme();
	const tabs: Array<{ key: ProfileTab; label: string }> = [
		{ key: "history", label: strings.profile.historyTab },
		{ key: "settings", label: strings.profile.settingsTab },
	];

	// Layout real (x, width) de cada tab, medido con onLayout.
	const layoutsRef = useRef<Record<number, { x: number; width: number }>>({});
	const [indicatorReady, setIndicatorReady] = useState(false);
	const indicatorX = useRef(new Animated.Value(0)).current;
	const indicatorWidth = useRef(new Animated.Value(0)).current;

	const activeIndex = tabs.findIndex((t) => t.key === active);

	const animateIndicatorTo = (index: number) => {
		const layout = layoutsRef.current[index];
		if (!layout) return;
		Animated.parallel([
			Animated.timing(indicatorX, {
				toValue: layout.x,
				duration: TAB_INDICATOR_DURATION,
				useNativeDriver: false,
			}),
			Animated.timing(indicatorWidth, {
				toValue: layout.width,
				duration: TAB_INDICATOR_DURATION,
				useNativeDriver: false,
			}),
		]).start();
	};

	const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
		const { x, width } = e.nativeEvent.layout;
		layoutsRef.current[index] = { x, width };
		// Posiciona el indicador de una vez (sin animar) la primera vez
		// que se mide el layout del tab activo.
		if (index === activeIndex && !indicatorReady) {
			indicatorX.setValue(x);
			indicatorWidth.setValue(width);
			setIndicatorReady(true);
		}
	};

	const handlePress = (tab: ProfileTab, index: number) => {
		onChange(tab);
		animateIndicatorTo(index);
	};

	return (
		<View style={styles.tabBar}>
			{tabs.map((tab, index) => {
				const selected = active === tab.key;
				return (
					<Pressable
						key={tab.key}
						onPress={() => handlePress(tab.key, index)}
						onLayout={handleTabLayout(index)}
						style={styles.tab}
					>
						<AppText
							variant="bodyMedium"
							weight={selected ? "bold" : "regular"}
							style={{ color: selected ? colors.primary : colors.mutedForeground }}
						>
							{tab.label}
						</AppText>
					</Pressable>
				);
			})}
			{indicatorReady ? (
				<Animated.View
					style={[
						styles.tabIndicator,
						{
							backgroundColor: colors.primary,
							transform: [{ translateX: indicatorX }],
							width: indicatorWidth,
						},
					]}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	tabBar: { flexDirection: "row", position: "relative" },
	tab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.md,
	},
	tabIndicator: {
		position: "absolute",
		bottom: 0,
		left: 0,
		height: 2,
		borderRadius: 1,
	},
});
