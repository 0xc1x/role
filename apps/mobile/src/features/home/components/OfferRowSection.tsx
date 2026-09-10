import { useCallback } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/core/theme";
import { AppText, Card, SectionHeader } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
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
			<Skeleton style={styles.offerImage} />
			<View style={styles.offerBody}>
				<Skeleton
					style={{
						height: 14,
						width: "70%",
						borderRadius: 4,
						marginBottom: 8,
					}}
				/>
				<Skeleton
					style={{
						height: 10,
						width: "55%",
						borderRadius: 4,
						marginBottom: 8,
					}}
				/>
				<Skeleton
					style={{
						height: 10,
						width: "60%",
						borderRadius: 4,
					}}
				/>
			</View>
		</View>
	);
}

const SKELETON_ROWS = [0, 1, 2];

function skeletonKeyExtractor(item: number): string {
	return `skeleton-${item}`;
}

function offerKeyExtractor(item: OfferDetail): string {
	return item.offer.id;
}

function SkeletonRowItem() {
	return <OfferSkeleton />;
}

function OfferRowItem({ item }: { item: OfferDetail }) {
	return (
		<View style={styles.rowCard}>
			<OfferCard offer={item} />
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
	const renderSkeletonItem = useCallback(() => <SkeletonRowItem />, []);
	const renderOfferItem = useCallback(
		({ item }: { item: OfferDetail }) => <OfferRowItem item={item} />,
		[],
	);

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader title={title} icon={icon} onSeeAll={onSeeAll} />
			{isLoading ? (
				<FlatList
					data={SKELETON_ROWS}
					keyExtractor={skeletonKeyExtractor}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={renderSkeletonItem}
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
					keyExtractor={offerKeyExtractor}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={renderOfferItem}
				/>
			)}
		</View>
	);
}

// Cada sección llama a su hook en un componente propio: los hooks nunca
// van dentro de ramas condicionales del switch.
export function OfferRowSection(props: OfferRowSectionProps) {
	switch (props.type) {
		case "popular":
			return <PopularRow {...props} />;
		case "expiring":
			return <ExpiringRow {...props} />;
		case "recent":
			return <RecentRow {...props} />;
		case "nearby":
			return <NearbyRow {...props} />;
	}
}

type RowProps = Omit<OfferRowSectionProps, "type">;

function PopularRow({ title, icon, limit = 10, category = null, onSeeAll }: RowProps) {
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

function ExpiringRow({ title, icon, limit = 10, onSeeAll }: RowProps) {
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

function RecentRow({ title, icon, limit = 10, onSeeAll }: RowProps) {
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

function NearbyRow({ title, icon, limit = 10, category = null, onSeeAll }: RowProps) {
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
								{ backgroundColor: withAlpha(colors.primary, 0.078) },
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
	rowCard: {
		width: 260,
		height: ROW_CARD_HEIGHT,
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
