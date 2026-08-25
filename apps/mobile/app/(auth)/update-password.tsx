import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Screen, TextField } from "@/core/ui";
import { authRepository } from "@/features/auth/data/repository";
import { useAuthStore } from "@/features/auth/store";
import { toAppError } from "@/core/error/mapper";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

const MIN_PASSWORD_LENGTH = 6;

export default function UpdatePasswordScreen() {
	const { colors } = useTheme();
	const status = useAuthStore((s) => s.status);
	const initialized = useAuthStore((s) => s.initialized);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sin sesión recovery el token del email expiró o ya se consumió.
	useEffect(() => {
		if (initialized && status === "guest") {
			toast.error(strings.auth.resetLinkInvalid);
			router.replace("/(auth)/login");
		}
	}, [initialized, status]);

	const handleUpdate = async () => {
		if (loading) return;
		setError(null);
		if (password.length < MIN_PASSWORD_LENGTH) {
			setError(strings.auth.passwordMinLength);
			return;
		}
		if (password !== confirm) {
			setError(strings.auth.passwordsMismatch);
			return;
		}
		setLoading(true);
		try {
			await authRepository.updatePassword(password);
			toast.success(strings.auth.passwordUpdated);
			// La sesión recovery es de un solo uso: cerramos y pedimos login.
			await authRepository.signOut();
			router.replace("/(auth)/login");
		} catch (e) {
			setError(toAppError(e, strings.auth.updatePassword).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Screen scroll keyboardShouldPersistTaps="handled">
			<View style={styles.container}>
				<AppText variant="h1" weight="bold">
					{strings.auth.updatePassword}
				</AppText>
				<>
					{error ? (
						<AppText variant="bodySmall" style={{ color: colors.destructive }}>
							{error}
						</AppText>
					) : null}
						<TextField
							label={strings.auth.newPassword}
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
							label={strings.auth.updatePassword}
							onPress={handleUpdate}
							loading={loading}
							fullWidth
						style={{ marginTop: spacing.md }}
					/>
				</>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.sm },
});
