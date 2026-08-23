import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, BottomSheetModal, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useCategories } from "@/features/hooks";

/**
 * "Filtrar" pill + category bottom sheet. A single active category is
 * kept (matching Rolé v1 `productsCategoryFilterProvider`).
 */
export function ProductFilters({
	activeCategoryId,
	onApply,
}: {
	activeCategoryId: string | null;
	onApply: (categoryId: string | null) => void;
}) {
	const { colors } = useTheme();
	const { data: categories } = useCategories();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<string | null>(activeCategoryId);

	const active = activeCategoryId != null;

	const openSheet = () => {
		setDraft(activeCategoryId);
		setOpen(true);
	};

	return (
		<>
			<Pressable
				onPress={openSheet}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.pill,
					{
						backgroundColor: active ? colors.secondary : colors.inputBackground,
						borderColor: active ? colors.secondary : colors.borderSolid,
						opacity: pressed ? 0.8 : 1,
					},
				]}
			>
				<Ionicons
					name="filter"
					size={14}
					color={active ? colors.secondaryForeground : colors.foreground}
				/>
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: active ? colors.secondaryForeground : colors.foreground }}
				>
					{strings.business.filter}
				</AppText>
			</Pressable>

			{open ? (
				<BottomSheetModal
					title={strings.business.category}
					onClose={() => setOpen(false)}
					footer={
						<Button
							label={
								draft != null
									? strings.business.applyFilters
									: strings.common.close
							}
							onPress={() => {
								onApply(draft);
								setOpen(false);
							}}
							fullWidth
							size="lg"
						/>
					}
				>
					<View style={styles.optionsWrap}>
						{(categories ?? []).map((category) => {
							const selected = draft === category.id;
							const label = category.emoji
								? `${category.emoji} ${category.name}`
								: category.name;
							return (
								<Pressable
									key={category.id}
									onPress={() =>
										setDraft((current) =>
											current === category.id ? null : category.id,
										)
									}
									style={({ pressed }) => [
										styles.chip,
										{
											backgroundColor: selected
												? colors.secondary
												: colors.inputBackground,
											borderColor: selected
												? colors.secondary
												: colors.borderSolid,
											opacity: pressed ? 0.85 : 1,
										},
									]}
								>
									<AppText
										variant="bodySmall"
										weight={selected ? "semiBold" : "medium"}
										style={{
											color: selected
												? colors.secondaryForeground
												: colors.foreground,
										}}
									>
										{label}
									</AppText>
								</Pressable>
							);
						})}
					</View>
				</BottomSheetModal>
			) : null}
		</>
	);
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	optionsWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	chip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
});