import { useState } from "react";
import {
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toast } from "sonner-native";
import type { AddressType, SavedAddress } from "@0xc1x/role-commons";

import { strings } from "@/core/i18n/strings";
import { AppText, BottomSheetModal, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useSaveAddress, useUpdateAddress } from "@/features/profile/hooks";
import { MapPickerView, type MapPickerResult } from "./MapPickerView";

const TYPE_OPTIONS: { type: AddressType; label: string }[] = [
	{ type: "home", label: strings.addresses.labelHome },
	{ type: "work", label: strings.addresses.labelWork },
	{ type: "other", label: strings.addresses.labelOther },
];

const HOUSING_OPTIONS: { value: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
	{ value: "apartment", label: strings.addresses.housingApartment, icon: "business" },
	{ value: "house", label: strings.addresses.housingHouse, icon: "home" },
	{ value: "office", label: strings.addresses.housingOffice, icon: "briefcase-outline" },
	{ value: "building", label: strings.addresses.housingBuilding, icon: "business-outline" },
	{ value: "other", label: strings.addresses.housingOther, icon: "ellipsis-horizontal" },
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
			? { latitude: address.latitude, longitude: address.longitude, address: address.address }
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
			update.mutate({ id: address.id, userId, ...payload, isDefault }, callbacks);
		} else {
			save.mutate(payload, callbacks);
		}
	};

	return (
		<BottomSheetModal
			onClose={onClose}
			title={address ? strings.addresses.editTitle : strings.addresses.whereDeliver}
		>
			<ScrollView
				style={styles.scroll}
				contentContainerStyle={styles.scrollContent}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View
					style={[styles.segmented, { backgroundColor: colors.inputBackground }]}
				>
					{TYPE_OPTIONS.map((option) => {
						const isSelected = selectedType === option.type;
						return (
							<Pressable
								key={option.type}
								onPress={() => handleTypeSelect(option.type)}
								style={[
									styles.segment,
									isSelected && {
										backgroundColor: colors.card,
										shadowColor: colors.shadow,
										shadowOffset: { width: 0, height: 2 },
										shadowOpacity: 0.05,
										shadowRadius: 4,
										elevation: 1,
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
					icon="create-outline"
					value={label}
					onChangeText={setLabel}
					placeholder={strings.addresses.nameHint}
				 colors={colors}
				/>

				<Pressable
					onPress={() => setShowMap(true)}
					style={[
						styles.mapCard,
						{
							borderColor: picked ? colors.primary : colors.borderSolid,
							backgroundColor: picked
								? colors.primary + "0F"
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
						<Ionicons
							name={picked ? "location" : "map-outline"}
							size={20}
							color={
								picked ? colors.primaryForeground : colors.foreground
							}
						/>
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
					<Ionicons
						name="chevron-forward"
						size={18}
						color={colors.mutedForeground}
					/>
				</Pressable>

				<FieldLabel>{strings.addresses.exactAddress}</FieldLabel>
				<IconInput
					icon="location-outline"
					value={addressText}
					onChangeText={setAddressText}
					placeholder={strings.addresses.addressHint}
					colors={colors}
				/>

				<FieldLabel>{strings.addresses.housingType}</FieldLabel>
				<View style={styles.chipsRow}>
					{HOUSING_OPTIONS.map((option) => {
						const isSelected = housingType === option.value;
						return (
							<Pressable
								key={option.value}
								onPress={() =>
									setHousingType(isSelected ? null : option.value)
								}
								style={[
									styles.chip,
									{
										backgroundColor: isSelected
											? colors.foreground
											: colors.inputBackground + "80",
									},
								]}
							>
								<Ionicons
									name={option.icon}
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
					icon="list-outline"
					value={references}
					onChangeText={setReferences}
					placeholder={strings.addresses.referencesHint}
					colors={colors}
					multiline
				/>

				{address && !address.is_default ? (
					<Pressable
						onPress={() => setIsDefault((v) => !v)}
						style={styles.defaultRow}
					>
						<Ionicons
							name={isDefault ? "checkbox" : "square-outline"}
							size={22}
							color={isDefault ? colors.primary : colors.mutedForeground}
						/>
						<AppText variant="bodyMedium" style={{ color: colors.foreground }}>
							{strings.addresses.setAsDefaultHint}
						</AppText>
					</Pressable>
				) : null}

				<Button
					label={strings.addresses.confirmAddress}
					onPress={handleSave}
					loading={saving}
					fullWidth
					size="lg"
					style={styles.confirmButton}
				/>
			</ScrollView>
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
	icon,
	value,
	onChangeText,
	placeholder,
	colors,
	multiline,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	value: string;
	onChangeText: (text: string) => void;
	placeholder: string;
	colors: ReturnType<typeof useTheme>["colors"];
	multiline?: boolean;
}) {
	return (
		<View
			style={[
				styles.inputRow,
				{ backgroundColor: colors.inputBackground + "80" },
			]}
		>
			<Ionicons
				name={icon}
				size={20}
				color={colors.mutedForeground}
				style={styles.inputIcon}
			/>
			<TextInput
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={colors.mutedForeground}
				autoCapitalize="sentences"
				multiline={multiline}
				style={[
					styles.input,
					multiline && styles.inputMultiline,
					{ color: colors.foreground },
				]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	full: { flex: 1 },
	scroll: { flexShrink: 1 },
	scrollContent: {
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xxl,
		gap: spacing.md,
	},
	fieldLabel: { marginBottom: -spacing.xs },
	segmented: {
		flexDirection: "row",
		padding: 6,
		borderRadius: 24,
		marginBottom: spacing.sm,
		backgroundColor: "transparent",
	},
	segment: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 18,
		alignItems: "center",
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 20,
		paddingHorizontal: spacing.md,
	},
	inputIcon: { marginRight: spacing.sm },
	input: {
		flex: 1,
		paddingVertical: spacing.md,
		fontSize: 15,
	},
	inputMultiline: {
		minHeight: 64,
		textAlignVertical: "top",
	},
	mapCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.md,
		borderRadius: 20,
		marginTop: spacing.sm,
	},
	mapCardIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
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
	},
	defaultRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	confirmButton: { marginTop: spacing.sm },
});
