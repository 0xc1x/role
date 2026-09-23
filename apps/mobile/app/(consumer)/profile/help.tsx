import { useEffect, useMemo, useRef, useState } from "react";
import {
	Animated,
	Linking,
	Platform,
	Pressable,
	StyleSheet,
	View,
} from "react-native";
import { ChevronRight, CircleHelp, Leaf, Mail, MessagesSquare, Phone, ShieldCheck, ShoppingBag, type LucideIcon } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { toast } from "sonner-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, Screen, ScreenHeader, SearchBar } from "@/src/core/ui";
import { Button } from "@/components/ui/button";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { withAlpha } from "@/src/core/theme/alpha";
import { useAuthStore } from "@/src/features/auth/store";
import { useConfigValue } from "@/src/features/config";

interface Category {
	icon: LucideIcon;
	label: string;
	subtitle: string;
	bgColor: string;
	iconColor: string;
	onPress: () => void;
}

function ContactChip({
	icon: Icon,
	label,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Button
			variant="outline"
			fullWidth
			onPress={onPress}
			icon={<Icon size={24} color={colors.primary} />}
		>
			{label}
		</Button>
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
			<View style={{ flex: 1 }}>
				<ContactChip
					icon={MessagesSquare}
					label={strings.helpCenter.chat}
					onPress={onChatPress}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<ContactChip
					icon={Mail}
					label={strings.helpCenter.email}
					onPress={onEmailPress}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<ContactChip
					icon={Phone}
					label={strings.helpCenter.call}
					onPress={onCallPress}
				/>
			</View>
		</View>
	);
}

function CategoryRow({ category }: { category: Category }) {
	const { colors } = useTheme();
	const Icon = category.icon;
	return (
		<Pressable onPress={category.onPress} style={[styles.row, { borderTopColor: colors.borderSolid }]}>
			<View style={[styles.categoryIcon, { backgroundColor: category.bgColor }]}>
				<Icon size={20} color={category.iconColor} />
			</View>
			<View style={styles.rowBody}>
				<AppText variant="bodyMedium" weight="medium">
					{category.label}
				</AppText>
				<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
					{category.subtitle}
				</AppText>
			</View>
			<ChevronRight size={20} color={colors.mutedForeground} />
		</Pressable>
	);
}

function CategoriesCard({ categories }: { categories: Category[] }) {
	const { colors } = useTheme();
	return (
		<View style={[styles.card, { backgroundColor: colors.card }]}>
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
		</View>
	);
}

function FaqChevron({ expanded }: { expanded: boolean }) {
	const { colors } = useTheme();
	const rotationRef = useRef<Animated.Value | null>(null);
	if (rotationRef.current === null) {
		rotationRef.current = new Animated.Value(0);
	}
	const rotation = rotationRef.current;

	useEffect(() => {
		Animated.timing(rotation, {
			toValue: expanded ? 1 : 0,
			duration: 200,
			useNativeDriver: Platform.OS !== "web",
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
			<ChevronRight size={20} color={colors.mutedForeground} />
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
			<CircleHelp size={20} color={colors.primary} />
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
	items: Array<{ question: string; answer: string }>;
	expandedId: string | null;
	onToggle: (id: string) => void;
}) {
	const { colors } = useTheme();
	return (
		<View style={[styles.card, { backgroundColor: colors.card }]}>
			<AppText
				variant="labelSmall"
				weight="semiBold"
				style={[styles.cardTitle, { color: colors.mutedForeground }]}
			>
				{strings.helpCenter.faqTitle}
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
							key={faq.question}
							question={faq.question}
							answer={faq.answer}
							expanded={expandedId === id}
							onToggle={() => onToggle(id)}
						/>
					);
				})
			)}
		</View>
	);
}

function ContactSupportCard({ onPress }: { onPress: () => void }) {
	const { colors } = useTheme();
	return (
		<LinearGradient
			colors={[colors.primary, `${withAlpha(colors.primary, 0.8)}`]}
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
				style={{ color: `${withAlpha(colors.primaryForeground, 0.902)}`, marginTop: 2 }}
			>
				{strings.helpCenter.contactSubtitle}
			</AppText>
			<Button variant="default" onPress={onPress} fullWidth>
				{strings.helpCenter.contactCta}
			</Button>
		</LinearGradient>
	);
}

