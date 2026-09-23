import { memo, useCallback, useState } from "react";
import { useEffect } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Map, Plus } from "lucide-react-native";

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
import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/src/features/auth/store";
import { useSavedAddresses, useDeleteAddress } from "@/src/features/profile/hooks";
import { AddAddressSheet } from "@/src/features/profile/components/AddAddressSheet";
import type { SavedAddress } from "@0xc1x/role-commons";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

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

				<Button
					onPress={() => setShowAddSheet(true)}
					fullWidth
					size="lg"
					icon={<Plus size={20} color={colors.primaryForeground} />}
				>
					{strings.addresses.addNew}
				</Button>

				<Alert variant="info">
					<AlertDescription>
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{strings.addresses.infoBanner}
						</AppText>
					</AlertDescription>
				</Alert>

				{isLoading ? (
					<View style={{ gap: spacing.md }}>
						{[0, 1].map((i) => (
							<Skeleton
								key={`address-skeleton-${i}`}
								style={{ height: 120, borderRadius: radii.lg }}
							/>
						))}
					</View>
				) : isError ? (
					<ErrorState error={error} onRetry={() => void refetch()} />
				) : !data || data.length === 0 ? (
					<EmptyState
						icon={<Map size={26} color={colors.primary} />}
						title={strings.addresses.emptyTitle}
						message={strings.addresses.emptyDescription}
						action={
							<Button
								variant="ghost"
								onPress={() => setShowAddSheet(true)}
							>
								{strings.addresses.configureFirst}
							</Button>
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
			<CardHeader style={styles.cardHeader}>
				<AppText variant="bodyMedium" weight="semiBold">
					{item.label}
				</AppText>
				{item.is_default ? (
					<StatusBadge label={strings.addresses.default} tone="brand" />
				) : null}
			</CardHeader>
			<CardContent>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{item.address}
				</AppText>
				{item.references ? (
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{item.references}
					</AppText>
				) : null}
			</CardContent>

			<CardFooter style={styles.footerActions}>
				<Button
					variant="outline"
					size="sm"
					onPress={() => onEdit(item)}
					style={{ flex: 1 }}
				>
					{strings.addresses.edit}
				</Button>

				<Button
					variant="destructive"
					size="sm"
					onPress={() => onDelete(String(item.id), item.label)}
					style={{ flex: 1 }}
				>
					{strings.common.delete}
				</Button>
			</CardFooter>
		</Card>
	);
});

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1, gap: spacing.lg },
	header: { marginBottom: -spacing.md },
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
