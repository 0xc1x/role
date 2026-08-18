import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { strings } from "@/core/i18n/strings";
import { AppText, Button } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

export interface MapPickerResult {
	latitude: number;
	longitude: number;
	address: string | null;
}

export function MapPickerView({
	initialLocation,
	onCancel,
	onConfirm,
}: {
	initialLocation: { latitude: number; longitude: number } | null;
	onCancel: () => void;
	onConfirm: (result: MapPickerResult) => void;
}) {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const [lat, setLat] = useState(
		initialLocation ? String(initialLocation.latitude) : "-0.22985",
	);
	const [lng, setLng] = useState(
		initialLocation ? String(initialLocation.longitude) : "-78.52495",
	);
	const [busy, setBusy] = useState(false);

	const useMyLocation = () => {
		if (
			typeof navigator === "undefined" ||
			typeof navigator.geolocation === "undefined"
		) {
			return;
		}
		setBusy(true);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				setLat(String(position.coords.latitude));
				setLng(String(position.coords.longitude));
				setBusy(false);
			},
			() => setBusy(false),
			{ enableHighAccuracy: true, timeout: 10000 },
		);
	};

	const confirm = () => {
		const latitude = Number.parseFloat(lat.replace(",", "."));
		const longitude = Number.parseFloat(lng.replace(",", "."));
		if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;
		onConfirm({ latitude, longitude, address: null });
	};

	return (
		<View style={[styles.full, { backgroundColor: colors.background }]}>
			<View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
				<Pressable
					onPress={onCancel}
					hitSlop={8}
					style={[styles.roundButton, { backgroundColor: colors.card }]}
				>
					<Ionicons name="chevron-back" size={20} color={colors.foreground} />
				</Pressable>
				<AppText variant="h4" weight="bold" numberOfLines={1} style={styles.headerTitle}>
					{strings.addresses.pickLocationTitle}
				</AppText>
				<View style={styles.headerSpacer} />
			</View>

			<View style={styles.body}>
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, textAlign: "center" }}
				>
					{strings.addresses.webMapFallback}
				</AppText>

				<TextInput
					value={lat}
					onChangeText={setLat}
					placeholder="Latitud"
					placeholderTextColor={colors.mutedForeground}
					keyboardType="decimal-pad"
					style={[
						styles.input,
						{
							backgroundColor: colors.inputBackground,
							color: colors.foreground,
						},
					]}
				/>
				<TextInput
					value={lng}
					onChangeText={setLng}
					placeholder="Longitud"
					placeholderTextColor={colors.mutedForeground}
					keyboardType="decimal-pad"
					style={[
						styles.input,
						{
							backgroundColor: colors.inputBackground,
							color: colors.foreground,
						},
					]}
				/>

				<Button
					label={strings.addresses.useMyLocation}
					onPress={useMyLocation}
					loading={busy}
					fullWidth
					variant="outline"
				/>
				<Button
					label={strings.addresses.confirmLocation}
					onPress={confirm}
					fullWidth
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	full: { flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
	},
	headerTitle: {
		flex: 1,
		textAlign: "center",
		paddingHorizontal: spacing.xs,
	},
	headerSpacer: { width: 36 },
	roundButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	body: {
		flex: 1,
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.xl,
		gap: spacing.md,
	},
	input: {
		borderRadius: 20,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		fontSize: 15,
	},
});
