import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

const BENEFITS = [
	strings.auth.benefitSave,
	strings.auth.benefitReduceWaste,
	strings.auth.benefitDiscover,
	strings.auth.benefitSustainable,
];

export default function SignupScreen() {
	const { colors, scheme } = useTheme();
	const router = useRouter();
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [acceptedTerms, setAcceptedTerms] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passwordError, setPasswordError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const validate = () => {
		const name = fullName.trim();
		const mail = email.trim();
		let ok = true;
		if (!name) {
			setNameError(strings.auth.requiredName);
			ok = false;
		} else {
			setNameError(null);
		}
		if (!mail) {
			setEmailError(strings.auth.requiredEmail);
			ok = false;
		} else if (!mail.includes("@")) {
			setEmailError(strings.auth.invalidEmail);
			ok = false;
		} else {
			setEmailError(null);
		}
		if (!password) {
			setPasswordError(strings.auth.requiredPassword);
			ok = false;
		} else if (password.length < 8) {
			setPasswordError(strings.auth.passwordMinError);
			ok = false;
		} else {
			setPasswordError(null);
		}
		return ok;
	};

	const handleSignup = async () => {
		if (loading) return;
		if (!acceptedTerms) {
			toast.error(strings.auth.termsRequired);
			return;
		}
		if (!validate()) return;
		setLoading(true);
		try {
			const result = await authRepository.signUpWithEmail({
				fullName: fullName.trim(),
				email: email.trim(),
				password,
				role: "user",
				analyticsConsentGranted: false,
			});
			if (result.requiresEmailConfirmation) {
				toast.success(strings.auth.accountCreatedConfirmation);
				router.replace("/login");
				return;
			}
			router.replace("/(consumer)");
		} catch (e) {
			toast.error(toAppError(e, strings.auth.signupFailed).message);
		} finally {
			setLoading(false);
		}
	};

	const accent = scheme === "dark" ? colors.success : colors.successDark;
	const linkStyle = { color: colors.primary, fontWeight: "700" as const };

	return (
		<AuthScreenShell title={strings.auth.createAccount}>
			<View style={styles.logoWrap}>
				<Logo width={104} height={74} color={colors.primary} />
			</View>
			<View style={styles.heading}>
				<AppText variant="h1" weight="bold" style={styles.center}>
					{strings.auth.signupHeadline}
				</AppText>
				<AppText
					variant="bodyMedium"
					style={[styles.center, { color: colors.mutedForeground }]}
				>
					{strings.auth.signupSubtitle}
				</AppText>
			</View>

			<AuthField
				label={strings.auth.fullName}
				icon="person-outline"
				value={fullName}
				onChangeText={setFullName}
				error={nameError}
				autoComplete="name"
				textContentType="name"
				returnKeyType="next"
			/>
			<AuthField
				label={strings.auth.email}
				icon="mail-outline"
				value={email}
				onChangeText={setEmail}
				error={emailError}
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
				hint={strings.auth.passwordMinHint}
				autoComplete="new-password"
				textContentType="newPassword"
				returnKeyType="done"
				onSubmitEditing={handleSignup}
			/>

			<View style={styles.termsRow}>
				<Pressable
					onPress={() => setAcceptedTerms((s) => !s)}
					hitSlop={8}
					accessibilityRole="checkbox"
					accessibilityState={{ checked: acceptedTerms }}
					accessibilityLabel={strings.auth.termsRequired}
					style={[
						styles.checkbox,
						{
							borderColor: acceptedTerms ? colors.primary : colors.borderSolid,
							backgroundColor: acceptedTerms ? colors.primary : "transparent",
						},
					]}
				>
					{acceptedTerms ? (
						<Ionicons name="checkmark" size={16} color={colors.primaryForeground} />
					) : null}
				</Pressable>
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, flex: 1, lineHeight: 17 }}
				>
					{strings.auth.termsConsentPrefix}
					<Text
						onPress={() => router.push("/profile/terms")}
						style={linkStyle}
					>
						{strings.auth.termsConsentLink}
					</Text>
					{strings.auth.termsConsentConjunction}
					<Text
						onPress={() => router.push("/profile/privacy")}
						style={linkStyle}
					>
						{strings.auth.termsConsentPrivacy}
					</Text>
					{strings.auth.termsConsentSuffix}
				</AppText>
			</View>

			<Button
				label={strings.auth.createAccount}
				onPress={handleSignup}
				loading={loading}
				disabled={!acceptedTerms}
				size="lg"
				style={styles.primaryButton}
			/>

			<SocialAuthButtons label={strings.auth.orSignupWith} />

			<AppText
				variant="bodyMedium"
				style={[styles.switchLine, { color: colors.mutedForeground }]}
			>
				{strings.auth.haveAccount}{" "}
				<Text
					onPress={() => router.push("/login")}
					style={linkStyle}
				>
					{strings.auth.loginCTA}
				</Text>
			</AppText>

			<View
				style={[
					styles.benefits,
					{
						backgroundColor: colors.surfaceSuccess,
						borderColor: colors.surfaceSuccessBorder,
					},
				]}
			>
				<AppText variant="h4" weight="bold" style={{ color: accent }}>
					{strings.auth.benefitsTitle}
				</AppText>
				<View style={styles.benefitsList}>
					{BENEFITS.map((benefit) => (
						<View key={benefit} style={styles.benefitItem}>
							<Ionicons name="checkmark-circle" size={18} color={accent} />
							<AppText
								variant="bodySmall"
								style={{ color: accent, flex: 1, lineHeight: 17 }}
							>
								{benefit}
							</AppText>
						</View>
					))}
				</View>
			</View>
		</AuthScreenShell>
	);
}

const styles = StyleSheet.create({
	logoWrap: { alignItems: "center", marginBottom: spacing.md },
	heading: { gap: spacing.sm, marginBottom: spacing.xl },
	center: { textAlign: "center" },
	termsRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
		marginTop: spacing.xs,
		marginBottom: spacing.xl,
	},
	checkbox: {
		width: 24,
		height: 24,
		borderRadius: 4,
		borderWidth: 2,
		alignItems: "center",
		justifyContent: "center",
		marginTop: 1,
	},
	primaryButton: { borderRadius: radii.md },
	switchLine: { textAlign: "center", marginTop: spacing.xl },
	benefits: {
		borderRadius: radii.lg,
		borderWidth: 1,
		padding: spacing.xl,
		marginTop: spacing.xl,
	},
	benefitsList: { gap: spacing.sm, marginTop: spacing.md },
	benefitItem: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
});