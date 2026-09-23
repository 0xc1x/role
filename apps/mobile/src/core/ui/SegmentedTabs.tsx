import { StyleSheet } from "react-native";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/src/core/theme";
import { withAlpha } from "@/src/core/theme/alpha";
import { radii, spacing } from "@/src/core/theme/spacing";
import { AppText } from "./AppText";

export function SegmentedTabs<T extends string>({
	value,
	items,
	onValueChange,
}: {
	value: T;
	items: ReadonlyArray<{ key: T; label: string }>;
	onValueChange: (value: T) => void;
}) {
	const { colors } = useTheme();

	// Flatten RN style arrays to plain objects: on web the Radix asChild
	// primitives merge style via object spread, which corrupts arrays
	// into {"0": ..., "1": ...} and crashes the DOM render.
	return (
		<Tabs
			value={value}
			onValueChange={(next) => {
				const item = items.find((item) => item.key === next);
				if (item) onValueChange(item.key);
			}}
			style={StyleSheet.flatten(styles.root)}
		>
			<TabsList
				style={StyleSheet.flatten([
					styles.list,
					{ backgroundColor: colors.muted },
				])}
			>
				{items.map((item) => {
					const selected = value === item.key;
					return (
						<TabsTrigger
							key={item.key}
							value={item.key}
							// These tabs filter an existing list rather than own tab panels.
							aria-controls={undefined}
							style={StyleSheet.flatten([
								styles.trigger,
								{
									backgroundColor: selected
										? withAlpha(colors.primary, 0.14)
										: "transparent",
								},
							])}
						>
							<AppText
								variant="bodySmall"
								weight={selected ? "bold" : "semiBold"}
								style={{
									color: selected ? colors.primary : colors.mutedForeground,
								}}
							>
								{item.label}
							</AppText>
						</TabsTrigger>
					);
				})}
			</TabsList>
		</Tabs>
	);
}

const styles = StyleSheet.create({
	root: { width: "100%" },
	list: {
		width: "100%",
		height: "auto",
		marginRight: 0,
		flexDirection: "row",
		borderRadius: radii.md,
		padding: spacing.xs,
		gap: spacing.xs,
	},
	trigger: {
		flex: 1,
		height: "auto",
		alignItems: "center",
		paddingTop: 9,
		paddingBottom: 9,
		paddingLeft: 0,
		paddingRight: 0,
		borderRadius: radii.sm,
		borderWidth: 0,
		boxShadow: "none",
	},
});
