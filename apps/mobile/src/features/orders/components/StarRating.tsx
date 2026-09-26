import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui/AppText";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";

const MAX_RATING = 5;
const STARS = [1, 2, 3, 4, 5];

/**
 * Star rating used by the review form. The selected value is a single choice
 * out of five, so the group is exposed as a real radio group: a screen-reader
 * user hears "3 de 5 estrellas, marcada" instead of five anonymous buttons, and
 * the selection is never carried by colour alone.
 */
export function StarRating({
	label,
	value,
	onChange,
}: {
	/** Names the group, e.g. "Califica el producto". */
	label: string;
	value: number;
	onChange: (value: number) => void;
}) {
	const { colors } = useTheme();
	return (
		<View
			accessibilityRole="radiogroup"
			accessibilityLabel={label}
			style={styles.stars}
		>
			{STARS.map((n) => (
				<Pressable
					key={n}
					onPress={() => onChange(n)}
					accessibilityRole="radio"
					accessibilityLabel={strings.orders.ratingValue
						.replace("{n}", String(n))
						.replace("{total}", String(MAX_RATING))}
					accessibilityState={{ checked: n === value }}
				>
					<AppText
						variant="h1"
						style={{ color: n <= value ? colors.warning : colors.foreground }}
					>
						★
					</AppText>
				</Pressable>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	stars: { flexDirection: "row", gap: spacing.sm },
});
