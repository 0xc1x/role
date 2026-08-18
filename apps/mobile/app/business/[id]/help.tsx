import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Linking, Pressable, StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, Screen, ScreenHeader, SearchBar } from "@/core/ui";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface Category {
	icon: IoniconName;
	label: string;
	subtitle: string;
	bgColor: string;
	iconColor: string;
	onPress: () => void;
}

interface Faq {
	question: string;
	answer: string;
}

function ContactChip({
	icon,
	label,
	onPress,
}: {
	icon: IoniconName;
	label: string;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.contactChip,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<Ionicons name={icon} size={24} color={colors.primary} />
			<AppText variant="bodyMedium" weight="medium">
				{label}
			</AppText>
		</Pressable>
	);
}

function QuickContact({
	onChatPress,
	onEmailPress,
	onCallPress,
}: {
	onChatPress: () => void;
	onEmailPress: () => void;
	onCallPress: () => void;
}) {
	return (
		<View style={styles.quickContact}>
			<View style={styles.quickContactItem}>
				<ContactChip
					icon="chatbubble-ellipses-outline"
					label={strings.helpCenter.chat}
					onPress={onChatPress}
				/>
			</View>
			<View style={styles.quickContactItem}>
				<ContactChip
					icon="mail-outline"
					label={strings.helpCenter.email}
					onPress={onEmailPress}
				/>
			</View>
			<View style={styles.quickContactItem}>
				<ContactChip
					icon="call-outline"
					label={strings.helpCenter.call}
					onPress={onCallPress}
				/>
			</View>
		</View>
	);
}

function CategoryRow({ category }: { category: Category }) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={category.onPress}
			style={[styles.row, { borderTopColor: colors.borderSolid }]}
		>
			<View style={[styles.categoryIcon, { backgroundColor: category.bgColor }]}>
				<Ionicons name={category.icon} size={20} color={category.iconColor} />
			</View>
			<View style={styles.rowBody}>
				<AppText variant="bodyMedium" weight="medium">
					{category.label}
				</AppText>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{category.subtitle}
				</AppText>
			</View>
			<Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
		</Pressable>
	);
}

function CategoriesCard({ categories }: { categories: Category[] }) {
	const { colors } = useTheme();
	return (
		<Card style={styles.card}>
			<AppText
				variant="labelSmall"
				weight="semiBold"
				style={[styles.cardTitle, { color: colors.mutedForeground }]}
			>
				{strings.helpCenter.categoriesTitle}
			</AppText>
			{categories.map((category) => (
				<CategoryRow key={category.label} category={category} />
			))}
		</Card>
	);
}

function FaqChevron({ expanded }: { expanded: boolean }) {
	const { colors } = useTheme();
	const rotation = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		Animated.timing(rotation, {
			toValue: expanded ? 1 : 0,
			duration: 200,
			useNativeDriver: true,
		}).start();
	}, [expanded, rotation]);

	return (
		<Animated.View
			style={{
				transform: [
					{
						rotate: rotation.interpolate({
							inputRange: [0, 1],
							outputRange: ["0deg", "90deg"],
						}),
					},
				],
			}}
		>
			<Ionicons
				name="chevron-forward"
				size={20}
				color={colors.mutedForeground}
			/>
		</Animated.View>
	);
}

function FaqRow({
	question,
	answer,
	expanded,
	onToggle,
}: {
	question: string;
	answer: string;
	expanded: boolean;
	onToggle: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onToggle}
			style={[
				styles.row,
				styles.faqRow,
				{ borderTopColor: colors.borderSolid },
			]}
		>
			<Ionicons name="help-circle-outline" size={20} color={colors.primary} />
			<View style={styles.rowBody}>
				<AppText variant="bodyMedium" weight="medium">
					{question}
				</AppText>
				{expanded ? (
					<AppText
						variant="bodySmall"
						style={{
							color: colors.mutedForeground,
							lineHeight: 21,
							marginTop: spacing.xs,
						}}
					>
						{answer}
					</AppText>
				) : null}
			</View>
			<FaqChevron expanded={expanded} />
		</Pressable>
	);
}

function FaqCard({
	items,
	expandedId,
	onToggle,
}: {
	items: Faq[];
	expandedId: string | null;
	onToggle: (id: string) => void;
}) {
	const { colors } = useTheme();
	return (
		<Card style={styles.card}>
			<AppText
				variant="labelSmall"
				weight="semiBold"
				style={[styles.cardTitle, { color: colors.mutedForeground }]}
			>
				{strings.business.helpFaqTitle}
			</AppText>
			{items.length === 0 ? (
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, padding: spacing.lg }}
				>
					{strings.helpCenter.faqNoResults}
				</AppText>
			) : (
				items.map((faq, index) => {
					const id = String(index);
					return (
						<FaqRow
							key={id}
							question={faq.question}
							answer={faq.answer}
							expanded={expandedId === id}
							onToggle={() => onToggle(id)}
						/>
					);
				})
			)}
		</Card>
	);
}

