import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, TextField } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import {
	LocationMapPicker,
	type MapRegion,
} from "./LocationMapPicker";

export interface LocationFormValues {
	name: string;
	address: string;
	phone: string;
	latitude: number;
	longitude: number;
	zone: string | null;
}

export function LocationForm({
	initial,
	submitLabel,
	submitting,
	error,
	onSubmit,
}: {
	initial?: LocationFormValues;
	submitLabel: string;
	submitting: boolean;
	error: string | null;
	onSubmit: (values: LocationFormValues) => void;
}) {
	const { colors } = useTheme();
	const [name, setName] = useState(initial?.name ?? "");
	const [address, setAddress] = useState(initial?.address ?? "");
	const [phone, setPhone] = useState(initial?.phone ?? "");
	const [zone, setZone] = useState<string | null>(initial?.zone ?? null);
	const [lat, setLat] = useState(initial?.latitude ?? 0);
	const [lng, setLng] = useState(initial?.longitude ?? 0);
	const [touched, setTouched] = useState(Boolean(initial));

	const onMapRegion = (region: MapRegion) => {
		setLat(region.latitude);
		setLng(region.longitude);
		setTouched(true);
		if (region.address) setAddress(region.address);
		if (region.zone) setZone(region.zone);
	};

	const nameMissing = name.trim().length === 0;
	const addressMissing = address.trim().length === 0;
	const locationMissing = !touched;

	const canSubmit = !nameMissing && !addressMissing && !locationMissing;

	return (
		<View style={styles.container}>
			<AppText
				variant="bodyMedium"
				weight="semiBold"
				style={{ color: colors.foreground }}
			>
				{strings.business.basicDetails}
			</AppText>
			<TextField
				label={strings.business.locationName}
				value={name}
				onChangeText={setName}
				placeholder={strings.business.locationNameHint}
			/>

			<View style={styles.sectionHeader}>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={{ color: colors.foreground }}
				>
					{strings.business.geographicLocation}
				</AppText>
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: colors.primary }}
				>
					*
				</AppText>
			</View>
			<LocationMapPicker
				latitude={initial?.latitude ?? 0}
				longitude={initial?.longitude ?? 0}
				onRegionChange={onMapRegion}
			/>

			<View style={styles.sectionHeader}>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={{ color: colors.foreground }}
				>
					{strings.business.contactInfo}
				</AppText>
			</View>
			<TextField
				label={strings.business.fullAddress}
				value={address}
				onChangeText={setAddress}
				multiline
				placeholder={strings.business.addressFromMap}
			/>
			{zone ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: -8 }}
				>
					{strings.business.zoneDetected} {zone}
				</AppText>
			) : null}
			<TextField
				label={strings.business.optionalPhone}
				value={phone}
				onChangeText={setPhone}
				keyboardType="phone-pad"
				placeholder="+593 98 765 4321"
			/>

			{error ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.destructive, marginTop: spacing.sm }}
				>
					{error}
				</AppText>
			) : null}

			<Button
				label={submitLabel}
				fullWidth
				style={styles.submit}
				loading={submitting}
				disabled={!canSubmit}
				onPress={() =>
					onSubmit({
						name: name.trim(),
						address: address.trim(),
						phone: phone.trim() || "",
						latitude: lat,
						longitude: lng,
						zone,
					})
				}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		marginTop: spacing.xl,
		marginBottom: spacing.md,
	},
	submit: { marginTop: spacing.xl },
});