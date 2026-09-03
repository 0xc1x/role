import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, Screen, ScreenHeader } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

interface HelpItem {
	readonly title: string;
	readonly description: string;
}

interface HelpSection {
	readonly title: string;
	readonly items: readonly HelpItem[];
}

interface HelpSectionData {
	readonly title: string;
	readonly sections: readonly HelpSection[];
}

const SECTION_KEYS = ["products", "payments", "guides", "security"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_DATA: Record<SectionKey, HelpSectionData> = {
	products: strings.business.businessHelpSections.products,
	payments: strings.business.businessHelpSections.payments,
	guides: strings.business.businessHelpSections.guides,
	security: strings.business.businessHelpSections.security,
};

export default function BusinessHelpSectionScreen() {
	const { colors } = useTheme();
	const { id, section } = useLocalSearchParams<{
		id: string;
		section: string;
	}>();

	const data =
		SECTION_DATA[(section as SectionKey) ?? "products"] ??
		SECTION_DATA.products;

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader
					title={data.title}
					fallback={`/business/${id}/help`}
				/>
				{data.sections.map((sectionData) => (
					<Card key={sectionData.title} style={styles.card}>
						<AppText variant="bodyMedium" weight="bold" style={styles.sectionTitle}>
							{sectionData.title}
						</AppText>
						{sectionData.items.map((item) => (
							<View key={item.title} style={[styles.item, { borderTopColor: colors.borderSolid }]}>
								<AppText variant="bodyMedium" weight="semiBold">
									{item.title}
								</AppText>
								<AppText
									variant="bodySmall"
									style={{ color: colors.mutedForeground, lineHeight: 21, marginTop: spacing.xs }}
								>
									{item.description}
								</AppText>
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
	item: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	sectionTitle: { padding: spacing.lg },
});