import { Ionicons } from "@expo/vector-icons";
import { Link, useLocalSearchParams, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, Screen, ScreenHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

type SectionKey = "orders" | "payments" | "policies";

interface HelpItemData {
	title: string;
	description: string;
	href?: Href;
}

interface HelpSectionData {
	title: string;
	items: readonly HelpItemData[];
}

interface CategoryContent {
	title: string;
	sections: readonly HelpSectionData[];
}

const CONTENT: Record<SectionKey, CategoryContent> = {
	orders: {
		title: strings.helpCenter.detailOrdersTitle,
		sections: strings.helpCenter.detailOrdersSections,
	},
	payments: {
		title: strings.helpCenter.detailPaymentsTitle,
		sections: strings.helpCenter.detailPaymentsSections,
	},
	policies: {
		title: strings.helpCenter.detailPoliciesTitle,
		sections: strings.helpCenter.detailPoliciesSections,
	},
};

function resolveContent(section: string): CategoryContent {
	if (section === "payments") return CONTENT.payments;
	if (section === "policies") return CONTENT.policies;
	return CONTENT.orders;
}

export default function HelpCategoryScreen() {
	const { colors } = useTheme();
	const { section } = useLocalSearchParams<{ section: string }>();
	const content = resolveContent(section ?? "orders");

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={content.title} />
				{content.sections.map((sectionData) => (
					<Card key={sectionData.title} style={styles.card}>
						<AppText variant="bodyMedium" weight="bold" style={styles.sectionTitle}>
							{sectionData.title}
						</AppText>
						{sectionData.items.map((item) => (
							<View key={item.title}>
								{item.href ? (
									<Link href={item.href} asChild>
										<Pressable
											style={StyleSheet.flatten([
												styles.item,
												styles.itemLink,
												{ borderTopColor: colors.borderSolid },
											])}
										>
											<View style={styles.itemBody}>
												<AppText variant="bodyMedium" weight="semiBold">
													{item.title}
												</AppText>
												<AppText
													variant="bodySmall"
													style={{ color: colors.mutedForeground, lineHeight: 21 }}
												>
													{item.description}
												</AppText>
											</View>
											<Ionicons
												name="chevron-forward"
												size={18}
												color={colors.mutedForeground}
											/>
										</Pressable>
									</Link>
								) : (
									<View
										style={[
											styles.item,
											{ borderTopColor: colors.borderSolid },
										]}
									>
										<AppText variant="bodyMedium" weight="semiBold">
											{item.title}
										</AppText>
										<AppText
											variant="bodySmall"
											style={{ color: colors.mutedForeground, lineHeight: 21 }}
										>
											{item.description}
										</AppText>
									</View>
								)}
							</View>
						))}
					</Card>
				))}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	card: { padding: 0, overflow: "hidden" },
	sectionTitle: { padding: spacing.lg },
	item: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	itemLink: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	itemBody: { flex: 1 },
});