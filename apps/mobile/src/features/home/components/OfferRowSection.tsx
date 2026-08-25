import { View, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/core/theme";
import { AppText, Card, SectionHeader } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { strings } from "@/core/i18n/strings";
import {
	usePopularOffers,
	useExpiringSoonOffers,
	useRecentOffers,
	useNearbyOffersHook,
	useSelectedAddress,
} from "@/features/hooks";
import { OfferCard } from "@/features/offers/components/OfferCard";
import type { OfferDetail } from "@/features/offers/domain/offer";

type SectionType = "popular" | "expiring" | "recent" | "nearby";

interface OfferRowSectionProps {
	type: SectionType;
	title: string;
	icon?: React.ReactNode;
	limit?: number;
	category?: string | null;
	onSeeAll?: () => void;
}

function OfferSkeleton({ fullWidth = false }: { fullWidth?: boolean }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.offerCardSkeleton,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				fullWidth && styles.offerFull,
			]}
		>
			<View style={[styles.offerImage, { backgroundColor: colors.muted }]} />
			<View style={styles.offerBody}>
				<View
					style={{
						height: 14,
						width: "70%",
						backgroundColor: colors.muted,
						borderRadius: 4,
						marginBottom: 8,
					}}
				/>
				<View
					style={{
						height: 10,
						width: "55%",
						backgroundColor: colors.muted,
						borderRadius: 4,
						marginBottom: 8,
					}}
				/>
				<View
					style={{
						height: 10,
						width: "60%",
						backgroundColor: colors.muted,
						borderRadius: 4,
					}}
				/>
			</View>
		</View>
	);
}

function OfferRowView({
	title,
	icon,
	onSeeAll,
	offers,
	isLoading,
	isError,
}: {
	title: string;
	icon?: React.ReactNode;
	onSeeAll?: () => void;
	offers?: OfferDetail[];
	isLoading: boolean;
	isError: boolean;
}) {
	const { colors } = useTheme();

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader title={title} icon={icon} onSeeAll={onSeeAll} />
			{isLoading ? (
				<FlatList
					data={Array.from({ length: 3 })}
					keyExtractor={(_, i) => `skeleton-${i}`}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={() => <OfferSkeleton />}
				/>
			) : isError ? (
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, paddingHorizontal: spacing.xl }}
				>
					{strings.home.noOffers}
				</AppText>
			) : (
				<FlatList
					data={offers}
					keyExtractor={(item) => item.offer.id}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={({ item }) => (
						<View style={{ width: 260, height: ROW_CARD_HEIGHT }}>
							<OfferCard offer={item} />
						</View>
					)}
				/>
			)}
		</View>
	);
}

export function OfferRowSection({
	type,
	title,
	icon,
	limit = 10,
	category = null,
	onSeeAll,
}: OfferRowSectionProps) {
	switch (type) {
		case "popular": {
			const q = usePopularOffers(limit, category);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
		case "expiring": {
			const q = useExpiringSoonOffers(limit);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
		case "recent": {
			const q = useRecentOffers(limit);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
		case "nearby": {
			const q = useNearbyOffersHook(limit, category);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
	}
}

export function OfferColumnSection({
	title,
	limit = 10,
	category = null,
	onSeeAll,
}: {
	title: string;
	limit?: number;
	category?: string | null;
	onSeeAll?: () => void;
}) {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();
	const { data: offers, isLoading, isError } = useNearbyOffersHook(limit, category);

	const hasLocation =
		selectedAddress?.latitude != null && selectedAddress?.longitude != null;

	if (!hasLocation) {
		return (
			<View style={styles.locationPromptWrap}>
				<Card style={styles.locationPromptCard}>
					<View style={styles.locationPromptRow}>
						<View
							style={[
								styles.locationPromptIcon,
								{ backgroundColor: colors.primary + "14" },
							]}
						>
							<Ionicons
								name="location-outline"
								size={20}
								color={colors.primary}
							/>
						</View>
						<View style={styles.locationPromptText}>
							<AppText variant="bodyMedium" weight="semiBold">
								{strings.home.activateLocation}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.home.activateLocationBody}
							</AppText>
						</View>
					</View>
				</Card>
			</View>
		);
	}

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader title={title} onSeeAll={onSeeAll} />
			{isLoading ? (
				<View style={styles.columnContent}>
					{Array.from({ length: 3 }).map((_, i) => (
						<View key={`skeleton-${i}`} style={styles.columnItem}>
							<OfferSkeleton fullWidth />
						</View>
					))}
				</View>
			) : isError ? (
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, paddingHorizontal: spacing.xl }}
				>
					{strings.home.noOffers}
				</AppText>
			) : (
				<View style={styles.columnContent}>
					{offers?.map((item) => (
						<View key={item.offer.id} style={styles.columnItem}>
							<OfferCard offer={item} />
						</View>
					))}
				</View>
			)}
		</View>
	);
}

const ROW_CARD_HEIGHT = 270;

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.lg,
	},
	rowContent: {
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
	},
	offerFull: {
		width: "100%",
	},
	offerCardSkeleton: {
		width: 260,
		height: ROW_CARD_HEIGHT,
		borderRadius: radii.xl,
		overflow: "hidden",
		borderWidth: 1,
	},
	offerImage: {
		width: "100%",
		height: 160,
	},
	offerBody: {
		padding: spacing.md,
	},
	columnContent: {
		paddingHorizontal: spacing.lg,
	},
	columnItem: {
		marginBottom: spacing.md,
	},
	locationPromptWrap: {
		padding: spacing.lg,
	},
	locationPromptCard: {
		padding: spacing.md,
		borderRadius: radii.lg,
	},
	locationPromptRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	locationPromptIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	locationPromptText: {
		flex: 1,
	},
});
