import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { toast } from "sonner-native";

import { toAppError } from "@/core/error/mapper";
import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import { radii, spacing } from "@/core/theme/spacing";
import { AppText, Button } from "@/core/ui";
import { Logo } from "@/core/ui/Logo";
import { AuthField } from "@/features/auth/presentation/AuthField";
import { AuthScreenShell } from "@/features/auth/presentation/AuthScreenShell";
import { SocialAuthButtons } from "@/features/auth/presentation/SocialAuthButtons";
import { authRepository } from "@/features/auth/data/repository";

export default function LoginScreen() {
	const { colors } = useTheme();
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [showReset, setShowReset] = useState(false);

	const validate = () => {
		const trimmed = email.trim();
		let ok = true;
		if (!trimmed) {
			setEmailError(strings.auth.requiredEmail);
			ok = false;
		} else if (!trimmed.includes("@")) {
			setEmailError(strings.auth.invalidEmail);
			ok = false;
		} else {
			setEmailError(null);
		}
		if (!password) {
			setPasswordError(strings.auth.requiredPassword);
			ok = false;
		} else {
			setPasswordError(null);
		}
		return ok;
	};

	const handleLogin = async () => {
		if (loading) return;
		setError(null);
		if (!validate()) return;
		setLoading(true);
		try {
			const profile = await authRepository.signInWithEmail(
				email.trim(),
				password,
			);
			if (profile.role === "business" || profile.role === "admin") {
				// cast: la ruta business no está publicada en los tipos generados aún
				router.replace("/(business)/products" as Href);
			} else {
				router.replace("/(consumer)");
			}
		} catch (e) {
			setError(toAppError(e, strings.auth.loginFailed).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<AuthScreenShell title={strings.auth.login}>
			<View style={styles.logoWrap}>
				<Logo width={104} height={74} color={colors.primary} />
			</View>
			<View style={styles.heading}>
				<AppText variant="h1" weight="bold" style={styles.center}>
					{strings.auth.welcomeBack}
				</AppText>
				<AppText
					variant="bodyMedium"
					style={[styles.center, { color: colors.mutedForeground }]}
				>
					{strings.auth.loginSubtitle}
				</AppText>
			</View>

			<AuthField
				label={strings.auth.email}
				icon="mail-outline"
				value={email}
				onChangeText={setEmail}
				error={emailError}
				hint={strings.auth.emailHint}
				keyboardType="email-address"
				autoCapitalize="none"
				autoComplete="email"
				textContentType="emailAddress"
				returnKeyType="next"
			/>
			<AuthField
				label={strings.auth.password}
				icon="lock-closed-outline"
				value={password}
				onChangeText={setPassword}
				error={passwordError}
				secure
				autoComplete="current-password"
				textContentType="password"
				returnKeyType="done"
				onSubmitEditing={handleLogin}
			/>
			<Pressable
				onPress={() => setShowReset(true)}
				hitSlop={8}
				accessibilityRole="button"
				style={styles.forgotRow}
			>
				<AppText
					variant="bodySmall"
					weight="semiBold"
					style={{ color: colors.primary, fontSize: 13 }}
				>
					{strings.auth.forgotPassword}
				</AppText>
			</Pressable>

			{error ? (
				<View
					style={[
						styles.errorBox,
						{
							backgroundColor: colors.destructiveSurface,
							borderColor: colors.destructiveBorder,
						},
					]}
				>
					<AppText
						variant="bodySmall"
						style={[styles.errorText, { color: colors.destructiveVibrant }]}
					>
						{error}
					</AppText>
					<Pressable
						onPress={() => setError(null)}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={strings.common.close}
					>
						<Ionicons name="close" size={16} color={colors.destructiveVibrant} />
					</Pressable>
				</View>
			) : null}

			<Button
				label={strings.auth.login}
				onPress={handleLogin}
				loading={loading}
				size="lg"
				style={styles.primaryButton}
			/>

			<SocialAuthButtons label={strings.auth.orContinueWith} />

			<AppText
				variant="bodyMedium"
				style={[styles.switchLine, { color: colors.mutedForeground }]}
			>
				{strings.auth.noAccount}{" "}
				<Text
					onPress={() => router.push("/signup")}
					style={{ color: colors.primary, fontWeight: "700" }}
				>
					{strings.auth.signupFree}
				</Text>
			</AppText>
			<ForgotPasswordDialog
				visible={showReset}
				initialEmail={email}
				onClose={() => setShowReset(false)}
			/>
		</AuthScreenShell>
	);
}

function ForgotPasswordDialog({
	visible,
	initialEmail,
	onClose,
}: {
	visible: boolean;
	initialEmail: string;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const [email, setEmail] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (visible) {
			setEmail(initialEmail);
			setError(null);
		}
	}, [visible, initialEmail]);

	const send = async () => {
		const trimmed = email.trim();
		if (!trimmed || !trimmed.includes("@")) {
			setError(strings.auth.invalidEmail);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await authRepository.sendPasswordResetEmail(trimmed);
			toast.success(strings.auth.resetSentMessage);
			onClose();
		} catch (e) {
			setError(toAppError(e, strings.auth.resetSendFailed).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
			<View style={styles.overlay}>
				<View
					style={[
						styles.dialog,
						{ backgroundColor: colors.card, borderColor: colors.borderSolid },
					]}
				>
					<AppText variant="h4" weight="bold">
						{strings.auth.resetPassword}
					</AppText>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
					>
						{strings.auth.resetDescription}
					</AppText>
					<AuthField
						label={strings.auth.email}
						icon="mail-outline"
						value={email}
						onChangeText={(t) => {
							setEmail(t);
							if (error) setError(null);
						}}
						error={error}
						keyboardType="email-address"
						autoCapitalize="none"
						autoComplete="email"
						textContentType="emailAddress"
						returnKeyType="done"
						onSubmitEditing={send}
					/>
					<View style={styles.dialogActions}>
						<Button
							label={strings.common.cancel}
							variant="ghost"
							onPress={onClose}
							disabled={loading}
							style={styles.dialogButton}
						/>
						<Button
							label={strings.auth.sendLink}
							onPress={send}
							loading={loading}
							style={styles.dialogButton}
						/>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	logoWrap: { alignItems: "center", marginBottom: spacing.md },
	heading: { gap: spacing.sm, marginBottom: spacing.xl },
	center: { textAlign: "center" },
	forgotRow: { alignItems: "flex-end", marginBottom: spacing.md },
	errorBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		marginBottom: spacing.md,
	},
	errorText: { flex: 1 },
	primaryButton: { borderRadius: radii.md, marginTop: spacing.sm },
	switchLine: { textAlign: "center", marginTop: spacing.xl },
	overlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
		alignItems: "center",
		justifyContent: "center",
		padding: spacing.xl,
	},
	dialog: {
		width: "100%",
		maxWidth: 420,
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.xl,
		gap: spacing.md,
	},
	dialogActions: {
		flexDirection: "row",
		gap: spacing.md,
		marginTop: spacing.xs,
	},
	dialogButton: { flex: 1, borderRadius: radii.md },
});