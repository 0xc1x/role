import { useCallback, useState } from "react";
import { useEffect } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useSavedAddresses, useDeleteAddress } from "@/features/profile/hooks";
import { AddAddressSheet } from "@/features/profile/components/AddAddressSheet";
import { spacing, radii } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function AddressesScreen() {
	const { colors } = useTheme();
	const { profile, status, initialized } = useAuthStore();
	const { data, isLoading, isError, error, refetch } = useSavedAddresses(
		profile?.id ?? "",
	);
	const remove = useDeleteAddress(profile?.id ?? "");
	const [showAddSheet, setShowAddSheet] = useState(false);

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	const handleDelete = useCallback(
		(id: string) => remove.mutate(id, { onSuccess: () => void refetch() }),
		[remove, refetch],
	);

	const confirmDelete = useCallback(
		(id: string, label: string) => {
			Alert.alert(
				strings.addresses.deleteConfirmTitle,
				strings.addresses.deleteConfirmBody.replace("{label}", label),
				[
					{ text: strings.common.cancel, style: "cancel" },
					{
						text: strings.common.delete,
						style: "destructive",
						onPress: () => handleDelete(id),
					},
				],
			);
		},
		[handleDelete],
	);

	return (
		<Screen>
			<View style={styles.container}>
				<ScreenHeader title={strings.addresses.title} />

				<Pressable
					onPress={() => setShowAddSheet(true)}
					style={[styles.addButton, { backgroundColor: colors.foreground }]}
				>
					<Ionicons name="add" size={20} color={colors.primaryForeground} />
					<AppText
						weight="bold"
						style={{ color: colors.primaryForeground }}
					>
						{strings.addresses.addNew}
					</AppText>
				</Pressable>

				<View style={[styles.infoBanner, { backgroundColor: colors.muted }]}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{strings.addresses.infoBanner}
					</AppText>
				</View>

				{isLoading ? (
					<LoadingView />
				) : isError ? (
					<ErrorState error={error} onRetry={() => void refetch()} />
				) : !data || data.length === 0 ? (
					<EmptyState
						icon={<Ionicons name="map-outline" size={26} color={colors.primary} />}
						title={strings.addresses.emptyTitle}
						message={strings.addresses.emptyDescription}
						action={
							<Button
								label={strings.addresses.configureFirst}
								variant="ghost"
								onPress={() => setShowAddSheet(true)}
							/>
						}
					/>
				) : (
					<FlatList
						data={data}
						keyExtractor={(item) => String(item.id)}
						contentContainerStyle={{ gap: spacing.md }}
						renderItem={({ item }) => (
							<Card>
								<View style={styles.cardHeader}>
									<View style={styles.cardHeaderLeft}>
										<AppText variant="bodyMedium" weight="semiBold">
											{item.label}
										</AppText>
										{item.is_default ? (
											<StatusBadge
												label={strings.addresses.default}
												tone="brand"
											/>
										) : null}
									</View>
									<Button
										label={strings.common.delete}
										variant="ghost"
										size="sm"
										onPress={() => confirmDelete(String(item.id), item.label)}
									/>
								</View>
								<AppText
									variant="bodySmall"
									style={{ color: colors.mutedForeground }}
								>
									{item.address}
								</AppText>
								{item.references ? (
									<AppText
										variant="bodySmall"
										style={{ color: colors.mutedForeground }}
									>
										{item.references}
									</AppText>
								) : null}
							</Card>
						)}
					/>
				)}
			</View>

			<Modal
				visible={showAddSheet}
				transparent
				animationType="slide"
				statusBarTranslucent
				onRequestClose={() => setShowAddSheet(false)}
			>
				<AddAddressSheet
					userId={profile?.id ?? ""}
					onClose={() => setShowAddSheet(false)}
				/>
			</Modal>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1, gap: spacing.lg },
	header: { marginBottom: -spacing.md },
	addButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		height: 54,
		borderRadius: 16,
	},
	infoBanner: {
		padding: spacing.md,
		borderRadius: radii.md,
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 4,
	},
	cardHeaderLeft: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		flexShrink: 1,
	},
});
