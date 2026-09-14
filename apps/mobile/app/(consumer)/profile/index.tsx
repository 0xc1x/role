import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useEffect } from "react";

import { strings } from "@/core/i18n/strings";
import { AppText, Screen } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { spacing } from "@/core/theme/spacing";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";
import { SettingsTab } from "@/features/profile/components/ProfileSettingsTab";

export default function ProfileScreen() {
	const { status, initialized, profile } = useAuthStore();

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	if (!initialized || status === "guest") return null;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{strings.profile.title}
				</AppText>

				{status === "authenticated" && profile ? (
					<ProfileHeader profile={profile} />
				) : null}

				<SettingsTab />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
});
