import { useState } from "react";
import {
	Image,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	Switch,
	View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, TextField } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import type { BusinessType } from "@0xc1x/role-commons";
import {
	MapPickerView,
	type MapPickerResult,
} from "@/features/profile/components/MapPickerView";
import { DateTimeField } from "./products/DateTimeFields";
import { pickWebImage } from "./products/ProductForm";

const DAYS = [
	"Lunes",
	"Martes",
	"Miércoles",
	"Jueves",
	"Viernes",
	"Sábado",
	"Domingo",
];

interface DayHoursState {
	day: string;
	open: Date;
	close: Date;
	closed: boolean;
}

export interface BusinessFormInitial {
	name?: string;
	type?: BusinessType | null;
	phone?: string | null;
	email?: string | null;
	description?: string | null;
	website?: string | null;
	logoUri?: string | null;
	coverUri?: string | null;
	address?: string | null;
	latitude?: number | null;
	longitude?: number | null;
	zone?: string | null;
	/** Horas por día en formato "HH:MM" o "HH:MM:SS". */
	hours?: Array<{ day: string; open: string; close: string; closed: boolean }>;
}

export interface BusinessFormInput {
	name: string;
	type: BusinessType;
	phone: string | null;
	email: string | null;
	description: string | null;
	website: string | null;
	logoUri: string | null;
	coverUri: string | null;
	hours: Array<{ day: string; hours: string }>;
	address: string | null;
	latitude: number | null;
	longitude: number | null;
	zone: string | null;
}

function timeToDate(time?: string | null): Date {
	const d = new Date();
	const match = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
	if (match) d.setHours(Number(match[1]), Number(match[2]), 0, 0);
	else d.setHours(9, 0, 0, 0);
	return d;
}

