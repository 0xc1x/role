import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Funnel } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal } from "@/src/core/ui";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useCategories } from "@/src/features/hooks";

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
			<Button
				variant={active ? "default" : "outline"}
				size="sm"
				onPress={openSheet}
				accessibilityRole="button"
				icon={
					<Funnel
						size={14}
						color={active ? colors.secondaryForeground : colors.foreground}
					/>
				}
			>
				{strings.business.filter}
			</Button>

			{open ? (
				<BottomSheetModal
					title={strings.business.category}
					onClose={() => setOpen(false)}
					footer={
						<Button
							onPress={() => {
								onApply(draft);
								setOpen(false);
							}}
							fullWidth
							size="lg"
						>
							{
								draft != null
									? strings.business.applyFilters
									: strings.common.close
							}
						</Button>
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
									cssInterop={false}
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