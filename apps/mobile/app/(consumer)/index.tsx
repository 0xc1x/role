import { useCallback, useRef, useState } from "react";
import { View, StyleSheet, RefreshControl, ScrollView, Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import { Logo } from "@/core/ui/Logo";
import { spacing } from "@/core/theme/spacing";
import { queryClient } from "@/core/query/client";
import { LocationSelector } from "@/features/home/components/LocationSelector";
import { WelcomeBanner } from "@/features/home/components/WelcomeBanner";
import { CategoryChips } from "@/features/home/components/CategoryChips";
import { PromoSlider } from "@/features/home/components/PromoSlider";
import { EcoBanner } from "@/features/home/components/EcoBanner";
import {
	OfferRowSection,
	OfferColumnSection,
} from "@/features/home/components/OfferRowSection";
import { BusinessRowSection } from "@/features/home/components/BusinessRowSection";

const isWeb = Platform.OS === "web";

export default function ConsumerHomeScreen() {
	const [refreshing, setRefreshing] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
	const scrollRef = useRef<ScrollView>(null);
	const { colors } = useTheme();

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await queryClient.invalidateQueries({ queryKey: ["offers"] });
		await queryClient.invalidateQueries({ queryKey: ["businesses"] });
		await queryClient.invalidateQueries({ queryKey: ["categories"] });
		setRefreshing(false);
	}, []);

	const openAllOffers = useCallback(
		() =>
			router.push(
				selectedCategory
					? { pathname: "/all-offers", params: { category: selectedCategory } }
					: "/all-offers",
			),
		[selectedCategory],
	);

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<View style={[styles.topBar, { borderBottomColor: colors.background }]}>
				<LocationSelector />
				<Logo width={100} height={60} color={colors.primary} />
			</View>
			<ScrollView
				ref={scrollRef}
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						colors={[colors.primary]}
						progressViewOffset={isWeb ? 0 : undefined}
					/>
				}
				style={{ flex: 1 }}
				contentContainerStyle={styles.contentContainer}
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
			>
				<WelcomeBanner />
				<CategoryChips
					selectedCategory={selectedCategory}
					onCategorySelect={setSelectedCategory}
				/>
				<PromoSlider />
				<OfferRowSection
					type="expiring"
					title={strings.home.ultimasHoras}
					icon={<Ionicons name="time-outline" size={18} color={colors.primary} />}
					limit={10}
					onSeeAll={openAllOffers}
				/>
				<OfferRowSection
					type="recent"
					title={strings.home.recienAgregados}
					icon={<Ionicons name="trending-up" size={18} color={colors.primary} />}
					limit={10}
					onSeeAll={openAllOffers}
				/>
				<OfferRowSection
					type="popular"
					title={strings.home.ofertasPopulares}
					icon={<Ionicons name="flame-outline" size={18} color={colors.primary} />}
					limit={10}
					category={selectedCategory}
					onSeeAll={openAllOffers}
				/>
				<EcoBanner />
				<BusinessRowSection
					limit={10}
					onSeeAll={() => router.push("/all-businesses")}
				/>
				<OfferColumnSection
					title={strings.home.cercaDeTi}
					limit={10}
					category={selectedCategory}
					onSeeAll={openAllOffers}
				/>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		minHeight: 56,
		paddingHorizontal: spacing.lg,
		borderBottomWidth: StyleSheet.hairlineWidth,
		zIndex: 100,
	},
	contentContainer: {
		flexGrow: 1,
		paddingBottom: spacing.xxxl,
	},
});
