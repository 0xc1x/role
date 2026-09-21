import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, Screen, TextField } from "@/src/core/ui";
import { authRepository } from "@/src/features/auth/data/repository";
import { useAuthStore } from "@/src/features/auth/store";
import { performSignOut } from "@/src/features/auth/sign-out";
import { toAppError } from "@/src/core/error/mapper";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

const MIN_PASSWORD_LENGTH = 6;

export default function UpdatePasswordScreen() {
	const { colors } = useTheme();
	const initialized = useAuthStore((s) => s.initialized);
	const pendingPasswordRecovery = useAuthStore((s) => s.pendingPasswordRecovery);
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Solo una sesión recovery válida puede fijar contraseña: sin el flag el
	// token del email expiró, ya se consumió o se abrió la ruta directo.
	useEffect(() => {
		if (initialized && !pendingPasswordRecovery) {
			toast.error(strings.auth.resetLinkInvalid);
			router.replace("/(auth)/login");
		}
	}, [initialized, pendingPasswordRecovery]);

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
			await performSignOut();
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
							onPress={handleUpdate}
							loading={loading}
							fullWidth
							style={{ marginTop: spacing.md }}
						>
							{strings.auth.updatePassword}
						</Button>
				</>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.sm },
});
