import { createElement, useRef, useState, type ChangeEvent } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

type Mode = "date" | "time";

/**
 * Date/time field for the pickup window. On native it uses
 * @react-native-community/datetimepicker; on web it delegates to the
 * browser's native `<input type="date|time">` picker via showPicker().
 */
export function DateTimeField({
	mode,
	label,
	value,
	onChange,
}: {
	mode: Mode;
	label: string;
	value: Date;
	onChange: (date: Date) => void;
}) {
	const { colors } = useTheme();
	const [show, setShow] = useState(false);
	const webInputRef = useRef<HTMLInputElement>(null);

	if (Platform.OS === "web") {
		const isDate = mode === "date";
		const current = isDate
			? toDateInput(value)
			: `${pad(value.getHours())}:${pad(value.getMinutes())}`;
		return (
			<View style={[styles.field, { gap: 6 }]}>
				<AppText variant="labelSmall" weight="semiBold" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<Pressable
					onPress={() => {
						const input = webInputRef.current;
						if (!input) return;
						// showPicker() abre el picker nativo del navegador; fallback a click().
						if (typeof input.showPicker === "function") input.showPicker();
						else input.click();
					}}
					accessibilityRole="button"
					style={({ pressed }) => [
						styles.inputRow,
						{
							backgroundColor: colors.inputBackground,
							borderColor: colors.border,
							opacity: pressed ? 0.8 : 1,
						},
					]}
				>
					<Ionicons
						name={isDate ? "calendar-outline" : "time-outline"}
						size={16}
						color={colors.mutedForeground}
					/>
					<AppText variant="bodyMedium">{current}</AppText>
				</Pressable>
				{createElement("input", {
					ref: webInputRef,
					type: mode,
					value: current,
					onChange: (e: ChangeEvent<HTMLInputElement>) => {
						const raw = e.target.value;
						const next = isDate ? parseDateInput(raw) : parseTimeInput(raw);
						if (next) onChange(next);
					},
					style: {
						position: "absolute",
						width: 1,
						height: 1,
						opacity: 0,
						pointerEvents: "none",
						border: "none",
						padding: 0,
					},
				})}
			</View>
		);
	}

	const displayLabel = formatField(value, mode);

	return (
		<View style={styles.field}>
			<AppText variant="labelSmall" weight="semiBold" style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
			<Pressable
				onPress={() => setShow(true)}
				accessibilityRole="button"
				style={({ pressed }) => [
					styles.inputRow,
					{
						backgroundColor: colors.inputBackground,
						borderColor: colors.border,
						opacity: pressed ? 0.8 : 1,
					},
				]}
			>
				<Ionicons
					name={mode === "date" ? "calendar-outline" : "time-outline"}
					size={16}
					color={colors.mutedForeground}
				/>
				<AppText variant="bodyMedium">{displayLabel}</AppText>
			</Pressable>
			{show || Platform.OS === "ios" ? (
				<DateTimePicker
					value={value}
					mode={mode}
					display={
						Platform.OS === "ios"
							? mode === "date"
								? "inline"
								: "compact"
							: "default"
					}
					onChange={(event, selected) => {
						if (Platform.OS !== "ios") setShow(false);
						if (event.type === "set" && selected) onChange(selected);
					}}
				/>
			) : null}
		</View>
	);
}

function formatField(date: Date, mode: Mode): string {
	if (mode === "time") {
		return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}
	return new Intl.DateTimeFormat("es-MX", {
		weekday: "short",
		day: "numeric",
		month: "short",
	}).format(date);
}

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function toDateInput(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateInput(text: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeInput(text: string): Date | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
	if (!match) return null;
	const date = new Date();
	date.setHours(Number(match[1]), Number(match[2]), 0, 0);
	return date;
}

const styles = StyleSheet.create({
	field: {
		flex: 1,
		gap: 6,
	},
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: 18,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		minHeight: 46,
	},
});