function dateToTime(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(
		d.getMinutes(),
	).padStart(2, "0")}`;
}

/**
 * Formulario compartido de negocio: creación (business-new) y edición
 * (business-profile/edit). Los campos son los que soportan
 * createBusiness/updateBusiness del repository.
 */
export function BusinessForm({
	initial,
	submitLabel,
	pending,
	serverError,
	onSubmit,
}: {
	initial?: BusinessFormInitial;
	submitLabel: string;
	pending: boolean;
	serverError?: string | null;
	onSubmit: (input: BusinessFormInput) => void;
}) {
	const { colors } = useTheme();

	const [logoUri, setLogoUri] = useState<string | null>(initial?.logoUri ?? null);
	const [coverUri, setCoverUri] = useState<string | null>(
		initial?.coverUri ?? null,
	);
	const [name, setName] = useState(initial?.name ?? "");
	const [type, setType] = useState<BusinessType | null>(initial?.type ?? null);
	const [phone, setPhone] = useState(initial?.phone ?? "");
	const [email, setEmail] = useState(initial?.email ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [website, setWebsite] = useState(initial?.website ?? "");
	const [picked, setPicked] = useState<MapPickerResult | null>(
		initial?.latitude != null && initial?.longitude != null
			? {
					latitude: initial.latitude,
					longitude: initial.longitude,
					address: initial.address ?? null,
				}
			: null,
	);
	const [showMap, setShowMap] = useState(false);
	const [zone, setZone] = useState(initial?.zone ?? "");
	const [hours, setHours] = useState<DayHoursState[]>(() =>
		DAYS.map((day) => {
			const saved = initial?.hours?.find((h) => h.day === day);
			return {
				day,
				open: timeToDate(saved?.open),
				close: timeToDate(saved?.close),
				closed: saved?.closed ?? false,
			};
		}),
	);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const pickImage = async (setter: (uri: string) => void) => {
		if (Platform.OS === "web") {
			const uri = await pickWebImage();
			if (uri) setter(uri);
			return;
		}
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ["images"],
			quality: 0.8,
		});
		if (!result.canceled && result.assets[0]) setter(result.assets[0].uri);
	};

	const setDay = (day: string, patch: Partial<DayHoursState>) =>
		setHours((prev) =>
			prev.map((h) => (h.day === day ? { ...h, ...patch } : h)),
		);

	const handleSubmit = () => {
		const nextErrors: Record<string, string> = {};
		if (!name.trim()) nextErrors.name = strings.business.requiredName;
		if (!type) nextErrors.type = strings.business.requiredType;
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0 || !type) return;

		onSubmit({
			name: name.trim(),
			type,
			phone: phone.trim() || null,
			email: email.trim() || null,
			description: description.trim() || null,
			website: website.trim() || null,
			logoUri,
			coverUri,
			hours: hours
				.filter((h) => !h.closed)
				.map((h) => ({
					day: h.day,
					hours: `${dateToTime(h.open)} - ${dateToTime(h.close)}`,
				})),
			address: picked?.address ?? null,
			latitude: picked?.latitude ?? null,
			longitude: picked?.longitude ?? null,
			zone: zone.trim() || null,
		});
	};

	return (
		<View style={styles.container}>
			{serverError ? (
				<AppText variant="bodySmall" style={{ color: colors.destructive }}>
					{serverError}
				</AppText>
			) : null}

			{/* ── Logo + cover ──────────────────────────────────────────── */}
			<View style={styles.imagesRow}>
				<Pressable
					onPress={() => void pickImage(setLogoUri)}
					style={({ pressed }) => [
						styles.logoArea,
						{
							backgroundColor: colors.inputBackground,
							borderColor: colors.borderSolid,
							opacity: pressed ? 0.85 : 1,
						},
					]}
				>
					{logoUri ? (
						<Image source={{ uri: logoUri }} style={styles.areaImage} />
					) : (
						<View style={styles.imagePlaceholder}>
							<Ionicons
								name="image-outline"
								size={22}
								color={colors.mutedForeground}
							/>
							<AppText
								variant="labelSmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.business.businessLogo}
							</AppText>
						</View>
					)}
				</Pressable>
				<Pressable
					onPress={() => void pickImage(setCoverUri)}
					style={({ pressed }) => [
						styles.coverArea,
						{
							backgroundColor: colors.inputBackground,
							borderColor: colors.borderSolid,
							opacity: pressed ? 0.85 : 1,
						},
					]}
				>
					{coverUri ? (
						<Image source={{ uri: coverUri }} style={styles.areaImage} />
					) : (
						<View style={styles.imagePlaceholder}>
							<Ionicons
								name="images-outline"
								size={22}
								color={colors.mutedForeground}
							/>
							<AppText
								variant="labelSmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.business.businessCover}
							</AppText>
						</View>
					)}
				</Pressable>
			</View>

			{/* ── Información básica ────────────────────────────────────── */}
			<TextField
				label={strings.business.businessName}
				value={name}
				onChangeText={setName}
				error={errors.name ?? null}
			/>

			<View style={styles.fieldBlock}>
				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={{ color: colors.mutedForeground }}
				>
					{strings.business.businessType}
				</AppText>
				<View style={styles.chipsWrap}>
					{(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((key) => {
						const selected = type === key;
						return (
							<Pressable
								key={key}
								onPress={() => setType(key)}
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
									{BUSINESS_TYPE_LABELS[key]}
								</AppText>
							</Pressable>
						);
					})}
				</View>
				{errors.type ? (
					<AppText variant="bodySmall" style={{ color: colors.destructive }}>
						{errors.type}
					</AppText>
				) : null}
			</View>

			<TextField
				label={strings.business.phone}
				value={phone}
				onChangeText={setPhone}
				keyboardType="phone-pad"
			/>
			<TextField
				label={strings.business.email}
				value={email}
				onChangeText={setEmail}
				keyboardType="email-address"
				autoCapitalize="none"
			/>
			<TextField
				label={strings.offers.description}
				value={description}
				onChangeText={setDescription}
				multiline
			/>
			<TextField
				label={strings.businessProfile.website}
				value={website}
				onChangeText={setWebsite}
				keyboardType="url"
				autoCapitalize="none"
			/>

			{/* ── Ubicación (local HQ) ──────────────────────────────────── */}
			<View style={styles.fieldBlock}>
				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={{ color: colors.mutedForeground }}
				>
					{strings.businessProfile.address}
				</AppText>
				<Pressable
					onPress={() => setShowMap(true)}
					style={({ pressed }) => [
						styles.selectRow,
						{
							backgroundColor: colors.inputBackground,
							borderColor: colors.borderSolid,
							opacity: pressed ? 0.85 : 1,
						},
					]}
				>
					<Ionicons
						name="location-outline"
						size={16}
						color={picked ? colors.success : colors.mutedForeground}
					/>
					<AppText
						variant="bodyMedium"
						numberOfLines={1}
						style={{ flex: 1, color: colors.foreground }}
					>
						{picked?.address ?? strings.business.pickLocation}
					</AppText>
					{picked ? (
						<Ionicons
							name="checkmark-circle"
							size={18}
							color={colors.success}
						/>
					) : (
						<Ionicons
							name="chevron-forward"
							size={16}
							color={colors.mutedForeground}
						/>
					)}
				</Pressable>
				<TextField
					label={strings.business.businessZone}
					value={zone}
					onChangeText={setZone}
				/>
			</View>

			{/* ── Horarios ──────────────────────────────────────────────── */}
			<View style={styles.fieldBlock}>
				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={{ color: colors.mutedForeground }}
				>
					{strings.business.businessHours}
				</AppText>
				{hours.map((h) => (
					<View key={h.day} style={styles.hoursRow}>
						<AppText variant="bodySmall" style={{ width: 90 }}>
							{h.day}
						</AppText>
						{h.closed ? (
							<AppText
								variant="bodySmall"
								style={{ flex: 1, color: colors.mutedForeground }}
							>
								{strings.businessProfile.closed}
							</AppText>
						) : (
							<View style={styles.timeRow}>
								<DateTimeField
									mode="time"
									label=""
									value={h.open}
									onChange={(d) => setDay(h.day, { open: d })}
								/>
								<DateTimeField
									mode="time"
									label=""
									value={h.close}
									onChange={(d) => setDay(h.day, { close: d })}
								/>
							</View>
						)}
						<Switch
							value={!h.closed}
							onValueChange={(open) => setDay(h.day, { closed: !open })}
							trackColor={{ false: colors.muted, true: colors.secondary }}
						/>
					</View>
				))}
			</View>

			<Button
				label={submitLabel}
				onPress={handleSubmit}
				loading={pending}
				fullWidth
				size="lg"
				style={{ marginTop: spacing.md }}
			/>

			{showMap ? (
				<Modal visible transparent statusBarTranslucent animationType="fade">
					<View style={[styles.full, { backgroundColor: colors.background }]}>
						<MapPickerView
							initialLocation={picked}
							onCancel={() => setShowMap(false)}
							onConfirm={(result) => {
								setPicked(result);
								setShowMap(false);
							}}
						/>
					</View>
				</Modal>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { gap: spacing.md },
	imagesRow: {
		flexDirection: "row",
		gap: spacing.md,
	},
	logoArea: {
		width: 110,
		height: 110,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderStyle: "dashed",
		overflow: "hidden",
	},
	coverArea: {
		flex: 1,
		height: 110,
		borderRadius: radii.lg,
		borderWidth: 1,
		borderStyle: "dashed",
		overflow: "hidden",
	},
	areaImage: { width: "100%", height: "100%" },
	imagePlaceholder: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
	},
	fieldBlock: { gap: 6 },
	chipsWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		marginTop: 4,
	},
	chip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	selectRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 46,
	},
	hoursRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: 4,
	},
	timeRow: {
		flex: 1,
		flexDirection: "row",
		gap: spacing.sm,
	},
	full: { flex: 1 },
});
