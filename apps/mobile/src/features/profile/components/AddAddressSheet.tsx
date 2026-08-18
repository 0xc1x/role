import { useState } from "react";
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	TextInput,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toast } from "sonner-native";
import type { AddressType } from "@0xc1x/role-commons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useSaveAddress } from "@/features/profile/hooks";
import { MapPickerView, type MapPickerResult } from "./MapPickerView";

const TYPE_OPTIONS: { type: AddressType; label: string }[] = [
	{ type: "home", label: strings.addresses.labelHome },
	{ type: "work", label: strings.addresses.labelWork },
	{ type: "other", label: strings.addresses.labelOther },
];

const HOUSING_OPTIONS: { value: string; label: string }[] = [
	{ value: "apartment", label: strings.addresses.housingApartment },
	{ value: "house", label: strings.addresses.housingHouse },
	{ value: "office", label: strings.addresses.housingOffice },
	{ value: "building", label: strings.addresses.housingBuilding },
	{ value: "other", label: strings.addresses.housingOther },
];

const TYPE_DEFAULT_LABELS: Record<string, string> = {
	home: strings.addresses.labelHome,
	work: strings.addresses.labelWork,
};

export function AddAddressSheet({
	userId,
	onClose,
}: {
	userId: string;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const save = useSaveAddress(userId);

	const [selectedType, setSelectedType] = useState<AddressType>("home");
	const [label, setLabel] = useState("");
	const [address, setAddress] = useState("");
	const [references, setReferences] = useState("");
	const [housingType, setHousingType] = useState<string | null>(null);
	const [picked, setPicked] = useState<MapPickerResult | null>(null);
	const [saving, setSaving] = useState(false);
	const [showMap, setShowMap] = useState(false);

	if (showMap) {
		return (
			<View style={[styles.full, { backgroundColor: colors.background }]}>
				<MapPickerView
					initialLocation={picked}
					onCancel={() => setShowMap(false)}
					onConfirm={(result) => {
						setPicked(result);
						if (result.address) setAddress(result.address);
						setShowMap(false);
					}}
				/>
			</View>
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
		if (!label.trim() || !address.trim()) {
			toast.error(strings.addresses.fillRequired);
			return;
		}
		if (!picked) {
			toast.error(strings.addresses.selectMap);
			return;
		}
		setSaving(true);
		save.mutate(
			{
				label: label.trim(),
				address: address.trim(),
				latitude: picked.latitude,
				longitude: picked.longitude,
				type: selectedType,
				references: references.trim() ? references.trim() : null,
				housingType,
			},
			{
				onSuccess: () => {
					toast.success(strings.addresses.saved);
					onClose();
				},
				onError: (error) => {
					toast.error(
						error instanceof Error ? error.message : strings.common.error,
					);
				},
				onSettled: () => setSaving(false),
			},
		);
	};

	return (
		<View style={styles.backdrop}>
			<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={styles.keyboardView}
			>
				<View
					style={[
						styles.sheet,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
							paddingBottom: insets.bottom,
						},
					]}
				>
					<View
						style={[styles.grabber, { backgroundColor: colors.borderSolid }]}
					/>
					<View style={styles.header}>
						<AppText variant="h3" weight="bold">
							{strings.addresses.whereDeliver}
						</AppText>
						<Pressable
							onPress={onClose}
							hitSlop={8}
							style={[
								styles.closeButton,
								{ backgroundColor: colors.inputBackground },
							]}
						>
							<Ionicons name="close" size={16} color={colors.foreground} />
						</Pressable>
					</View>

					<ScrollView
						style={styles.scroll}
						contentContainerStyle={styles.scrollContent}
						keyboardShouldPersistTaps="handled"
						showsVerticalScrollIndicator={false}
					>
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
											isSelected && {
												backgroundColor: colors.card,
												shadowColor: colors.shadow,
												shadowOffset: { width: 0, height: 2 },
												shadowOpacity: 1,
												shadowRadius: 4,
												elevation: 1,
											},
										]}
									>
										<AppText
											variant="bodyMedium"
											weight={isSelected ? "bold" : "regular"}
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
						<TextInput
							value={label}
							onChangeText={setLabel}
							placeholder={strings.addresses.nameHint}
							placeholderTextColor={colors.mutedForeground}
							autoCapitalize="sentences"
							style={[
								styles.input,
								{
									backgroundColor: colors.inputBackground,
									color: colors.foreground,
								},
							]}
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
									name={picked ? "pin" : "map-outline"}
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
						<TextInput
							value={address}
							onChangeText={setAddress}
							placeholder={strings.addresses.addressHint}
							placeholderTextColor={colors.mutedForeground}
							autoCapitalize="sentences"
							style={[
								styles.input,
								{
									backgroundColor: colors.inputBackground,
									color: colors.foreground,
								},
							]}
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
													: colors.inputBackground,
											},
										]}
									>
										<AppText
											variant="bodySmall"
											weight="semiBold"
											style={{
												color: isSelected
													? colors.primaryForeground
													: colors.foreground,
											}}
										>
											{option.label}
										</AppText>
									</Pressable>
								);
							})}
						</View>

						<FieldLabel>{strings.addresses.references}</FieldLabel>
						<TextInput
							value={references}
							onChangeText={setReferences}
							placeholder={strings.addresses.referencesHint}
							placeholderTextColor={colors.mutedForeground}
							autoCapitalize="sentences"
							multiline
							style={[
								styles.input,
								styles.inputMultiline,
								{
									backgroundColor: colors.inputBackground,
									color: colors.foreground,
								},
							]}
						/>

						<Button
							label={strings.addresses.confirmAddress}
							onPress={handleSave}
							loading={saving}
							fullWidth
							size="lg"
							style={styles.confirmButton}
						/>
					</ScrollView>
				</View>
			</KeyboardAvoidingView>
		</View>
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

const styles = StyleSheet.create({
	full: { flex: 1 },
	backdrop: {
		flex: 1,
		justifyContent: "flex-end",
		backgroundColor: "rgba(0,0,0,0.5)",
	},
	keyboardView: { width: "100%", maxHeight: "92%" },
	sheet: {
		borderTopLeftRadius: radii.xl,
		borderTopRightRadius: radii.xl,
		borderWidth: 1,
		overflow: "hidden",
	},
	grabber: {
		alignSelf: "center",
		width: 48,
		height: 5,
		borderRadius: 2.5,
		marginTop: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
	},
	closeButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
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
	},
	segment: {
		flex: 1,
		paddingVertical: 10,
		borderRadius: 18,
		alignItems: "center",
	},
	input: {
		borderRadius: 20,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		fontSize: 15,
	},
	inputMultiline: { minHeight: 88, textAlignVertical: "top" },
	mapCard: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		padding: spacing.md,
		borderRadius: 20,
		borderWidth: 1.5,
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
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
	},
	confirmButton: { marginTop: spacing.sm },
});
