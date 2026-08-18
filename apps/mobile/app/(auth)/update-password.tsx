import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Screen, TextField } from "@/core/ui";
import { authRepository } from "@/features/auth/data/repository";
import { toAppError } from "@/core/error/mapper";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function UpdatePasswordScreen() {
	const { colors } = useTheme();
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	const handleUpdate = async () => {
		if (!password || password !== confirm) {
			setError("Las contraseñas no coinciden");
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await authRepository.updatePassword(password);
			setDone(true);
			setTimeout(() => router.replace("/"), 1200);
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
				{done ? (
					<AppText variant="bodyMedium" style={{ color: colors.success }}>
						{strings.auth.passwordUpdated}
					</AppText>
				) : (
					<>
						{error ? (
							<AppText
								variant="bodySmall"
								style={{ color: colors.destructive }}
							>
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
				)}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.sm },
});
