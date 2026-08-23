import { router } from "expo-router";
import { useEffect } from "react";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { strings } from "@/core/i18n/strings";
import { AppText, Button, Screen, ScreenHeader, TextField } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { profileRepository } from "@/features/profile/data/repository";
import { authRepository } from "@/features/auth/data/repository";
import { toAppError } from "@/core/error/mapper";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import type { UserProfile } from "@/features/auth/domain/user";

function initialsOf(profile: UserProfile): string {
	const name = profile.fullName?.trim();
	if (!name) return "F";
	const parts = name.split(/\s+/);
	if (parts.length >= 2) {
		return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
	}
	return parts[0][0]!.toUpperCase();
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function EditProfileScreen() {
	const { colors } = useTheme();
	const { profile, status, initialized, setProfile } = useAuthStore();
	const [name, setName] = useState(profile?.fullName ?? "");
	const [email, setEmail] = useState(profile?.email ?? "");
	const [phone, setPhone] = useState(profile?.phone ?? "");
	const [city, setCity] = useState(profile?.city ?? "");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest" || !profile) return null;

	const handleSave = async () => {
		const trimmedName = name.trim();
		const trimmedEmail = email.trim();
		if (!trimmedName) {
			setError(strings.profileEdit.required);
			return;
		}
		if (!EMAIL_REGEX.test(trimmedEmail)) {
			setError(strings.profileEdit.invalidEmail);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			await profileRepository.updateProfile(profile.id, {
				full_name: trimmedName,
				email: trimmedEmail,
				phone: phone.trim() || null,
				city: city.trim() || null,
			});

			const emailChanged = trimmedEmail !== profile.email;
			if (emailChanged) {
				await authRepository.updateEmail(trimmedEmail);
			}

			const updated = await authRepository.fetchProfile(profile.id);
			if (updated) setProfile(updated);
			toast.success(
				emailChanged
					? strings.profileEdit.updatedWithEmailConfirmation
					: strings.profileEdit.updated,
			);
			router.back();
		} catch (e) {
			setError(toAppError(e, strings.common.error).message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<Screen scroll keyboardShouldPersistTaps="handled">
			<View style={styles.container}>
				<ScreenHeader title={strings.profileEdit.title} />

				<View style={styles.avatarWrap}>
					<Avatar style={{ width: 96, height: 96 }} alt={initialsOf(profile)}>
						{profile.avatarUrl ? (
							<AvatarImage source={{ uri: profile.avatarUrl }} />
						) : null}
						<AvatarFallback className="bg-secondary">
							<AppText
								style={{
									fontSize: 32,
									fontWeight: "700",
									color: colors.primary,
								}}
							>
								{initialsOf(profile)}
							</AppText>
						</AvatarFallback>
					</Avatar>
					<Button
						label={strings.profileEdit.changeAvatar}
						variant="ghost"
						size="sm"
						onPress={() => {}}
					/>
				</View>

				{error ? (
					<AppText variant="bodySmall" style={{ color: colors.destructive }}>
						{error}
					</AppText>
				) : null}

				<TextField
					label={strings.auth.fullName}
					value={name}
					onChangeText={setName}
				/>
				<TextField
					label={strings.profileEdit.email}
					value={email}
					onChangeText={setEmail}
					keyboardType="email-address"
					placeholder={strings.profileEdit.emailHint}
					autoCapitalize="none"
				/>
				<TextField
					label={strings.profileEdit.phone}
					value={phone}
					onChangeText={setPhone}
					keyboardType="phone-pad"
				/>
				<TextField
					label={strings.profileEdit.city}
					value={city}
					onChangeText={setCity}
				/>
				<Button
					label={strings.common.save}
					onPress={() => void handleSave()}
					loading={loading}
					fullWidth
					style={{ marginTop: spacing.md }}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.md },
	avatarWrap: { alignItems: "center", gap: spacing.xs },
});