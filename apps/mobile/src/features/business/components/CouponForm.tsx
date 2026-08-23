import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import type { Coupon, CouponType } from "@0xc1x/role-commons";

import { strings } from "@/core/i18n/strings";
import { Switch } from "@/components/ui/switch";
import { AppText, Button, Card, TextField } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length = 8): string {
	let result = "";
	for (let i = 0; i < length; i++) {
		result += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!;
	}
	return result;
}

function formatLongDate(date: Date): string {
	const months = [
		"enero", "febrero", "marzo", "abril", "mayo", "junio",
		"julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
	];
	return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

export interface CouponFormValues {
	code: string;
	name: string;
	type: CouponType;
	value: number;
	min_order_amount: number | null;
	max_uses: number | null;
	expires_at: string | null;
	is_active: boolean;
}

export function CouponForm({
	initial,
	publishLabel,
	submitting,
	error,
	onSubmit,
}: {
	initial?: Coupon;
	publishLabel: string;
	submitting: boolean;
	error: string | null;
	onSubmit: (values: CouponFormValues) => void;
}) {
	const { colors } = useTheme();
	const [code, setCode] = useState(initial?.code ?? "");
	const [type, setType] = useState<CouponType>(initial?.type ?? "percentage");
	const [value, setValue] = useState(
		initial ? String(initial.value) : "",
	);
	const [minOrder, setMinOrder] = useState(
		initial?.min_order_amount != null && initial.min_order_amount > 0
			? String(initial.min_order_amount)
			: "",
	);
	const [maxUses, setMaxUses] = useState(
		initial?.max_uses != null ? String(initial.max_uses) : "",
	);
	const [expiry, setExpiry] = useState<Date | null>(
		initial?.expires_at ? new Date(initial.expires_at) : null,
	);
	const [isActive, setIsActive] = useState(initial?.is_active ?? true);
	const [showPicker, setShowPicker] = useState(false);
	const [showExpiryError, setShowExpiryError] = useState(false);

	const numericValue = Number(value);
	const codeValid = code.trim().length >= 3;
	const valueValid = value.trim() !== "" && numericValue > 0 && (type !== "percentage" || numericValue <= 100);
	const canSubmit =
		codeValid && valueValid && expiry != null && !submitting;

	const submit = () => {
		if (expiry == null) {
			setShowExpiryError(true);
			return;
		}
		onSubmit({
			code: code.trim().toUpperCase(),
			name: initial?.name ?? code.trim().toUpperCase(),
			type,
			value: numericValue,
			min_order_amount:
				minOrder.trim() !== "" && Number(minOrder) > 0 ? Number(minOrder) : null,
			max_uses:
				maxUses.trim() !== "" && Number(maxUses) > 0
					? Math.floor(Number(maxUses))
					: null,
			expires_at: expiry.toISOString(),
			is_active: isActive,
		});
	};

	return (
		<View style={styles.container}>
			<Card>
				<View style={styles.sectionTitle}>
					<Ionicons name="pricetag-outline" size={18} color={colors.primary} />
					<AppText variant="labelSmall" weight="bold">
						{strings.business.couponCodeLabel}
					</AppText>
				</View>
				<View style={styles.codeRow}>
					<TextField
						containerStyle={styles.codeField}
						value={code}
						onChangeText={(text) => setCode(text.replace(/\s/g, "").toUpperCase())}
						placeholder="EJ. PROMO2026"
						autoCapitalize="characters"
						maxLength={20}
						error={
							code.trim().length > 0 && !codeValid
								? strings.business.couponCodeMinLength
								: null
						}
					/>
					<Pressable
						onPress={() => setCode(randomCode())}
						style={({ pressed }) => [
							styles.generate,
							{
								borderColor: colors.primary + "80",
								backgroundColor: colors.primary + "0A",
							},
							pressed && { opacity: 0.8 },
						]}
					>
						<AppText
							variant="bodyMedium"
							weight="bold"
							style={{ color: colors.primary }}
						>
							{strings.business.couponGenerate}
						</AppText>
					</Pressable>
				</View>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{strings.business.couponCodeHint}
				</AppText>
			</Card>

			<Card>
				<AppText variant="labelSmall" weight="bold" style={{ marginBottom: spacing.md }}>
					{strings.business.couponTypeLabel}
				</AppText>
				<View style={styles.typeRow}>
					<TypeOption
						icon="pricetags-outline"
						label={strings.business.couponTypePercentage}
						selected={type === "percentage"}
						onPress={() => setType("percentage")}
					/>
					<TypeOption
						icon="cash-outline"
						label={strings.business.couponTypeFixed}
						selected={type === "fixed"}
						onPress={() => setType("fixed")}
					/>
				</View>
				<View style={styles.mt}>
					<TextField
						label={strings.business.couponValue}
						value={value}
						onChangeText={(text) => setValue(text.replace(/[^0-9.]/g, ""))}
						keyboardType="decimal-pad"
						placeholder={type === "percentage" ? "15" : "5.00"}
						error={
							value.trim().length > 0 && !valueValid
								? type === "percentage" && numericValue > 100
									? strings.business.couponMaxPercentage
									: strings.business.couponValueInvalid
								: null
						}
					/>
				</View>
			</Card>

			<Card>
				<AppText variant="labelSmall" weight="bold" style={{ marginBottom: spacing.md }}>
					{strings.business.couponConditions}
				</AppText>
				<TextField
					label={strings.business.couponMinPurchase}
					value={minOrder}
					onChangeText={(text) => setMinOrder(text.replace(/[^0-9.]/g, ""))}
					keyboardType="decimal-pad"
					placeholder="0.00"
				/>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground, marginTop: -8 }}>
					{strings.business.couponMinPurchaseHint}
				</AppText>
			</Card>

			<Card>
				<AppText variant="labelSmall" weight="bold" style={{ marginBottom: spacing.md }}>
					{strings.business.couponValidity}
				</AppText>
				<AppText variant="bodyMedium" weight="medium" style={{ marginBottom: spacing.sm }}>
					{strings.business.couponExpiry}
				</AppText>
				<Pressable
					onPress={() => setShowPicker(true)}
					style={[
						styles.dateField,
						{
							backgroundColor: colors.inputBackground,
							borderColor: showExpiryError && !expiry ? colors.destructive : colors.border,
						},
					]}
				>
					<Ionicons
						name="calendar-outline"
						size={16}
						color={showExpiryError && !expiry ? colors.destructive : colors.mutedForeground}
					/>
					<AppText
						variant="bodyMedium"
						weight={expiry ? "semiBold" : "regular"}
						style={{ color: expiry ? colors.foreground : colors.mutedForeground }}
					>
						{expiry ? formatLongDate(expiry) : strings.business.couponPickDate}
					</AppText>
				</Pressable>
				{showExpiryError && !expiry ? (
					<AppText variant="bodySmall" style={{ color: colors.destructive, marginTop: 4 }}>
						{strings.business.couponExpiryRequired}
					</AppText>
				) : null}
				{showPicker ? (
					<DateTimePicker
						value={expiry ?? new Date(Date.now() + 30 * 86400000)}
						mode="date"
						minimumDate={new Date()}
						maximumDate={new Date(Date.now() + 365 * 2 * 86400000)}
						display={Platform.OS === "ios" ? "inline" : "default"}
						onChange={(event, date) => {
							if (Platform.OS === "android") setShowPicker(false);
							if (date) {
								setExpiry(date);
								setShowExpiryError(false);
							}
						}}
					/>
				) : null}

				<View style={styles.mt}>
					<TextField
						label={strings.business.couponUseLimit}
						value={maxUses}
						onChangeText={(text) => setMaxUses(text.replace(/[^0-9]/g, ""))}
						keyboardType="number-pad"
						placeholder={strings.business.couponUnlimited}
					/>
				</View>
			</Card>

			<Card style={styles.statusCard}>
				<View style={styles.statusRow}>
					<View style={styles.statusText}>
						<AppText variant="labelSmall" weight="bold">
							{strings.business.couponAvailability}
						</AppText>
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
							{strings.business.couponAvailabilityHint}
						</AppText>
					</View>
					<Switch
						checked={isActive}
						onCheckedChange={() => setIsActive((v) => !v)}
					/>
				</View>
			</Card>

			{error ? (
				<AppText variant="bodySmall" style={{ color: colors.destructive }}>
					{error}
				</AppText>
			) : null}

			<Button
				label={publishLabel}
				fullWidth
				loading={submitting}
				disabled={!canSubmit}
				onPress={submit}
			/>
		</View>
	);
}

