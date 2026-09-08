import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import type { BusinessProfileDetail } from "@/features/business/domain/business";
import { openMaps, openUrl } from "./maps";

export function ContactInfoCard({ profile }: { profile: BusinessProfileDetail }) {
	const { colors } = useTheme();
	const business = profile.business;
	return (
		<View style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<AppText variant="labelMedium" weight="bold">
				{strings.businessProfile.contactInfo}
			</AppText>
			<View style={{ height: spacing.lg }} />

			<InfoRow
				icon="location-outline"
				label={strings.businessProfile.address}
				text={profile.address ?? strings.businessProfile.notAvailable}
				trailing={
					profile.latitude != null && profile.longitude != null ? (
						<Pressable
							onPress={() => {
								const lat = profile.latitude;
								const lng = profile.longitude;
								if (lat != null && lng != null) void openMaps(lat, lng);
							}}
						>
							<AppText weight="bold" style={{ color: colors.primary }}>
								{strings.businessProfile.directions}
							</AppText>
						</Pressable>
					) : null
				}
			/>

			{business.phone?.length ? (
				<>
					<View style={{ height: spacing.md }} />
					<InfoRow
						icon="call-outline"
						label={strings.businessProfile.phone}
						text={business.phone}
						onPress={() => void openUrl(`tel:${business.phone}`)}
						isLink
					/>
				</>
			) : null}

			{business.email?.length ? (
				<>
					<View style={{ height: spacing.md }} />
					<InfoRow
						icon="mail-outline"
						label={strings.businessProfile.email}
						text={business.email}
						onPress={() => void openUrl(`mailto:${business.email}`)}
						isLink
					/>
				</>
			) : null}

			{business.website?.length ? (
				<>
					<View style={{ height: spacing.md }} />
					<InfoRow
						icon="globe-outline"
						label={strings.businessProfile.website}
						text={business.website}
						onPress={() => {
							const site = business.website;
							if (!site) return;
							const url = site.startsWith("http") ? site : `https://${site}`;
							void openUrl(url);
						}}
						isLink
					/>
				</>
			) : null}
		</View>
	);
}

export function InfoRow({
	icon,
	label,
	text,
	onPress,
	isLink,
	trailing,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	text: string;
	onPress?: () => void;
	isLink?: boolean;
	trailing?: React.ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.infoRow}>
			<Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 2 }} />
			<View style={{ width: spacing.sm }} />
			<View style={{ flex: 1 }}>
				<AppText style={{ color: colors.mutedForeground, fontSize: 12 }}>
					{label}
				</AppText>
				<Pressable onPress={onPress} disabled={!isLink}>
					<AppText
						weight={isLink ? "bold" : undefined}
						style={{ color: isLink ? colors.primary : colors.foreground, marginTop: 2 }}
					>
						{text}
					</AppText>
					{trailing ? <View style={{ marginTop: 4 }}>{trailing}</View> : null}
				</Pressable>
			</View>
		</View>
	);
}

export function HoursCard({ hours }: { hours: BusinessProfileDetail["hours"] }) {
	const { colors } = useTheme();
	return (
		<View style={[styles.card, { boxShadow: `0px 4px 12px ${colors.shadow}` }]}>
			<View style={styles.hoursTitleRow}>
				<Ionicons name="time-outline" size={20} color={colors.primary} />
				<View style={{ width: spacing.sm }} />
				<AppText weight="semiBold">{strings.businessProfile.businessHours}</AppText>
			</View>
			<View style={{ height: spacing.md }} />
			{hours.map((h) => {
				const closed = h.hoursDisplay === strings.businessProfile.closed;
				return (
					<View key={h.dayRange} style={[styles.hoursRow, { borderBottomColor: colors.border }]}>
						<AppText weight="medium">{h.dayRange}</AppText>
						<AppText
							style={{ color: closed ? colors.destructive : colors.mutedForeground }}
						>
							{h.hoursDisplay}
						</AppText>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		width: "100%",
		padding: spacing.sm,
		borderRadius: radii.xl,
		backgroundColor: "transparent",
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
	},
	hoursTitleRow: {
		flexDirection: "row",
		alignItems: "center",
	},
	hoursRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.sm,
		borderBottomWidth: StyleSheet.hairlineWidth,
	},
});
