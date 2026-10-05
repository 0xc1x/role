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
import { useReportProblemSheet } from "@/src/features/bug-report/use-report-problem-sheet";

/**
 * Una fila del menú: o navega, o abre algo en esta misma pantalla.
 *
 * Es una unión y no dos campos opcionales porque las dos ramas se ven distinto:
 * la que navega tiene que seguir siendo un `Link`, y no un `Pressable` con un
 * `router.push` adentro, para que el abrir-en-pestaña del navegador y el
 * "abrir en…" del sistema sigan siendo los de un enlace. La que abre la hoja no
 * navega a ninguna parte, y un `Link` alrededor sería un enlace que no lleva a
 * ningún lado.
 */
type SettingsItem =
	| { icon: LucideIcon; label: string; href: Href }
	| { icon: LucideIcon; label: string; onPress: () => void };

interface SettingsGroup {
	title: string;
	items: SettingsItem[];
}

/**
 * Los grupos del menú.
 *
 * Es una función y no una constante porque una fila —el buzón— abre la hoja en
 * esta pantalla en vez de navegar, y su gesto solo existe dentro del
 * componente. Todo lo demás sigue siendo dato estático de módulo.
 */
function settingsGroups(openReportProblem: () => void): SettingsGroup[] {
	return [
		{
			title: strings.profile.sectionAccount,
			items: [
				{
					icon: User,
					label: strings.profile.editProfile,
					href: "/profile/edit",
				},
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
				{
					icon: Star,
					label: strings.orders.myReviews,
					href: "/profile/reviews",
				},
				{
					icon: Settings,
					label: strings.profile.settings,
					href: "/profile/settings",
				},
			],
		},
		{
			title: strings.profile.sectionSupport,
			items: [
				{
					icon: CircleHelp,
					label: strings.profile.help,
					href: "/profile/help",
				},
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
				//
				// Abre la hoja EN ESTA PANTALLA y no navega: el `Drawer` se
				// portaliza a un host que vive adentro del layout de tabs, así que
				// tiene que montarla la pantalla que la ofrece. Antes esta fila
				// emparejaba a `/report-problem`, y esa ruta de raíz no tiene
				// host por encima: la hoja se portalizaba a la pantalla de tabs
				// que ya estaba tapada y el usuario veía una página vacía con el
				// título del buzón.
				{
					icon: Bug,
					label: strings.bugReport.title,
					onPress: openReportProblem,
				},
			],
		},
	];
}

function IconRow({ item, isLast }: { item: SettingsItem; isLast: boolean }) {
	const { colors } = useTheme();
	const Icon = item.icon;
	const row = (
		<Pressable
			accessibilityRole="button"
			onPress={"onPress" in item ? item.onPress : undefined}
		>
			<View
				style={[
					styles.iconRow,
					{ borderBottomColor: isLast ? "transparent" : colors.borderSolid },
				]}
			>
				<Icon size={18} color={colors.mutedForeground} />
				<AppText variant="bodyMedium" style={{ flex: 1 }}>
					{item.label}
				</AppText>
				<ChevronRight size={16} color={colors.mutedForeground} />
			</View>
		</Pressable>
	);
	// Solo la fila que navega va envuelta en un `Link`: es lo que le da el abrir
	// en pestaña nueva y el "abrir en…" del sistema. La que abre la hoja se
	// queda en el `Pressable`, porque un enlace que no lleva a ninguna parte es
	// peor que un botón.
	return "href" in item ? (
		<Link href={item.href} asChild>
			{row}
		</Link>
	) : (
		row
	);
}

export function SettingsTab() {
	const { colors } = useTheme();
	const { openReportProblem, reportProblemSheet } = useReportProblemSheet();
	return (
		<View
			style={[
				styles.card,
				{ gap: spacing.lg, backgroundColor: colors.background },
			]}
		>
			{settingsGroups(openReportProblem).map((group) => (
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
								item={item}
								isLast={index === group.items.length - 1}
							/>
						))}
					</View>
				</View>
			))}
			<SignOutSection style={{ gap: spacing.md }} />
			{/* La hoja va en el árbol de ESTA pantalla, que es la que tiene el host
			    del portal montado y visible. Montada en una ruta de raíz no
	            aparecería nunca. */}
			{reportProblemSheet}
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
