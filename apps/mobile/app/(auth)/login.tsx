import { isDeliverableAlias } from "@0xc1x/role-commons";
import { LockKeyhole, Mail, X } from "lucide-react-native";
import { type Href, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
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
import {
	cachedLoginIdentifiers,
	readLoginIdentifiers,
	rememberLoginIdentifier,
} from "@/src/features/auth/data/login-history";
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
	// Los identificadores con los que ya se entró en ESTE dispositivo (§9.1).
	// El primero pintado usa la caché en memoria: al volver al login en la
	// misma sesión, los chips ya están y la pantalla no arranca vacía.
	const [identifiers, setIdentifiers] = useState<string[]>(
		cachedLoginIdentifiers,
	);
	// Cada toque de un chip pide el foco del PIN. El contador remonta el
	// campo con `autoFocus`, porque `TextField` no reenvía refs y un
	// `autoFocus` sólo actúa al montar.
	const [pinFocusRequest, setPinFocusRequest] = useState(0);

	useEffect(() => {
		void readLoginIdentifiers().then(setIdentifiers);
	}, []);

	const validate = () => {
		const result = validateLoginForm(email, password);
		setEmailError(result.emailError);
		setPasswordError(result.passwordError);
		return result.ok;
	};

	/**
	 * Un chip pone el identificador en el campo y le pasa el foco al PIN: el
	 * alias largo es lo que se teclea, y el PIN es lo que sigue.
	 */
	const selectIdentifier = (identifier: string) => {
		setEmail(identifier);
		setEmailError(null);
		setPinFocusRequest((request) => request + 1);
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
			// El identificador se recuerda para el próximo ingreso. El PIN no:
			// `rememberLoginIdentifier` sólo guarda identificadores, y un fallo
			// de almacenamiento no puede tumbar un login que ya ocurrió.
			await rememberLoginIdentifier(email.trim());
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
				<Logo width={104} height={52} />
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

			{identifiers.length > 0 ? (
				<View style={styles.remembered}>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{strings.auth.recentIdentifiers}
					</AppText>
					<View style={styles.chips}>
						{identifiers.map((identifier) => (
							<Pressable
								key={identifier}
								onPress={() => selectIdentifier(identifier)}
								accessibilityRole="button"
								accessibilityLabel={strings.auth.useIdentifier.replace(
									"{identifier}",
									identifier,
								)}
								style={({ pressed }) => [
									styles.chip,
									{
										borderColor: colors.borderSolid,
										backgroundColor: pressed
											? colors.inputBackground
											: colors.card,
									},
								]}
							>
								<AppText
									variant="bodySmall"
									weight="semiBold"
									style={{ color: colors.primary }}
								>
									{identifier}
								</AppText>
							</Pressable>
						))}
					</View>
				</View>
			) : null}

			<TextField
				label={strings.auth.email}
				icon={Mail}
				value={email}
				onChangeText={setEmail}
				error={emailError}
				hint={strings.auth.emailHint}
				keyboardType="email-address"
				autoCapitalize="none"
				// SIN `autoComplete="email"` NI `textContentType="emailAddress"`
				// (§9.1): el sistema no debe ofrecer el correo personal de la
				// persona encima de lo que escribe —que aquí puede ser el alias
				// de un acceso de staff, no su correo—. El campo de la
				// recuperación y el del PIN sí los conservan.
				returnKeyType="next"
			/>
			<TextField
				key={`pin-${pinFocusRequest}`}
				autoFocus={pinFocusRequest > 0}
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

			<Button onPress={handleLogin} size="default" loading={loading}>
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

export function ForgotPasswordDialog({
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

	// El flujo del diálogo lo decide el identificador QUE HAY AHORA en el
	// campo, no el que traía la pantalla: el campo del diálogo es el que la
	// persona puede corregir, y con esa corrección el aviso puede aparecer o
	// desaparecer.
	const flow = recoveryFlow(email.trim());

	const send = async () => {
		const trimmed = email.trim();
		// No separate empty-string guard: "".includes("@") is already false,
		// so the empty input takes this same branch.
		if (!trimmed.includes("@")) {
			setError(strings.auth.invalidEmail);
			return;
		}
		// Sin bandeja detrás no hay correo que enviar: el aviso de arriba lo
		// dice y el botón ni siquiera existe. La guarda se queda igual porque
		// el teclado también puede disparar el envío.
		if (recoveryFlow(trimmed) === "no-mailbox") return;
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
			<View
				style={[
					styles.overlay,
					{ backgroundColor: withAlpha(colors.scrim, 0.4) },
				]}
			>
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
						{flow === "no-mailbox"
							? strings.auth.staffNoMailboxNotice
							: strings.auth.resetDescription}
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

						{flow === "no-mailbox" ? null : (
							<Button onPress={send} style={styles.dialogButton}>
								{strings.auth.sendLink}
							</Button>
						)}
					</View>
				</View>
			</View>
		</Modal>
	);
}

/**
 * El flujo del diálogo de recuperación, según el identificador que hay.
 *
 * ─── LA PREGUNTA ES DE CORREO, Y LA CONTESTA `isDeliverableAlias` ────────────
 *
 * La decisión es «¿hay una bandeja real detrás de esta dirección?», y eso es
 * lo que contesta `isDeliverableAlias`. NO es `isRoleEcAlias`, que contesta
 * otra pregunta —«¿es una cuenta de equipo de Rolé?»—: para el ápice
 * (`ana@role.ec`) las dos dan respuestas DISTINTAS a propósito, porque el
 * ápice es dominio de la plataforma pero no tiene bandeja para ese
 * identificador. Preguntar con la función equivocada deja pasar un envío que
 * el §8 bloquea, y manda un correo a un buzón que no existe (ver
 * `business-member.schema.ts`).
 *
 * ─── UN CAMPO VACÍO NO DECIDE NADA ───────────────────────────────────────────
 *
 * Mientras no se escriba un identificador, el diálogo es el de siempre: la
 * persona puede teclear el suyo y ver la decisión tomar forma con lo que
 * escribió.
 */
function recoveryFlow(identifier: string): "email" | "no-mailbox" {
	if (identifier === "") return "email";
	return isDeliverableAlias(identifier) ? "email" : "no-mailbox";
}

const styles = StyleSheet.create({
	logoWrap: { alignItems: "center", marginBottom: spacing.md },
	heading: { gap: spacing.sm, marginBottom: spacing.xl },
	center: { textAlign: "center" },
	remembered: { gap: spacing.xs, marginBottom: spacing.md },
	chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
	chip: {
		borderWidth: 1,
		borderRadius: radii.pill,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs,
	},
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
