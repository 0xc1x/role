import { router } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	StatusBadge,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useBusinesses } from "@/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function BusinessDashboardScreen() {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const {
		data: businesses,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinesses(profile?.id ?? "");

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.title ?? "Panel de negocio"}
				</AppText>
				<Button
					label="Nuevo negocio"
					size="sm"
					onPress={() => router.push("/business-signup")}
				/>
			</View>

			{!businesses || businesses.length === 0 ? (
				<EmptyState
					title="Aún no tienes negocios"
					message="Registra tu negocio para empezar a vender excedentes."
				/>
			) : (
				<FlatList
					data={businesses}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
					renderItem={({ item }) => (
						<Card onPress={() => router.push(`/business/${item.id}`)}>
							<AppText variant="h4" weight="bold">
								{item.name}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{BUSINESS_TYPE_LABELS[item.type] ?? item.type}
							</AppText>
							<View style={{ marginTop: spacing.sm }}>
								<StatusBadge
									label={item.is_active ? "Activo" : "Inactivo"}
									tone={item.is_active ? "success" : "neutral"}
								/>
							</View>
						</Card>
					)}
				/>
			)}
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.lg,
		marginBottom: spacing.md,
		gap: spacing.md,
	},
});