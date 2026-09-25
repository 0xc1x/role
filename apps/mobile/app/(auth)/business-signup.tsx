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
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";

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
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const handleSignup = async () => {
		if (
			!fullName.trim() ||
			!email.trim() ||
			!password ||
			password !== confirm ||
			!businessName.trim()
		) {
			setError(strings.auth.completeFields);
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
					Datos del responsable
				</AppText>
				<TextField
					label={strings.auth.fullName}
					value={fullName}
					onChangeText={setFullName}
					autoComplete="name"
				/>
				<TextField
					label={strings.auth.email}
					value={email}
					onChangeText={setEmail}
					autoCapitalize="none"
					keyboardType="email-address"
					autoComplete="email"
				/>
				<TextField
					label={strings.auth.password}
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					autoComplete="new-password"
				/>
				<TextField
					label={strings.auth.confirmPassword}
					value={confirm}
					onChangeText={setConfirm}
					secureTextEntry
					autoComplete="new-password"
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
					autoComplete="name"
				/>
				<TextField
					label={strings.business.signupPhoneLabel}
					value={businessPhone}
					onChangeText={setBusinessPhone}
					keyboardType="phone-pad"
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
