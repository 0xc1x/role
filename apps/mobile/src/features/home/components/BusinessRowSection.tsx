import { useCallback } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Store } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { AppText, SectionHeader } from "@/src/core/ui";
import { spacing } from "@/src/core/theme/spacing";
import { useNearbyBusinesses } from "@/src/features/hooks";
import {
	BusinessGridCard,
	BusinessGridCardSkeleton,
} from "@/src/features/business/components/BusinessGridCard";
import type { BusinessSummary } from "@/src/features/offers/domain/offer";

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
				icon={<Store size={18} color={colors.primary} />}
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
					style={{
						color: colors.mutedForeground,
						paddingHorizontal: spacing.xl,
					}}
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
