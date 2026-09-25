import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
	Briefcase,
	Building,
	Building2,
	ChevronRight,
	Ellipsis,
	House,
	List,
	Map,
	MapPin,
	Pencil,
	Square,
	SquareCheck,
	type LucideIcon,
} from "lucide-react-native";
import { toast } from "sonner-native";
import type { AddressType, SavedAddress } from "@0xc1x/role-commons";

import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal, TextField } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { useSaveAddress, useUpdateAddress } from "@/src/features/profile/hooks";
import { MapPickerView, type MapPickerResult } from "./MapPickerView";
import { Button } from "@/components/ui/button";

const TYPE_OPTIONS: { type: AddressType; label: string }[] = [
	{ type: "home", label: strings.addresses.labelHome },
	{ type: "work", label: strings.addresses.labelWork },
	{ type: "other", label: strings.addresses.labelOther },
];

const HOUSING_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
	{
		value: "apartment",
		label: strings.addresses.housingApartment,
		icon: Building2,
	},
	{ value: "house", label: strings.addresses.housingHouse, icon: House },
	{ value: "office", label: strings.addresses.housingOffice, icon: Briefcase },
	{
		value: "building",
		label: strings.addresses.housingBuilding,
		icon: Building,
	},
	{ value: "other", label: strings.addresses.housingOther, icon: Ellipsis },
];

const TYPE_DEFAULT_LABELS: Record<string, string> = {
	home: strings.addresses.labelHome,
	work: strings.addresses.labelWork,
};

