import { Link, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Screen, TextField } from "@/core/ui";
import { authRepository } from "@/features/auth/data/repository";
import { toAppError } from "@/core/error/mapper";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function BusinessSignupScreen() {
	const { colors } = useTheme();
	const [fullName, setFullName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSignup = async () => {
		if (
			!fullName.trim() ||
			!email.trim() ||
			!password ||
			password !== confirm
		) {
			setError("Completa todos los campos y verifica la contraseña");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const result = await authRepository.signUpWithEmail({
				fullName: fullName.trim(),
				email: email.trim(),
				password,
				role: "business",
				analyticsConsentGranted: true,
			});
			if (result.requiresEmailConfirmation) {
				setError(strings.auth.emailUnconfirmed);
			} else {
				router.replace("/");
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

				<Button
					label={strings.business.createBusiness}
					onPress={handleSignup}
					loading={loading}
					fullWidth
					style={{ marginTop: spacing.md }}
				/>
				<Link href="/login" style={[styles.link, { color: colors.primary }]}>
					<AppText variant="bodyMedium">{strings.auth.login}</AppText>
				</Link>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.sm },
	link: { marginTop: spacing.lg, alignSelf: "center" },
});