function TypeOption({
	icon,
	label,
	selected,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	selected: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.typeOption,
				{
					borderColor: selected ? colors.primary : colors.borderSolid,
					borderWidth: selected ? 1.5 : 1,
					backgroundColor: selected ? colors.primary + "0D" : colors.card,
				},
				pressed && { opacity: 0.85 },
			]}
		>
			<Ionicons
				name={icon}
				size={18}
				color={selected ? colors.primary : colors.mutedForeground}
			/>
			<AppText
				variant="bodyMedium"
				weight={selected ? "bold" : "medium"}
				style={{ color: selected ? colors.primary : colors.foreground }}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	container: { gap: spacing.md },
	sectionTitle: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginBottom: spacing.md,
	},
	codeRow: { flexDirection: "row", gap: spacing.sm },
	codeField: { flex: 1 },
	generate: {
		height: 48,
		alignSelf: "flex-start",
		paddingHorizontal: spacing.lg,
		borderRadius: radii.md,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 22,
	},
	typeRow: { flexDirection: "row", gap: spacing.sm },
	typeOption: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: spacing.md,
		borderRadius: radii.md,
	},
	mt: { marginTop: spacing.lg },
	dateField: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.lg,
		paddingVertical: 12,
		borderRadius: 18,
		borderWidth: 1,
	},
	statusCard: { paddingVertical: spacing.md },
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	statusText: { flex: 1, gap: 2 },
});