export function AddAddressSheet({
	userId,
	address,
	onClose,
}: {
	userId: string;
	address?: SavedAddress;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const save = useSaveAddress(userId);
	const update = useUpdateAddress(userId);

	const [selectedType, setSelectedType] = useState<AddressType>(
		address?.type ?? "home",
	);
	const [label, setLabel] = useState(address?.label ?? "");
	const [addressText, setAddressText] = useState(address?.address ?? "");
	const [references, setReferences] = useState(address?.references ?? "");
	const [housingType, setHousingType] = useState<string | null>(
		address?.housing_type ?? null,
	);
	const [isDefault, setIsDefault] = useState(address?.is_default ?? false);
	const [picked, setPicked] = useState<MapPickerResult | null>(
		address
			? {
					latitude: address.latitude,
					longitude: address.longitude,
					address: address.address,
				}
			: null,
	);
	const [saving, setSaving] = useState(false);
	const [showMap, setShowMap] = useState(false);

	if (showMap) {
		return (
			<Modal visible transparent statusBarTranslucent animationType="fade">
				<View style={[styles.full, { backgroundColor: colors.background }]}>
					<MapPickerView
						initialLocation={picked}
						onCancel={() => setShowMap(false)}
						onConfirm={(result) => {
							setPicked(result);
							if (result.address) setAddressText(result.address);
							setShowMap(false);
						}}
					/>
				</View>
			</Modal>
		);
	}

	const handleTypeSelect = (type: AddressType) => {
		setSelectedType(type);
		if (
			!label.trim() ||
			label === strings.addresses.labelHome ||
			label === strings.addresses.labelWork
		) {
			setLabel(TYPE_DEFAULT_LABELS[type] ?? "");
		}
	};

	const handleSave = () => {
		if (!label.trim() || !addressText.trim()) {
			toast.error(strings.addresses.fillRequired);
			return;
		}
		if (!picked) {
			toast.error(strings.addresses.selectMap);
			return;
		}
		setSaving(true);
		const payload = {
			label: label.trim(),
			address: addressText.trim(),
			latitude: picked.latitude,
			longitude: picked.longitude,
			type: selectedType,
			references: references.trim() ? references.trim() : null,
			housingType,
		};
		const callbacks = {
			onSuccess: () => {
				toast.success(
					address ? strings.addresses.updated : strings.addresses.saved,
				);
				onClose();
			},
			onError: (error: unknown) => {
				toast.error(
					error instanceof Error ? error.message : strings.common.error,
				);
			},
			onSettled: () => setSaving(false),
		};
		if (address) {
			update.mutate(
				{ id: address.id, userId, ...payload, isDefault },
				callbacks,
			);
		} else {
			save.mutate(payload, callbacks);
		}
	};

	return (
		<BottomSheetModal
			onClose={onClose}
			title={
				address ? strings.addresses.editTitle : strings.addresses.whereDeliver
			}
		>
			<View style={styles.scrollContent}>
				<View
					style={[
						styles.segmented,
						{ backgroundColor: colors.inputBackground },
					]}
				>
					{TYPE_OPTIONS.map((option) => {
						const isSelected = selectedType === option.type;
						return (
							<Pressable
								key={option.type}
								onPress={() => handleTypeSelect(option.type)}
								style={[
									styles.segment,
									{ borderColor: colors.borderSolid },
									isSelected && {
										backgroundColor: colors.card,
										boxShadow: `0px 2px 4px ${colors.shadow}`,
										borderColor: colors.border,
									},
								]}
							>
								<AppText
									variant="bodyMedium"
									weight={isSelected ? "bold" : "medium"}
									style={{
										color: isSelected
											? colors.foreground
											: colors.mutedForeground,
									}}
								>
									{option.label}
								</AppText>
							</Pressable>
						);
					})}
				</View>

				<FieldLabel>{strings.addresses.nameAddress}</FieldLabel>
				<IconInput
					icon={Pencil}
					value={label}
					onChangeText={setLabel}
					placeholder={strings.addresses.nameHint}
				/>

				<Pressable
					onPress={() => setShowMap(true)}
					style={[
						styles.mapCard,
						{
							borderColor: picked ? colors.primary : colors.borderSolid,
							backgroundColor: picked
								? withAlpha(colors.primary, 0.059)
								: "transparent",
							borderWidth: picked ? 2 : 1.5,
						},
					]}
				>
					<View
						style={[
							styles.mapCardIcon,
							{
								backgroundColor: picked
									? colors.primary
									: colors.inputBackground,
							},
						]}
					>
						{picked ? (
							<MapPin size={20} color={colors.primaryForeground} />
						) : (
							<Map size={20} color={colors.foreground} />
						)}
					</View>
					<View style={styles.mapCardText}>
						<AppText weight="bold">
							{picked
								? strings.addresses.locationDetected
								: strings.addresses.locateOnMap}
						</AppText>
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{picked
								? strings.addresses.locationDetectedSub
								: strings.addresses.locateOnMapSub}
						</AppText>
					</View>
					<ChevronRight size={18} color={colors.mutedForeground} />
				</Pressable>

				<FieldLabel>{strings.addresses.exactAddress}</FieldLabel>
				<IconInput
					icon={MapPin}
					value={addressText}
					onChangeText={setAddressText}
					placeholder={strings.addresses.addressHint}
				/>

				<FieldLabel>{strings.addresses.housingType}</FieldLabel>
				<View style={styles.chipsRow}>
					{HOUSING_OPTIONS.map((option) => {
						const isSelected = housingType === option.value;
						const OptionIcon = option.icon;
						return (
							<Pressable
								key={option.value}
								onPress={() => setHousingType(isSelected ? null : option.value)}
								style={[
									styles.chip,
									{
										borderColor: colors.borderSolid,
										backgroundColor: isSelected
											? colors.foreground
											: withAlpha(colors.inputBackground, 0.502),
									},
								]}
							>
								<OptionIcon
									size={14}
									color={
										isSelected ? colors.background : colors.mutedForeground
									}
								/>
								<AppText
									variant="bodySmall"
									weight="semiBold"
									style={{
										color: isSelected ? colors.background : colors.foreground,
									}}
								>
									{option.label}
								</AppText>
							</Pressable>
						);
					})}
				</View>

				<FieldLabel>{strings.addresses.references}</FieldLabel>
				<IconInput
					icon={List}
					value={references}
					onChangeText={setReferences}
					placeholder={strings.addresses.referencesHint}
					multiline
				/>

				{address && !address.is_default ? (
					<Pressable
						onPress={() => setIsDefault((v) => !v)}
						style={styles.defaultRow}
					>
						{isDefault ? (
							<SquareCheck size={22} color={colors.primary} />
						) : (
							<Square size={22} color={colors.mutedForeground} />
						)}
						<AppText variant="bodyMedium" style={{ color: colors.foreground }}>
							{strings.addresses.setAsDefaultHint}
						</AppText>
					</Pressable>
				) : null}

				<Button
					onPress={handleSave}
					loading={saving}
					fullWidth
					size="lg"
					style={styles.confirmButton}
				>
					{strings.addresses.confirmAddress}
				</Button>
			</View>
		</BottomSheetModal>
	);
}

function FieldLabel({ children }: { children: string }) {
	const { colors } = useTheme();
	return (
		<AppText
			variant="labelSmall"
			weight="bold"
			style={[styles.fieldLabel, { color: colors.foreground }]}
		>
			{children}
		</AppText>
	);
}

function IconInput({
	icon: Icon,
	value,
	onChangeText,
	placeholder,
	multiline,
}: {
	icon: LucideIcon;
	value: string;
	onChangeText: (text: string) => void;
	placeholder: string;
	multiline?: boolean;
}) {
	return (
		<TextField
			value={value}
			onChangeText={onChangeText}
			placeholder={placeholder}
			icon={Icon}
			autoCapitalize="sentences"
			multiline={multiline}
		/>
	);
}

const styles = StyleSheet.create({
	full: { flex: 1 },
	scrollContent: {
		gap: spacing.md,
	},
	fieldLabel: { marginBottom: -spacing.xs },
	segmented: {
		flexDirection: "row",
		borderRadius: radii.lg,
		marginBottom: spacing.sm,
		backgroundColor: "transparent",
	},
	segment: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: radii.lg,
		alignItems: "center",
		borderWidth: 1,
		marginHorizontal: 2,
	},
	mapCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.md,
		borderRadius: radii.lg,
		marginTop: spacing.sm,
	},
	mapCardIcon: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	mapCardText: { flex: 1 },
	chipsRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	defaultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	confirmButton: { marginTop: spacing.sm },
});
