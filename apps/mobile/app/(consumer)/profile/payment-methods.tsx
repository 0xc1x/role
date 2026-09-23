import { useCallback, useState } from "react";
import { useEffect } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { CreditCard, Trash2 } from "lucide-react-native";

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
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, EmptyState, Screen, ScreenHeader } from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/src/features/auth/store";
import {
	useDeletePaymentMethod,
	usePaymentMethods,
	useSetDefaultPaymentMethod,
} from "@/src/features/profile/hooks";
import type { PaymentMethodModel } from "@/src/features/profile/domain/profile";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { withAlpha } from "@/src/core/theme/alpha";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function PaymentMethodRow({
	method,
	onSetDefault,
	onDelete,
	settingDefault = false,
}: {
	method: PaymentMethodModel;
	onSetDefault: (id: string) => void;
	onDelete: (id: string) => void;
	settingDefault?: boolean;
}) {
	const { colors } = useTheme();
	return (
		<Card>
			<View style={styles.row}>
				<Pressable
					onPress={method.isDefault ? undefined : () => onSetDefault(method.id)}
					disabled={method.isDefault || settingDefault}
					accessibilityRole="button"
					style={styles.rowMain}
				>
					<View
						style={[styles.iconCircle, { backgroundColor: colors.inputBackground }]}
					>
						<CreditCard size={20} color={colors.primary} />
					</View>
					<View style={styles.cardText}>
						<View style={styles.cardTitleRow}>
							<AppText variant="bodyMedium" weight="semiBold">
								•••• {method.last4}
							</AppText>
							{method.isDefault ? (
								<View style={[styles.defaultBadge, { backgroundColor: withAlpha(colors.primary, 0.078) }]}>
									<AppText
										variant="tiny"
										weight="bold"
										style={{
											color: colors.primary,
										}}
									>
										{strings.paymentMethods.default}
									</AppText>
								</View>
							) : null}
						</View>
						<AppText
							variant="bodySmall"
							numberOfLines={1}
							style={{ color: colors.mutedForeground }}
						>
							{method.cardHolder} · {method.expiryMonth}/{method.expiryYear}
						</AppText>
						{!method.isDefault ? (
							<AppText
								variant="bodySmall"
								weight="semiBold"
								style={{ color: colors.primary }}
							>
								{strings.paymentMethods.setDefault}
							</AppText>
						) : null}
					</View>
				</Pressable>
				<Button
					variant="ghost"
					size="icon"
					hitSlop={8}
					onPress={() => onDelete(method.id)}
					accessibilityRole="button"
					aria-label={strings.paymentMethods.delete}
					icon={
						<Trash2
							size={20}
							color={colors.destructiveVibrant}
						/>
					}
				/>
			</View>
		</Card>
	);
}

export default function PaymentMethodsScreen() {
	const { profile, status, initialized } = useAuthStore();
	const userId = profile?.id ?? "";
	const { data: methods, isLoading } = usePaymentMethods(userId);
	const setDefaultMutation = useSetDefaultPaymentMethod(userId);
	const deleteMutation = useDeletePaymentMethod(userId);
	const [showForm, setShowForm] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	const setDefault = useCallback(
		(id: string) => {
			setDefaultMutation.mutate(id, {
				onError: () => toast.error(strings.common.error),
			});
		},
		[setDefaultMutation],
	);

	const deleteMethod = (id: string) => {
		deleteMutation.mutate(id, {
			onSuccess: () => setDeleteId(null),
			onError: () => toast.error(strings.common.error),
		});
	};

	const renderItem = useCallback(
		({ item }: { item: PaymentMethodModel }) => (
			<PaymentMethodRow
				method={item}
				onSetDefault={setDefault}
				onDelete={setDeleteId}
				settingDefault={setDefaultMutation.isPending}
			/>
		),
		[setDefault, setDefaultMutation.isPending],
	);

	if (!initialized || status === "guest") return null;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.profile.paymentMethods} fallback="/(consumer)/profile" />

				{isLoading ? (
					<View style={{ marginTop: spacing.lg, gap: spacing.md }}>
						{[0, 1].map((i) => (
							<Skeleton
								key={`payment-skeleton-${i}`}
								style={{ height: 84, borderRadius: radii.lg }}
							/>
						))}
					</View>
				) : !methods || methods.length === 0 ? (
					<EmptyState
						title={strings.paymentMethods.empty}
						message={strings.paymentMethods.payAtPickupHint}
						style={{ marginTop: spacing.lg }}
					/>
				) : (
					<FlatList
						data={methods}
						keyExtractor={(m) => m.id}
						contentContainerStyle={{ marginTop: spacing.lg, gap: spacing.md }}
						scrollEnabled={false}
						renderItem={renderItem}
					/>
				)}

				{showForm ? (
					<Card style={{ marginTop: spacing.lg, gap: spacing.md }}>
						<AppText variant="bodyMedium" weight="semiBold">
							{strings.paymentMethods.comingSoon}
						</AppText>
						{/* La alta de tarjetas se habilitará con el SDK del gateway (tokenización PCI — nunca almacenamos el número de tarjeta). */}
						<Button variant="outline" onPress={() => setShowForm(false)} >
							{strings.common.cancel}
						</Button>
					</Card>
				) : (
					<Button
						variant="outline"
						onPress={() => {
							toast.info(strings.paymentMethods.comingSoonToast);
							setShowForm(true);
						}}
						style={{ marginTop: spacing.lg }}
					>
						{strings.paymentMethods.add}
					</Button>
				)}
			</View>

			<AlertDialog
				open={deleteId != null}
				onOpenChange={(open) => !open && setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{strings.paymentMethods.deleteConfirm}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.paymentMethods.deleteConfirmBody}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.cancel}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() => deleteId && deleteMethod(deleteId)}
						>
							<Text>{strings.common.delete}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
	rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
	iconCircle: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
	cardText: { flex: 1, gap: 2 },
	cardTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	defaultBadge: {
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: radii.sm,
	},
	deleteButton: {
		width: 40,
		height: 40,
		borderRadius: radii.lg,
		alignItems: "center",
		justifyContent: "center",
	},
});