function ContactSupportCard({ onPress }: { onPress: () => void }) {
	const { colors } = useTheme();
	return (
		<LinearGradient
			colors={[colors.primary, `${colors.primary}CC`]}
			start={{ x: 0, y: 0 }}
			end={{ x: 1, y: 1 }}
			style={styles.supportCard}
		>
			<AppText
				variant="labelSmall"
				weight="semiBold"
				style={{ color: colors.primaryForeground }}
			>
				{strings.helpCenter.contactTitle}
			</AppText>
			<AppText
				variant="bodySmall"
				style={{ color: `${colors.primaryForeground}E6`, marginTop: 2 }}
			>
				{strings.helpCenter.contactSubtitle}
			</AppText>
			<Pressable
				onPress={onPress}
				style={[
					styles.supportButton,
					{ backgroundColor: colors.primaryForeground },
				]}
			>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={{ color: colors.primary }}
				>
					{strings.helpCenter.contactCta}
				</AppText>
			</Pressable>
		</LinearGradient>
	);
}

function ScheduleInfo() {
	const { colors } = useTheme();
	return (
		<View style={styles.schedule}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{strings.helpCenter.scheduleTitle}
			</AppText>
			<AppText variant="bodyMedium" weight="medium">
				{strings.helpCenter.scheduleWeekdays}
			</AppText>
			<AppText variant="bodyMedium" weight="medium">
				{strings.helpCenter.scheduleWeekend}
			</AppText>
		</View>
	);
}

export default function BusinessHelpScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const [query, setQuery] = useState("");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const categories: Category[] = [
		{
			icon: "cube-outline",
			label: strings.business.businessHelpProducts,
			subtitle: strings.business.businessHelpProductsSub,
			bgColor: colors.surfaceSuccess,
			iconColor: colors.primary,
			onPress: () => router.push(`/business/${id}/help/products`),
		},
		{
			icon: "cash-outline",
			label: strings.business.businessHelpPayments,
			subtitle: strings.business.businessHelpPaymentsSub,
			bgColor: colors.surfaceSuccess,
			iconColor: colors.ecoGreen,
			onPress: () => router.push(`/business/${id}/help/payments`),
		},
		{
			icon: "book-outline",
			label: strings.business.businessHelpGuides,
			subtitle: strings.business.businessHelpGuidesSub,
			bgColor: colors.surfaceWarning,
			iconColor: colors.warningOrange,
			onPress: () => router.push(`/business/${id}/help/guides`),
		},
		{
			icon: "shield-checkmark-outline",
			label: strings.business.businessHelpSecurity,
			subtitle: strings.business.businessHelpSecuritySub,
			bgColor: colors.infoSurface,
			iconColor: colors.info,
			onPress: () => router.push(`/business/${id}/help/security`),
		},
	];

	const filteredFaqs = useMemo<Faq[]>(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [...strings.business.businessHelpFaqs];
		return strings.business.businessHelpFaqs.filter(
			(faq) =>
				faq.question.toLowerCase().includes(q) ||
				faq.answer.toLowerCase().includes(q),
		);
	}, [query]);

	async function launchUrl(url: string, errorKey: "mailError" | "callError") {
		try {
			const canOpen = await Linking.canOpenURL(url);
			if (!canOpen) {
				toast.error(strings.helpCenter[errorKey]);
				return;
			}
			await Linking.openURL(url);
		} catch {
			toast.error(strings.helpCenter[errorKey]);
		}
	}

	const openEmail = () =>
		void launchUrl(
			`mailto:${strings.helpCenter.supportEmail}?subject=${encodeURIComponent(strings.business.helpMailSubject)}`,
			"mailError",
		);

	const openCall = () =>
		void launchUrl(`tel:${strings.helpCenter.supportPhone}`, "callError");

	return (
		<Screen scroll>
			<View style={[styles.container, { backgroundColor: colors.background }]}>
				<ScreenHeader title={strings.business.helpCenter} />
				<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
					{strings.business.helpSubtitle}
				</AppText>
				<SearchBar
					value={query}
					onChangeText={setQuery}
					placeholder={strings.business.businessHelpSearch}
				/>
				<QuickContact
					onChatPress={() => toast(strings.helpCenter.comingSoon)}
					onEmailPress={openEmail}
					onCallPress={openCall}
				/>
				<CategoriesCard categories={categories} />
				<FaqCard
					items={filteredFaqs}
					expandedId={expandedId}
					onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
				/>
				<ContactSupportCard onPress={openEmail} />
				<ScheduleInfo />
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	quickContact: { flexDirection: "row", gap: spacing.md },
	quickContactItem: { flex: 1 },
	contactChip: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingVertical: spacing.md,
		borderWidth: 1,
		borderRadius: 24,
	},
	card: { padding: 0, overflow: "hidden" },
	cardTitle: { padding: spacing.lg },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderTopWidth: StyleSheet.hairlineWidth,
	},
	rowBody: { flex: 1 },
	categoryIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	faqRow: { alignItems: "flex-start" },
	supportCard: {
		borderRadius: 24,
		padding: spacing.lg,
		gap: spacing.xs,
	},
	supportButton: {
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.sm,
		marginTop: spacing.sm,
	},
	schedule: { alignItems: "center", gap: 2 },
});