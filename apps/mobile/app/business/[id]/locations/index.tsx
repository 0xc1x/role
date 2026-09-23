import { Map, Plus } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
} from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { useBusinessLocations } from "@/src/features/business/hooks";
import { LocationCard } from "@/src/features/business/components/LocationCard";
import { Button } from "@/components/ui/button";

export default function BusinessLocationsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data, isLoading, isError, error, refetch } =
		useBusinessLocations(businessId);

	const handleLocationPress = useCallback(
		(locationId: string) => {
			router.push(`/business/${businessId}/locations/${locationId}`);
		},
		[businessId],
	);

	const renderItem = useCallback(
		({
			item,
		}: {
			item: NonNullable<typeof data>[number];
		}) => (
			<LocationCard
				name={item.name}
				address={item.address}
				phone={item.phone}
				isActive={item.is_active}
				onPress={() => handleLocationPress(item.id)}
			/>
		),
		[handleLocationPress],
	);

	return (
		<Screen scroll>
			<View style={styles.container}>
				<View style={styles.header}>
					<AppText variant="h2" weight="bold" style={styles.flex1}>
						{strings.business.locations}
					</AppText>
					<Button
						size="sm"
						icon={
							<Plus size={18} color={colors.primaryForeground} />
						}
						onPress={() =>
							router.push(`/business/${businessId}/locations/create`)
						}
					>
						{strings.business.addLocation}
					</Button>
				</View>

				{isLoading ? (
					<LoadingView />
				) : isError ? (
					<ErrorState error={error} onRetry={() => void refetch()} />
				) : !data || data.length === 0 ? (
					<EmptyState
						icon={
							<Map size={28} color={colors.primary} />
						}
						title={strings.business.noLocations}
						message={strings.business.noLocationsHint}
						action={
							<Button
								onPress={() =>
									router.push(`/business/${businessId}/locations/create`)
								}
								style={{ marginTop: spacing.md }}
							>
								{strings.business.createLocation}
							</Button>
						}
					/>
				) : (
					<FlatList
						data={data}
						keyExtractor={(item) => item.id}
						contentContainerStyle={styles.list}
						ItemSeparatorComponent={() => (
							<View style={{ height: spacing.md }} />
						)}
						renderItem={renderItem}
					/>
				)}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: spacing.lg,
		gap: spacing.md,
	},
	flex1: { flex: 1 },
	list: { paddingBottom: spacing.lg },
});