import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { X } from "lucide-react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { AppText } from "@/src/core/ui";
import { strings } from "@/src/core/i18n/strings";
import { toAppError } from "@/src/core/error/mapper";
import { useAuthStore } from "@/src/features/auth/store";
import { signInWithProvider } from "@/src/features/auth/data/social-oauth";

// Required for the Android return from openAuthSessionAsync. No-op elsewhere.
WebBrowser.maybeCompleteAuthSession();

type SocialProvider = "google" | "apple";

/**
 * Divider "o … con" + Google/Apple buttons over the Supabase hosted OAuth
 * flow (Flow A: one flow for PWA + native, ADR-0012).
 */
export function SocialAuthButtons({
	label,
	disabled = false,
	forceAccountPicker = false,
}: {
	label: string;
	/**
	 * Mirrors the gate signup.tsx applies to its own submit button. A social
	 * sign-in creates the account just the same, so without this the provider
	 * buttons were a way to register without accepting the terms — the one
	 * thing that form is otherwise strict about.
	 */
	disabled?: boolean;
	/**
	 * Ask the provider which account to use instead of letting it silently
	 * reuse the one already signed into the system browser. Signup wants
	 * this; login does not.
	 */
	forceAccountPicker?: boolean;
}) {
	const { colors } = useTheme();
	const [pending, setPending] = useState<SocialProvider | null>(null);
	const [error, setError] = useState<string | null>(null);
	// Synchronous guard: the state closure only refreshes on re-render, so
	// two taps in the same frame would both pass a state-only check (same
	// reason login.tsx keeps loginPending next to its loading state).
	const busyRef = useRef(false);

	const handlePress = async (provider: SocialProvider) => {
		if (busyRef.current || disabled) return;
		busyRef.current = true;
		setError(null);
		setPending(provider);
		try {
			const profile = await signInWithProvider(provider, {
				forceAccountPicker,
			});
			// Null = the user dismissed the sheet: silent no-op, same posture
			// as Apple's ERR_REQUEST_CANCELED. Never an error message.
			if (!profile) return;
			// Write the profile BEFORE navigating: role guards and the index
			// redirect read the store, which otherwise updates only via the
			// async onAuthStateChange listener (race → wrong home).
			useAuthStore.getState().setProfile(profile);
			if (profile.role === "business" || profile.role === "admin") {
				// cast: la ruta business no está publicada en los tipos generados aún
				router.replace("/(business)/products" as Href);
			} else {
				router.replace("/(consumer)");
			}
		} catch (e) {
			setError(toAppError(e, strings.auth.socialLoginFailed).message);
		} finally {
			busyRef.current = false;
			setPending(null);
		}
	};

	return (
		<>
			<View style={styles.dividerRow}>
				<View
					style={[styles.dividerLine, { backgroundColor: colors.borderSolid }]}
				/>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{label}
				</AppText>
				<View
					style={[styles.dividerLine, { backgroundColor: colors.borderSolid }]}
				/>
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

			<View style={styles.providers}>
				<SocialProviderButton
					provider="google"
					icon={
						<Ionicons name="logo-google" size={20} color={colors.foreground} />
					}
					label={strings.auth.google}
					pending={pending}
					disabled={disabled}
					onPress={handlePress}
				/>
				<SocialProviderButton
					provider="apple"
					icon={
						<Ionicons name="logo-apple" size={20} color={colors.foreground} />
					}
					label={strings.auth.apple}
					pending={pending}
					disabled={disabled}
					onPress={handlePress}
				/>
			</View>
		</>
	);
}

function SocialProviderButton({
	provider,
	icon,
	label,
	pending,
	disabled,
	onPress,
}: {
	provider: SocialProvider;
	icon: React.ReactNode;
	label: string;
	pending: SocialProvider | null;
	disabled: boolean;
	onPress: (provider: SocialProvider) => void;
}) {
	return (
		<Button
			variant="outline"
			disabled={disabled || pending !== null}
			loading={pending === provider}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={{ flex: 1 }}
			icon={icon}
			onPress={() => onPress(provider)}
		>
			{label}
		</Button>
	);
}

const styles = StyleSheet.create({
	dividerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
		marginVertical: spacing.xl,
	},
	dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
	errorBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		marginBottom: spacing.md,
	},
	errorText: { flex: 1 },
	providers: {
		flexDirection: "row",
		gap: spacing.md,
	},
});
