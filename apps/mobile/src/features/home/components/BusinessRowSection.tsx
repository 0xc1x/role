import { useCallback } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import { AppText, SectionHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useNearbyBusinesses } from "@/features/hooks";
import {
	BusinessGridCard,
	BusinessGridCardSkeleton,
} from "@/features/business/components/BusinessGridCard";
import type { BusinessSummary } from "@/features/offers/domain/offer";

const SKELETON_ROWS = [0, 1, 2];

function skeletonKeyExtractor(item: number): string {
	return `skeleton-${item}`;
}

function SkeletonRowItem() {
	return (
		<View style={styles.item}>
			<BusinessGridCardSkeleton />
		</View>
	);
}

function BusinessRowItem({ item }: { item: BusinessSummary }) {
	return (
		<View style={styles.item}>
			<BusinessGridCard business={item} />
		</View>
	);
}

export function BusinessRowSection({
	limit = 5,
	onSeeAll,
}: {
	limit?: number;
	onSeeAll?: () => void;
}) {
	const { colors } = useTheme();
	const { data: businesses, isLoading, isError } = useNearbyBusinesses(limit);
	const renderSkeletonItem = useCallback(() => <SkeletonRowItem />, []);
	const renderBusinessItem = useCallback(
		({ item }: { item: BusinessSummary }) => <BusinessRowItem item={item} />,
		[],
	);

	return (
		<View style={styles.container}>
			<SectionHeader
				title={strings.home.negociosCerca}
				icon={<Ionicons name="storefront-outline" size={18} color={colors.primary} />}
				onSeeAll={onSeeAll}
			/>
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
					{strings.home.businessLoadError}
				</AppText>
			) : businesses && businesses.length > 0 ? (
				<FlatList
					data={businesses}
					keyExtractor={(item) => item.id}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={renderBusinessItem}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.lg,
	},
	rowContent: {
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
	},
	item: {
		width: 140,
		height: 230,
	},
});
