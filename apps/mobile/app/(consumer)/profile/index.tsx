import { router } from "expo-router";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";

import { strings } from "@/core/i18n/strings";
import { AppText, Screen, useWebPullToRefresh } from "@/core/ui";
import { useAuthStore } from "@/features/auth/store";
import { useOrders } from "@/features/hooks";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { ProfileHeader } from "@/features/profile/components/ProfileHeader";
import { ProfileTabs, type ProfileTab } from "@/features/profile/components/ProfileTabs";
import { HistoryTab } from "@/features/profile/components/ProfileHistoryTab";
import { SettingsTab } from "@/features/profile/components/ProfileSettingsTab";

export default function ProfileScreen() {
	const { status, initialized, profile } = useAuthStore();
	const [activeTab, setActiveTab] = useState<ProfileTab>("history");
	const { colors } = useTheme();
	const { refetch, isFetching } = useOrders();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized, router]);

	if (!initialized || status === "guest") return null;

	return (
		<Screen
			scroll
			scrollRef={activeTab === "history" ? pull.ref : undefined}
			refreshControl={
				activeTab === "history" ? (
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				) : undefined
			}
		>
			{activeTab === "history" ? pull.indicator : null}
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{strings.profile.title}
				</AppText>

				{status === "authenticated" && profile ? (
					<ProfileHeader profile={profile} />
				) : null}

				<ProfileTabs active={activeTab} onChange={setActiveTab} />

				{activeTab === "history" ? <HistoryTab /> : <SettingsTab />}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
});
