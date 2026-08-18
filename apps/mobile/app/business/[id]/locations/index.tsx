import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useBusinessLocations } from "@/features/business/hooks";
import { LocationCard } from "@/features/business/components/LocationCard";

export default function BusinessLocationsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data, isLoading, isError, error, refetch } =
		useBusinessLocations(businessId);

	return (
		<Screen scroll>
			<View style={styles.container}>
				<View style={styles.header}>
					<AppText variant="h2" weight="bold" style={styles.flex1}>
						{strings.business.locations}
					</AppText>
					<Button
						label={strings.business.addLocation}
						size="sm"
						icon={
							<Ionicons name="add" size={18} color="#fff" />
						}
						onPress={() =>
							router.push(`/business/${businessId}/locations/create`)
						}
					/>
				</View>

				{isLoading ? (
					<LoadingView />
				) : isError ? (
					<ErrorState error={error} onRetry={() => void refetch()} />
				) : !data || data.length === 0 ? (
					<EmptyState
						icon={
							<Ionicons name="map-outline" size={28} color={colors.primary} />
						}
						title={strings.business.noLocations}
						message={strings.business.noLocationsHint}
						action={
							<Button
								label={strings.business.createLocation}
								onPress={() =>
									router.push(`/business/${businessId}/locations/create`)
								}
								style={{ marginTop: spacing.md }}
							/>
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
						renderItem={({ item }) => (
							<LocationCard
								name={item.name}
								address={item.address}
								phone={item.phone}
								isActive={item.is_active}
								onPress={() =>
									router.push(`/business/${businessId}/locations/${item.id}`)
								}
							/>
						)}
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