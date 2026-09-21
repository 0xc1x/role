import { LockKeyhole, Mail, X } from "lucide-react-native";
import { type Href, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { toAppError } from "@/src/core/error/mapper";
import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { AppText, TextField } from "@/src/core/ui";
import { Logo } from "@/src/core/ui/Logo";
import { AuthScreenShell } from "@/src/features/auth/presentation/AuthScreenShell";
import { SocialAuthButtons } from "@/src/features/auth/presentation/SocialAuthButtons";
import { authRepository } from "@/src/features/auth/data/repository";
import { validateLoginForm } from "@/src/features/auth/domain/validation";
import { useAuthStore } from "@/src/features/auth/store";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export default function LoginScreen() {
	const { colors } = useTheme();
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const loginPending = useRef(false);
	const [loading, setLoading] = useState(false);
	const [showReset, setShowReset] = useState(false);

	const validate = () => {
		const result = validateLoginForm(email, password);
		setEmailError(result.emailError);
		setPasswordError(result.passwordError);
		return result.ok;
	};

	const handleLogin = async () => {
		if (loginPending.current) return;
		setError(null);
		if (!validate()) return;
		loginPending.current = true;
		setLoading(true);
		try {
			const profile = await authRepository.signInWithEmail(
				email.trim(),
				password,
			);
			// Escribir el perfil ANTES de navegar: los guards de (business) y el
			// redirect de index leen el store, que si no se actualizaría solo vía
			// el listener async de onAuthStateChange (carrera → vista customer).
			useAuthStore.getState().setProfile(profile);
			if (profile.role === "business" || profile.role === "admin") {
				// cast: la ruta business no está publicada en los tipos generados aún
				router.replace("/(business)/products" as Href);
			} else {
				router.replace("/(consumer)");
			}
		} catch (e) {
			setError(toAppError(e, strings.auth.loginFailed).message);
		} finally {
			loginPending.current = false;
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

			<TextField
				label={strings.auth.email}
				icon={Mail}
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
			<TextField
				label={strings.auth.password}
				icon={LockKeyhole}
				value={password}
				onChangeText={setPassword}
				error={passwordError}
				secureToggle
				autoComplete="current-password"
				textContentType="password"
				returnKeyType="done"
				onSubmitEditing={handleLogin}
			/>
			<View style={styles.forgotRow}>
				<Button
					variant="link"
					onPress={() => setShowReset(true)}
					hitSlop={8}
					accessibilityRole="button"
				>
					{strings.auth.forgotPassword}
				</Button>
			</View>

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
					<Button
						variant="ghost"
						size="icon"
						onPress={() => setError(null)}
						hitSlop={8}
						accessibilityRole="button"
						aria-label={strings.common.close}
						style={{ width: 32, height: 32 }}
						icon={<X size={16} color={colors.destructiveVibrant} />}
					/>
				</View>
			) : null}

			<Button
				onPress={handleLogin}
				size="default"
				loading={loading}
			>
				{strings.auth.login}
			</Button>


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
			{showReset ? (
				<ForgotPasswordDialog
					initialEmail={email}
					onClose={() => setShowReset(false)}
				/>
			) : null}
		</AuthScreenShell>
	);
}

function ForgotPasswordDialog({
	initialEmail,
	onClose,
}: {
	initialEmail: string;
	onClose: () => void;
}) {
	const { colors } = useTheme();
	const [email, setEmail] = useState(initialEmail);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

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
		<Modal transparent animationType="fade" visible onRequestClose={onClose}>
			<View style={[styles.overlay, { backgroundColor: withAlpha(colors.scrim, 0.4) }]}>
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
				<TextField
					label={strings.auth.email}
					icon={Mail}
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
							variant="ghost"
							onPress={onClose}
							loading={loading}
							style={styles.dialogButton}
						>
							{strings.common.cancel}
						</Button>

						<Button
							onPress={send}
							style={styles.dialogButton}
						>
							{strings.auth.sendLink}
						</Button>
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
	primaryButton: { marginTop: spacing.sm },
	switchLine: { textAlign: "center", marginTop: spacing.xl },
	overlay: {
		flex: 1,
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
	dialogButton: { flex: 1 },
});
