import { Link, type Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import {
	Bell,
	Bug,
	ChevronRight,
	CircleHelp,
	Heart,
	MapPin,
	Megaphone,
	Settings,
	Star,
	User,
	type LucideIcon,
} from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";
import { SignOutSection } from "@/src/features/auth/presentation/SignOutSection";

interface SettingsItem {
	icon: LucideIcon;
	label: string;
	href: Href;
}

interface SettingsGroup {
	title: string;
	items: SettingsItem[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
	{
		title: strings.profile.sectionAccount,
		items: [
			{ icon: User, label: strings.profile.editProfile, href: "/profile/edit" },
			// { icon: "card-outline", label: strings.profile.paymentMethods, href: "/profile/payment-methods" }, // Oculto hasta habilitar la pasarela de pagos
			{
				icon: MapPin,
				label: strings.profile.savedAddresses,
				href: "/profile/addresses",
			},
		],
	},
	{
		title: strings.profile.sectionPreferences,
		items: [
			{
				icon: Bell,
				label: strings.profile.notifications,
				href: "/profile/notifications",
			},
			{
				icon: Heart,
				label: strings.favorites.title,
				href: "/profile/favorites",
			},
			{ icon: Star, label: strings.orders.myReviews, href: "/profile/reviews" },
			{
				icon: Settings,
				label: strings.profile.settings,
				href: "/profile/settings",
			},
		],
	},
	{
		title: strings.profile.sectionHelp,
		items: [
			{ icon: CircleHelp, label: strings.profile.help, href: "/profile/help" },
			// Los avisos del operador, en el mismo grupo que el buzón de reportes y
			// por la misma razón: los dos son mensajes que llegan de la plataforma, no
			// ajustes que haga la persona, así que ninguno de los dos es una
			// preferencia. La lista vive en una ruta de raíz —y no acá adentro— porque
			// el dueño de un negocio también la necesita y el guard de rol de este
			// grupo la expulsaría.
			{
				icon: Megaphone,
				label: strings.announcements.listTitle,
				href: "/announcements",
			},
			// El buzón de reportes es de las dos audiencias, pero se ofrece
			// desde acá porque el consumidor no tiene panel de negocio donde
			// hacerlo. Va en el grupo de Ayuda y no en el de preferencias:
			// reportar un problema no es una preferencia del usuario.
			{
				icon: Bug,
				label: strings.bugReport.title,
				href: "/report-problem",
			},
		],
	},
];

function IconRow({
	icon: Icon,
	label,
	href,
	isLast,
}: SettingsItem & { isLast: boolean }) {
	const { colors } = useTheme();
	return (
		<Link href={href} asChild>
			<Pressable accessibilityRole="button">
				<View
					style={[
						styles.iconRow,
						{ borderBottomColor: isLast ? "transparent" : colors.borderSolid },
					]}
				>
					<Icon size={18} color={colors.mutedForeground} />
					<AppText variant="bodyMedium" style={{ flex: 1 }}>
						{label}
					</AppText>
					<ChevronRight size={16} color={colors.mutedForeground} />
				</View>
			</Pressable>
		</Link>
	);
}

export function SettingsTab() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.card,
				{ gap: spacing.lg, backgroundColor: colors.background },
			]}
		>
			{SETTINGS_GROUPS.map((group) => (
				<View
					key={group.title}
					style={{ gap: spacing.sm, paddingBottom: spacing.xl }}
				>
					<AppText
						variant="labelSmall"
						weight="bold"
						style={{ color: colors.mutedForeground }}
					>
						{group.title}
					</AppText>
					<View style={[styles.menuCard, { backgroundColor: colors.card }]}>
						{group.items.map((item, index) => (
							<IconRow
								key={item.label}
								icon={item.icon}
								label={item.label}
								href={item.href}
								isLast={index === group.items.length - 1}
							/>
						))}
					</View>
				</View>
			))}
			<SignOutSection style={{ gap: spacing.md }} />
		</View>
	);
}

const styles = StyleSheet.create({
	menuCard: { padding: 0, overflow: "hidden", borderRadius: radii.lg },
	iconRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderWidth: 1,
		borderColor: "transparent",
	},
	card: {
		paddingTop: spacing.md,
		overflow: "hidden",
		borderRadius: radii.xl,
		gap: 0,
	},
});