function ScheduleInfo() {
	const { colors } = useTheme();
	const weekdays = useConfigValue(
		"support.hours_weekdays",
		strings.helpCenter.scheduleWeekdays,
	);
	const weekend = useConfigValue(
		"support.hours_weekend",
		strings.helpCenter.scheduleWeekend,
	);
	return (
		<View style={styles.schedule}>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{strings.helpCenter.scheduleTitle}
			</AppText>
			<AppText variant="bodyMedium" weight="medium">
				{weekdays}
			</AppText>
			<AppText variant="bodyMedium" weight="medium">
				{weekend}
			</AppText>
		</View>
	);
}

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

export default function HelpScreen() {
	const { colors } = useTheme();
	const { status, initialized } = useAuthStore();
	const [query, setQuery] = useState("");
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const supportEmail = useConfigValue(
		"support.email",
		strings.helpCenter.supportEmail,
	);
	const supportPhone = useConfigValue(
		"support.phone",
		strings.helpCenter.supportPhone,
	);

	const categories: Category[] = [
		{
			icon: Leaf,
			label: strings.helpCenter.categoryAbout,
			subtitle: strings.helpCenter.categoryAboutSubtitle,
			bgColor: colors.surfaceSuccess,
			iconColor: colors.primary,
			onPress: () => router.push("/profile/about"),
		},
		{
			icon: ShoppingBag,
			label: strings.helpCenter.categoryOrders,
			subtitle: strings.helpCenter.categoryOrdersSubtitle,
			bgColor: colors.surfaceSuccess,
			iconColor: colors.ecoGreen,
			onPress: () => router.push("/profile/help/orders"),
		},
		// Categoría de pagos oculta hasta habilitar la pasarela de pagos
		// {
		// 	icon: "card-outline",
		// 	label: strings.helpCenter.categoryPayments,
		// 	subtitle: strings.helpCenter.categoryPaymentsSubtitle,
		// 	bgColor: colors.surfaceWarning,
		// 	iconColor: colors.warningOrange,
		// 	onPress: () => router.push("/profile/help/payments"),
		// },
		{
			icon: ShieldCheck,
			label: strings.helpCenter.categoryPolicies,
			subtitle: strings.helpCenter.categoryPoliciesSubtitle,
			bgColor: colors.infoSurface,
			iconColor: colors.info,
			onPress: () => router.push("/profile/help/policies"),
		},
	];

	const filteredFaqs = useMemo<Array<{ question: string; answer: string }>>(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [...strings.helpCenter.faqs];
		return strings.helpCenter.faqs.filter(
			(faq) =>
				faq.question.toLowerCase().includes(q) ||
				faq.answer.toLowerCase().includes(q),
		);
	}, [query]);

	const openEmail = () =>
		void launchUrl(
			`mailto:${supportEmail}?subject=${encodeURIComponent(strings.helpCenter.mailSubject)}`,
			"mailError",
		);

	const openCall = () => void launchUrl(`tel:${supportPhone}`, "callError");

	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	if (!initialized || status === "guest") return null;

	return (
		<Screen scroll>
			<View style={[styles.container, { backgroundColor: colors.background }]}>
				<ScreenHeader title={strings.helpCenter.title} fallback="/(consumer)/profile" />
				<SearchBar
					value={query}
					onChangeText={setQuery}
					placeholder={strings.helpCenter.searchHint}
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
	contactChip: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		paddingVertical: spacing.md,
		borderWidth: 1,
		borderRadius: radii.xl,
	},
	card: { 
		padding: 0, 
		overflow: "hidden", 
		borderRadius: radii.xl, 
		gap: 0,  
	},
	cardTitle: {
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.md,
		paddingBottom: spacing.sm,
	},
	faqRow: { alignItems: "flex-start" },
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
		borderRadius: radii.xl,
		alignItems: "center",
		justifyContent: "center",
	},
	supportCard: {
		borderRadius: radii.xl,
		padding: spacing.lg,
		gap: spacing.xs,
	},
	supportButton: {
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.sm,
		marginTop: spacing.sm,
	},
	schedule: { alignItems: "center", gap: 2 },
});