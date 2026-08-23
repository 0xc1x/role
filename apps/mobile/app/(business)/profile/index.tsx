import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useState } from "react";

import { Text } from "@/components/ui/text";
import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	ErrorState,
	LoadingView,
	Screen,
} from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { authRepository } from "@/features/auth/data/repository";
import { useBusinesses, useBusinessProfile } from "@/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

function Row({ label, value }: { label: string; value: string | null }) {
	const { colors } = useTheme();
	return (
		<View style={styles.rowBetween}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
			<AppText variant="bodyMedium">{value ?? "—"}</AppText>
		</View>
	);
}

function SignOutDialog() {
	const [open, setOpen] = useState(false);
	const { colors } = useTheme();

	const confirmSignOut = () => {
		authRepository.signOut().then(() => {
			useAuthStore.getState().clear();
		});
		setOpen(false);
	};

	return (
		<View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogTrigger asChild>
					<Button
						label={strings.profile.signOutItem}
						variant="danger"
						onPress={() => setOpen(true)}
					/>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.auth.signOut}</AlertDialogTitle>
						<AlertDialogDescription>{strings.auth.signOutConfirm}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>Cancelar</Text>
						</AlertDialogCancel>
						<AlertDialogAction onPress={confirmSignOut}>
							<Text>{strings.auth.signOut}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<AppText
				variant="bodySmall"
				style={{ color: colors.mutedForeground, textAlign: "center" }}
			>
				{strings.settings.version} 1.0.0
			</AppText>
		</View>
	);
}

export default function BusinessProfileScreen() {
	const { colors, mode, setMode } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const { data: businesses } = useBusinesses(profile?.id ?? "");
	const business = businesses?.[0];
	const businessId = business?.id ?? "";
	const { data, isLoading, isError, error, refetch } = useBusinessProfile(
		businessId,
	);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	const b = data?.business;
	const themeOptions = [
		{ label: strings.business.themeLight, icon: "sunny-outline", mode: "light" },
		{ label: strings.business.themeDark, icon: "moon-outline", mode: "dark" },
		{ label: strings.business.themeSystem, icon: "contrast-outline", mode: "system" },
	] as const;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{strings.business.profile}
				</AppText>

				{data ? (
					<Card style={{ marginTop: spacing.lg }}>
						<AppText variant="h2" weight="bold">
							{b?.name}
						</AppText>
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground }}
						>
							{BUSINESS_TYPE_LABELS?.[b?.type ?? ""] ?? b?.type}
						</AppText>
						<AppText variant="bodyMedium" style={{ marginTop: spacing.md }}>
							{b?.description ?? "Sin descripción registrada"}
						</AppText>
						<Button
							label={strings.business.editProfile}
							icon={<Ionicons name="create-outline" size={20} color="#fff" />}
							style={{ marginTop: spacing.md, alignSelf: "flex-start" }}
							onPress={() => router.push("/(business)/profile/edit")}
						/>
					</Card>
				) : null}

				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={{ color: colors.mutedForeground, marginTop: spacing.xl }}
				>
					{strings.business.themeAppearance}
				</AppText>
				<View style={styles.themeRow}>
					{themeOptions.map((option) => {
						const selected = mode === option.mode;
						return (
							<Pressable
								key={option.label}
								onPress={() => setMode(option.mode)}
								style={({ pressed }) => [
									styles.themeOption,
									selected && {
										backgroundColor: colors.secondary,
										borderColor: colors.primary,
									},
									pressed && styles.pressed,
								]}
							>
								<Ionicons
									name={option.icon}
									size={20}
									color={selected ? colors.primary : colors.mutedForeground}
								/>
								<AppText
									variant="bodySmall"
									weight={selected ? "bold" : "regular"}
									style={{ color: selected ? colors.primary : colors.foreground }}
								>
									{option.label}
								</AppText>
							</Pressable>
						);
					})}
				</View>

				<Card style={{ marginTop: spacing.xl }}>
					<Link href={`/business/${businessId}`} asChild>
						<View style={styles.rowBetween}>
							<AppText variant="bodyMedium">
								Panel de {b?.name ?? ""}
							</AppText>
							<Ionicons name="chevron-forward" size={18} color="gray" />
						</View>
					</Link>
				</Card>

				<SignOutDialog />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginVertical: spacing.xs,
	},
	themeRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
	themeOption: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xs,
		paddingVertical: spacing.md,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "rgba(0,0,0,0.1)",
	},
	pressed: { opacity: 0.85 },
});