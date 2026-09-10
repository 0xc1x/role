import { memo, useCallback, useState } from "react";
import { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";
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
import type { SavedAddress } from "@0xc1x/role-commons";
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
	const [editTarget, setEditTarget] = useState<SavedAddress | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<{
		id: string;
		label: string;
	} | null>(null);

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	const handleDelete = useCallback(
		(id: string) => {
			remove.mutate(id, { onSuccess: () => void refetch() });
			setDeleteTarget(null);
		},
		[remove, refetch],
	);

	const handleEditPress = useCallback((item: SavedAddress) => {
		setEditTarget(item);
	}, []);

	const handleDeletePress = useCallback((id: string, label: string) => {
		setDeleteTarget({ id, label });
	}, []);

	const renderItem = useCallback(
		({ item }: { item: SavedAddress }) => (
			<AddressCard
				item={item}
				onEdit={handleEditPress}
				onDelete={handleDeletePress}
			/>
		),
		[handleEditPress, handleDeletePress],
	);

	if (!initialized || status === "guest") return null;

	return (
		<Screen>
			<View style={styles.container}>
				<ScreenHeader title={strings.addresses.title} fallback="/(consumer)/profile" />

				<Pressable
					onPress={() => setShowAddSheet(true)}
					style={[styles.addButton, { backgroundColor: colors.foreground }]}
				>
					<Ionicons name="add" size={20} color={colors.background} />
					<AppText
						weight="bold"
						style={{ color: colors.background }}
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
						renderItem={renderItem}
					/>
				)}
			</View>

			{showAddSheet ? (
				<AddAddressSheet
					userId={profile?.id ?? ""}
					onClose={() => setShowAddSheet(false)}
				/>
			) : null}

			{editTarget ? (
				<AddAddressSheet
					key={editTarget.id}
					userId={profile?.id ?? ""}
					address={editTarget}
					onClose={() => setEditTarget(null)}
				/>
			) : null}

			<AlertDialog
				open={deleteTarget != null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{strings.addresses.deleteConfirmTitle}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.addresses.deleteConfirmBody.replace(
								"{label}",
								deleteTarget?.label ?? "",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.cancel}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() => deleteTarget && handleDelete(deleteTarget.id)}
						>
							<Text>{strings.common.delete}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Screen>
	);
}

const AddressCard = memo(function AddressCard({
	item,
	onEdit,
	onDelete,
}: {
	item: SavedAddress;
	onEdit: (item: SavedAddress) => void;
	onDelete: (id: string, label: string) => void;
}) {
	const { colors } = useTheme();
	return (
		<Card>
			<View style={styles.cardHeader}>
				<AppText variant="bodyMedium" weight="semiBold">
					{item.label}
				</AppText>
				{item.is_default ? (
					<StatusBadge label={strings.addresses.default} tone="brand" />
				) : null}
			</View>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{item.address}
			</AppText>
			{item.references ? (
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{item.references}
				</AppText>
			) : null}

			<View style={[styles.footerDivider, { backgroundColor: colors.muted }]} />

			<View style={styles.footerActions}>
				<Pressable
					onPress={() => onEdit(item)}
					style={[styles.footerButton, { borderColor: colors.border }]}
				>
					<AppText variant="bodySmall" weight="medium">
						{strings.addresses.edit}
					</AppText>
				</Pressable>

				<Pressable
					onPress={() => onDelete(String(item.id), item.label)}
					style={[
						styles.footerButton,
						{
							backgroundColor: colors.destructive ?? "#e5484d",
							borderColor: colors.destructive ?? "#e5484d",
						},
					]}
				>
					<AppText variant="bodySmall" weight="medium">
						{strings.common.delete}
					</AppText>
				</Pressable>
			</View>
		</Card>
	);
});

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
	footerDivider: {
		height: 1,
		marginTop: spacing.md,
		marginBottom: spacing.sm,
		opacity: 0.4,
	},
	footerActions: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	footerButton: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		height: 40,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: radii.md,
	},
});
