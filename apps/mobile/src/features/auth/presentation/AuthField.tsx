import { Ionicons } from "@expo/vector-icons";
import { useState, type ComponentProps } from "react";
import {
	Pressable,
	StyleSheet,
	TextInput,
	type TextInputProps,
	View,
} from "react-native";

import { useTheme } from "@/core/theme";
import { radii, spacing } from "@/core/theme/spacing";
import { AppText } from "@/core/ui";
import { strings } from "@/core/i18n/strings";

interface AuthFieldProps {
	label: string;
	icon: ComponentProps<typeof Ionicons>["name"];
	value: string;
	onChangeText: (text: string) => void;
	error?: string | null;
	hint?: string;
	secure?: boolean;
	keyboardType?: TextInputProps["keyboardType"];
	autoCapitalize?: TextInputProps["autoCapitalize"];
	autoComplete?: TextInputProps["autoComplete"];
	returnKeyType?: TextInputProps["returnKeyType"];
	textContentType?: TextInputProps["textContentType"];
	onSubmitEditing?: () => void;
	editable?: boolean;
}

/**
 * Campo de texto para formularios de auth (portado de Fudi): label en itálica
 * negrita, icono de prefijo, borde enfocado en color primario y toggle para
 * campos seguros.
 */
export function AuthField({
	label,
	icon,
	value,
	onChangeText,
	error,
	hint,
	secure = false,
	keyboardType,
	autoCapitalize,
	autoComplete,
	returnKeyType,
	textContentType,
	onSubmitEditing,
	editable = true,
}: AuthFieldProps) {
	const { colors } = useTheme();
	const [focused, setFocused] = useState(false);
	const [obscured, setObscured] = useState(secure);

	const borderColor = error
		? colors.destructive
		: focused
			? colors.primary
			: colors.borderSolid;
	const borderWidth = focused ? 2 : 1;

	return (
		<View style={styles.container}>
			<AppText
				variant="bodySmall"
				weight="semiBold"
				style={{ color: colors.foreground, marginBottom: spacing.sm }}
			>
				{label}
			</AppText>
			<View
				style={[
					styles.inputRow,
					{
						backgroundColor: colors.inputBackground,
						borderColor,
						borderWidth,
						opacity: editable ? 1 : 0.6,
					},
				]}
			>
				<Ionicons name={icon} size={20} color={colors.mutedForeground} />
				<TextInput
					value={value}
					onChangeText={onChangeText}
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					secureTextEntry={obscured}
					keyboardType={keyboardType}
					autoCapitalize={autoCapitalize}
					autoComplete={autoComplete}
					textContentType={textContentType}
					returnKeyType={returnKeyType}
					onSubmitEditing={onSubmitEditing}
					editable={editable}
					placeholderTextColor={colors.mutedForeground}
					style={[styles.input, { color: colors.foreground }]}
				/>
				{secure ? (
					<Pressable
						onPress={() => setObscured((s) => !s)}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={
							obscured ? strings.auth.showPassword : strings.auth.hidePassword
						}
						style={styles.eyeButton}
					>
						<Ionicons
							name={obscured ? "eye" : "eye-off"}
							size={20}
							color={colors.mutedForeground}
						/>
					</Pressable>
				) : null}
			</View>
			{error ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.destructive, marginTop: spacing.xs }}
				>
					{error}
				</AppText>
			) : hint ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: spacing.xs }}
				>
					{hint}
				</AppText>
			) : null}
		</View>
	);
}

// Accesible labels for the visibility toggle (kept tiny and local).
const styles = StyleSheet.create({
	container: { marginBottom: spacing.lg },
	inputRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		borderRadius: radii.md,
		paddingHorizontal: spacing.lg,
		minHeight: 54,
	},
	input: { flex: 1, fontSize: 15, paddingVertical: 0 },
	eyeButton: {
		padding: spacing.xs,
		alignItems: "center",
		justifyContent: "center",
	},
});