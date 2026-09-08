import { useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import {
	Animated,
	ScrollView,
	StyleSheet,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ErrorState, LoadingView } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { useBusinessProfile } from "@/features/business/hooks";
import { ProfileHero } from "@/features/business/components/profile/ProfileHero";
import {
	AboutCard,
	BusinessHeader,
	StatsCard,
} from "@/features/business/components/profile/ProfileHeader";
import {
	ContactInfoCard,
	HoursCard,
} from "@/features/business/components/profile/ProfileContact";
import {
	LocationCard,
	ReviewsCard,
} from "@/features/business/components/profile/ProfileSocial";

const HERO_HEIGHT = 240;

export default function BusinessProfileScreen() {
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data: profile, isLoading, isError, error, refetch } = useBusinessProfile(businessId);

	const scrollY = useRef(new Animated.Value(0)).current;
	const headerHeight = scrollY.interpolate({
		inputRange: [0, HERO_HEIGHT],
		outputRange: [HERO_HEIGHT, 0],
		extrapolateRight: "clamp",
	});
	const headerOpacity = scrollY.interpolate({
		inputRange: [0, HERO_HEIGHT],
		outputRange: [1, 0],
		extrapolateRight: "clamp",
	});

	// Full-bleed hero: sin <Screen> para que el cover ocupe el notch.
	if (isLoading) {
		return (
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<LoadingView />
			</View>
		);
	}

	if (isError || !profile) {
		return (
			<View
				style={[
					styles.centerBox,
					{ backgroundColor: colors.background, paddingTop: insets.top },
				]}
			>
				<ErrorState error={error} onRetry={() => void refetch()} />
			</View>
		);
	}

	return (
		<View style={[styles.flex, { backgroundColor: colors.background }]}>
			<ScrollView
				style={styles.flex}
				contentContainerStyle={{ paddingBottom: 48 }}
				scrollEventThrottle={16}
				onScroll={Animated.event(
					[{ nativeEvent: { contentOffset: { y: scrollY } } }],
					{ useNativeDriver: false },
				)}
				showsVerticalScrollIndicator={false}
			>
				<View style={{ height: HERO_HEIGHT }} />

				<View style={styles.content}>
					<BusinessHeader profile={profile} />
					<View style={{ height: spacing.xl }} />

					<StatsCard profile={profile} />

					{profile.business.description?.length ? (
						<>
							<View style={{ height: spacing.lg }} />
							<AboutCard description={profile.business.description} />
						</>
					) : null}

					<View style={{ height: spacing.lg }} />
					<ContactInfoCard profile={profile} />

					{profile.hours.length > 0 ? (
						<>
							<View style={{ height: spacing.lg }} />
							<HoursCard hours={profile.hours} />
						</>
					) : null}

					<View style={{ height: spacing.lg }} />
					<ReviewsCard profile={profile} />

					<View style={{ height: spacing.lg }} />
					<LocationCard profile={profile} />
				</View>
			</ScrollView>

			<ProfileHero
				coverImage={profile.business.cover_image}
				headerHeight={headerHeight}
				headerOpacity={headerOpacity}
				topOffset={insets.top + spacing.xl}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	flex: { flex: 1 },
	centerBox: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
	},
	content: {
		paddingHorizontal: spacing.xl,
	},
});
