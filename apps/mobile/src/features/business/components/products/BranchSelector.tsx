import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Check, Store } from "lucide-react-native";
import type { BusinessLocation } from "@0xc1x/role-commons";

import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";

/**
 * Sucursal selector pill + bottom sheet. `null` = todas las sucursales
 * (ported from Rolé v1 `BusinessBranchSelector`).
 */
export function BranchSelector({
	locations,
	selectedId,
	onSelect,
}: {
	locations: BusinessLocation[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
}) {
	const { colors } = useTheme();
	const [open, setOpen] = useState(false);

	const selected = locations.find((l) => l.id === selectedId);
	const label = selected?.name ?? strings.business.allBranches;

	return (
		<>
			<Pressable
				cssInterop={false}
				onPress={() => setOpen(true)}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.pill,
					{
						backgroundColor: colors.inputBackground,
						borderColor: colors.borderSolid,
						opacity: pressed ? 0.85 : 1,
					},
				]}
			>
				<Store size={15} color={colors.foreground} />
				<AppText
					variant="bodySmall"
					weight="medium"
					numberOfLines={1}
					style={{ color: colors.foreground }}
				>
					{label}
				</AppText>
			</Pressable>

			{open ? (
				<BottomSheetModal
					title={strings.business.locations}
					onClose={() => setOpen(false)}
				>
					<OptionRow
						label={strings.business.allBranches}
						selected={selectedId === null}
						onPress={() => {
							onSelect(null);
							setOpen(false);
						}}
					/>
					{locations.map((location) => (
						<OptionRow
							key={location.id}
							label={location.name}
							subtitle={location.address}
							selected={selectedId === location.id}
							onPress={() => {
								onSelect(location.id);
								setOpen(false);
							}}
						/>
					))}
				</BottomSheetModal>
			) : null}
		</>
	);
}

function OptionRow({
	label,
	subtitle,
	selected,
	onPress,
}: {
	label: string;
	subtitle?: string;
	selected: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			cssInterop={false}
			onPress={onPress}
			style={({ pressed }) => [
				styles.option,
				{
					backgroundColor: selected ? colors.secondary : colors.inputBackground,
					borderColor: selected ? colors.secondary : colors.borderSolid,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			<View style={{ flex: 1 }}>
				<AppText
					variant="bodyMedium"
					weight={selected ? "semiBold" : "regular"}
					numberOfLines={1}
					style={{ color: selected ? colors.secondaryForeground : colors.foreground }}
				>
					{label}
				</AppText>
				{subtitle ? (
					<AppText
						variant="bodySmall"
						numberOfLines={1}
						style={{
							color: selected ? colors.secondaryForeground : colors.mutedForeground,
						}}
					>
						{subtitle}
					</AppText>
				) : null}
			</View>
			{selected ? (
				<Check
					size={18}
					color={colors.secondaryForeground}
				/>
			) : null}
		</Pressable>
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
	option: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
	},
});