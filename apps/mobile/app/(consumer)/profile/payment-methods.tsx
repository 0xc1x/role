import { useState } from "react";
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
	Screen,
	ScreenHeader,
	TextField,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { usePaymentMethods } from "@/features/profile/hooks";
import { profileRepository } from "@/features/profile/data/repository";
import type { PaymentMethodModel } from "@/features/profile/domain/profile";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

function PaymentMethodRow({
	method,
	onSetDefault,
	onDelete,
}: {
	method: PaymentMethodModel;
	onSetDefault: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	const { colors } = useTheme();
	return (
		<Card onPress={method.isDefault ? undefined : () => onSetDefault(method.id)}>
			<View style={styles.row}>
				<View
					style={[styles.iconCircle, { backgroundColor: colors.inputBackground }]}
				>
					<Ionicons name="card-outline" size={20} color={colors.primary} />
				</View>
				<View style={styles.cardText}>
					<View style={styles.cardTitleRow}>
						<AppText variant="bodyMedium" weight="semiBold">
							•••• {method.last4}
						</AppText>
						{method.isDefault ? (
							<View style={[styles.defaultBadge, { backgroundColor: colors.primary + "14" }]}>
								<AppText
									style={{
										fontSize: 10,
										fontWeight: "700",
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
				<Pressable
					hitSlop={8}
					onPress={(e) => {
						e.stopPropagation();
						onDelete(method.id);
					}}
					style={styles.deleteButton}
				>
					<Ionicons
						name="trash-outline"
						size={20}
						color={colors.destructiveVibrant}
					/>
				</Pressable>
			</View>
		</Card>
	);
}

export default function PaymentMethodsScreen() {
	const { profile, status, initialized } = useAuthStore();
	const userId = profile?.id ?? "";
	const { data: methods, refetch } = usePaymentMethods(userId);
	const [showForm, setShowForm] = useState(false);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [number, setNumber] = useState("");
	const [name, setName] = useState("");
	const [expiry, setExpiry] = useState("");

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	const addCard = async () => {
		const digits = number.replace(/\D/g, "");
		if (digits.length < 15) return;
		const method: PaymentMethodModel = {
			id: `card_${Date.now()}`,
			brand: "card",
			last4: digits.slice(-4),
			cardHolder: name.trim() || "—",
			expiryMonth: expiry.split("/")[0] ?? "",
			expiryYear: expiry.split("/")[1] ?? "",
			isDefault: (methods?.length ?? 0) === 0,
			createdAt: new Date().toISOString(),
		};
		await profileRepository.savePaymentMethod(userId, method);
		setShowForm(false);
		setNumber("");
		setName("");
		setExpiry("");
		void refetch();
	};

	const setDefault = (id: string) => {
		void profileRepository
			.setDefaultPaymentMethod(userId, id)
			.then(() => refetch());
	};

	const deleteMethod = (id: string) => {
		void profileRepository
			.deletePaymentMethod(userId, id)
			.then(() => refetch());
	};

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.profile.paymentMethods} />

				{!methods || methods.length === 0 ? (
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
						renderItem={({ item }) => (
							<PaymentMethodRow
								method={item}
								onSetDefault={setDefault}
								onDelete={setDeleteId}
							/>
						)}
					/>
				)}

				{showForm ? (
					<Card style={{ marginTop: spacing.lg, gap: spacing.md }}>
						<TextField
							label={strings.paymentMethods.cardNumber}
							value={number}
							onChangeText={setNumber}
							keyboardType="number-pad"
							placeholder="4242 4242 4242 4242"
						/>
						<TextField
							label={strings.paymentMethods.cardHolder}
							value={name}
							onChangeText={setName}
						/>
						<TextField
							label={strings.paymentMethods.expiry}
							value={expiry}
							onChangeText={setExpiry}
							placeholder="MM/AA"
						/>
						<Button label={strings.common.save} onPress={() => void addCard()} fullWidth />
					</Card>
				) : (
					<Button
						label={strings.paymentMethods.add}
						variant="outline"
						onPress={() => setShowForm(true)}
						fullWidth
						style={{ marginTop: spacing.lg }}
					/>
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
	iconCircle: {
		width: 40,
		height: 40,
		borderRadius: 20,
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
		borderRadius: 4,
	},
	deleteButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
});