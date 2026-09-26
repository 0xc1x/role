import { Check } from "lucide-react-native";
import { Link, router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, Screen, TextField } from "@/src/core/ui";
import { submitBusinessOwnerOnboarding } from "@/src/features/business/data/onboarding";
import { toAppError } from "@/src/core/error/mapper";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { validateBusinessSignupForm } from "@/src/features/auth/domain/validation";
import { Button } from "@/components/ui/button";

type BusinessSignupErrors = ReturnType<typeof validateBusinessSignupForm>;

const EMPTY_ERRORS: BusinessSignupErrors = {
	nameError: null,
	emailError: null,
	passwordError: null,
	confirmPasswordError: null,
	businessNameError: null,
	ok: true,
};

export default function BusinessSignupScreen() {
	const { colors } = useTheme();
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [businessName, setBusinessName] = useState("");
	const [businessPhone, setBusinessPhone] = useState("");
	const [analyticsConsent, setAnalyticsConsent] = useState(false);
	const [loading, setLoading] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<
		ReturnType<typeof validateBusinessSignupForm>
	>(EMPTY_ERRORS);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	// Same validator as the consumer signup (plus the business name and the
	// confirmation match): the submit button is enabled only when every field
	// passes, and the errors name the offending field.
	const validation = validateBusinessSignupForm({
		fullName,
		email,
		password,
		confirmPassword: confirm,
		businessName,
	});
	// Phone is optional, so it never blocks the submit.
	const canSubmit = validation.ok && !loading;

	const handleSignup = async () => {
		if (loading) return;
		setFieldErrors(validation);
		if (!validation.ok) {
			setError(null);
			return;
		}
		setLoading(true);
		setError(null);
		setSuccess(null);
		try {
			const result = await submitBusinessOwnerOnboarding({
				fullName: fullName.trim(),
				email: email.trim(),
				password,
				businessName: businessName.trim(),
				businessPhone: businessPhone.trim(),
				analyticsConsentGranted: analyticsConsent,
			});

			if (result.status === "confirmation_required") {
				setSuccess(strings.business.signupConfirmationRequired);
			} else {
				setSuccess(strings.business.signupCompleted);
				setTimeout(() => router.replace("/"), 1200);
			}
		} catch (e) {
			setError(toAppError(e, strings.auth.invalidCredentials).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Screen scroll keyboardShouldPersistTaps="handled">
			<View style={styles.container}>
				<AppText variant="h1" weight="bold">
					{strings.business.createBusiness}
				</AppText>
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, marginBottom: spacing.xl }}
				>
					{strings.landing.forBusiness}
				</AppText>

				{error ? (
					<AppText variant="bodySmall" style={{ color: colors.destructive }}>
						{error}
					</AppText>
				) : null}
				{success ? (
					<AppText variant="bodySmall" style={{ color: colors.success }}>
						{success}
					</AppText>
				) : null}

				<AppText
					variant="labelSmall"
					weight="bold"
					style={{ marginTop: spacing.sm }}
				>
					{strings.business.signupOwnerTitle}
				</AppText>
				<TextField
					label={strings.auth.fullName}
					value={fullName}
					onChangeText={setFullName}
					error={fieldErrors.nameError}
					autoComplete="name"
					returnKeyType="next"
				/>
				<TextField
					label={strings.auth.email}
					value={email}
					onChangeText={setEmail}
					error={fieldErrors.emailError}
					keyboardType="email-address"
					autoCapitalize="none"
					autoComplete="email"
					textContentType="emailAddress"
					returnKeyType="next"
				/>
				<TextField
					label={strings.auth.password}
					value={password}
					onChangeText={setPassword}
					error={fieldErrors.passwordError}
					secureTextEntry
					hint={strings.auth.passwordMinHint}
					autoComplete="new-password"
					textContentType="newPassword"
					returnKeyType="next"
				/>
				<TextField
					label={strings.auth.confirmPassword}
					value={confirm}
					onChangeText={setConfirm}
					error={fieldErrors.confirmPasswordError}
					secureTextEntry
					autoComplete="new-password"
					textContentType="newPassword"
					returnKeyType="done"
					onSubmitEditing={handleSignup}
				/>

				<AppText
					variant="labelSmall"
					weight="bold"
					style={{ marginTop: spacing.md }}
				>
					{strings.business.signupDataTitle}
				</AppText>
				<TextField
					label={strings.business.businessName}
					value={businessName}
					onChangeText={setBusinessName}
					error={fieldErrors.businessNameError}
					autoComplete="name"
					returnKeyType="next"
				/>
				<TextField
					label={strings.business.signupPhoneLabel}
					value={businessPhone}
					onChangeText={setBusinessPhone}
					keyboardType="phone-pad"
					returnKeyType="done"
				/>

				<View style={styles.analyticsRow}>
					<Pressable
						onPress={() => setAnalyticsConsent((value) => !value)}
						hitSlop={8}
						accessibilityRole="checkbox"
						accessibilityState={{ checked: analyticsConsent }}
						accessibilityLabel={strings.auth.consentAnalytics}
						style={[
							styles.checkbox,
							{
								borderColor: analyticsConsent
									? colors.primary
									: colors.borderSolid,
								backgroundColor: analyticsConsent
									? colors.primary
									: "transparent",
							},
						]}
					>
						{analyticsConsent ? (
							<Check size={16} color={colors.primaryForeground} />
						) : null}
					</Pressable>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground, flex: 1 }}
					>
						{strings.auth.consentAnalytics}
					</AppText>
				</View>

				<Button
					onPress={handleSignup}
					loading={loading}
					disabled={!canSubmit}
					fullWidth
					style={{ marginTop: spacing.md }}
				>
					{strings.business.createBusiness}
				</Button>
				<Link href="/login" style={[styles.link, { color: colors.primary }]}>
					<AppText variant="bodyMedium">{strings.auth.login}</AppText>
				</Link>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.sm },
	analyticsRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.md,
		marginTop: spacing.sm,
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
	link: { marginTop: spacing.lg, alignSelf: "center" },
});
