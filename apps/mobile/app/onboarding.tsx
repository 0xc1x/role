import { useCallback, useRef, useState } from "react";
import {
	ScrollView,
	StyleSheet,
	View,
	useWindowDimensions,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
} from "react-native";
import { router } from "expo-router";
import {
	Calendar,
	CreditCard,
	Leaf,
	MapPin,
	Package,
	QrCode,
	Receipt,
	Store,
	TrendingUp,
	Wallet,
	type LucideIcon,
} from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
import { AppText, Logo, Screen, type ColorTokens } from "@/src/core/ui";
import { radii, spacing } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuthStore } from "@/src/features/auth/store";
import {
	BUSINESS_ONBOARDING_STEPS,
	CONSUMER_ONBOARDING_STEPS,
	onboardingAudience,
	useMarkOnboardingSeen,
	type OnboardingStep,
} from "@/src/features/onboarding";

/** Paso 2 consumer: el ciclo Reserva → Paga → Recoge con QR en 3 iconos. */
const CYCLE: ReadonlyArray<{ id: string; icon: LucideIcon; label: string }> = [
	{ id: "reserve", icon: Calendar, label: strings.onboarding.cycleReserve },
	{ id: "pay", icon: CreditCard, label: strings.onboarding.cyclePay },
	{ id: "pickup", icon: QrCode, label: strings.onboarding.cyclePickup },
];

/** Paso 2 business: Publica → Recibe pedidos → Entrega con QR. */
const BUSINESS_CYCLE: ReadonlyArray<{
	id: string;
	icon: LucideIcon;
	label: string;
}> = [
	{
		id: "publish",
		icon: Package,
		label: strings.onboarding.business.cyclePublish,
	},
	{
		id: "receive",
		icon: Receipt,
		label: strings.onboarding.business.cycleReceive,
	},
	{
		id: "deliver",
		icon: QrCode,
		label: strings.onboarding.business.cyclePickup,
	},
];

/** Paso 3 business: las tres pestañas del panel con su descripción. */
const PANEL_TABS: ReadonlyArray<{
	id: string;
	icon: LucideIcon;
	title: string;
	description: string;
}> = [
	{
		id: "products",
		icon: Package,
		title: strings.business.products,
		description: strings.business.productsDesc,
	},
	{
		id: "orders",
		icon: Receipt,
		title: strings.business.orders,
		description: strings.business.ordersDesc,
	},
	{
		id: "management",
		icon: Store,
		title: strings.business.title,
		description: strings.business.managementSubtitle,
	},
];

function StepContent({
	step,
	colors,
	business,
}: {
	step: OnboardingStep;
	colors: ColorTokens;
	business: boolean;
}) {
	switch (step.id) {
		// Propuesta de valor: consumer reutiliza strings.landing.*;
		// business habla de excedente → ingresos en vez de tirarlo.
		case "value":
			if (business) {
				return (
					<>
						<View style={styles.iconRow}>
							<View
								style={[
									styles.iconCircle,
									{ backgroundColor: withAlpha(colors.secondary, 0.15) },
								]}
							>
								<Store size={26} color={colors.primary} />
							</View>
							<View
								style={[
									styles.iconCircle,
									{ backgroundColor: withAlpha(colors.secondary, 0.15) },
								]}
							>
								<TrendingUp size={26} color={colors.primary} />
							</View>
						</View>
						<AppText variant="h1" weight="bold" style={styles.stepTitle}>
							{strings.onboarding.business.valueTitle}
						</AppText>
						<AppText
							variant="bodyLarge"
							style={[styles.stepBody, { color: colors.mutedForeground }]}
						>
							{strings.onboarding.business.valueBody}
						</AppText>
						<AppText
							variant="labelSmall"
							weight="semiBold"
							style={{ color: colors.primary }}
						>
							{strings.onboarding.business.valueLabel}
						</AppText>
					</>
				);
			}
			return (
				<>
					<View style={styles.iconRow}>
						<View
							style={[
								styles.iconCircle,
								{ backgroundColor: withAlpha(colors.secondary, 0.15) },
							]}
						>
							<Wallet size={26} color={colors.primary} />
						</View>
						<View
							style={[
								styles.iconCircle,
								{ backgroundColor: withAlpha(colors.secondary, 0.15) },
							]}
						>
							<Leaf size={26} color={colors.primary} />
						</View>
					</View>
					<AppText variant="h1" weight="bold" style={styles.stepTitle}>
						{strings.app.tagline}
					</AppText>
					<AppText
						variant="bodyLarge"
						style={[styles.stepBody, { color: colors.mutedForeground }]}
					>
						{strings.landing.featureSaveBody}
					</AppText>
					<AppText
						variant="labelSmall"
						weight="semiBold"
						style={{ color: colors.primary }}
					>
						{strings.landing.featureReduce}
					</AppText>
				</>
			);
		// El ciclo en 3 iconos; consumer explica el código de recogida
		// (la pieza no obvia), business espeja el flujo del vendedor.
		case "cycle": {
			const cycle = business ? BUSINESS_CYCLE : CYCLE;
			const body = business
				? strings.onboarding.business.cycleBody
				: strings.onboarding.cycleBody;
			return (
				<>
					<AppText variant="h1" weight="bold" style={styles.stepTitle}>
						{strings.landing.howItWorks}
					</AppText>
					<View style={styles.cycleRow}>
						{cycle.map(({ id, icon: Icon, label }) => (
							<Card key={id} style={styles.cycleCard}>
								<View
									style={[
										styles.iconCircleSm,
										{ backgroundColor: withAlpha(colors.secondary, 0.15) },
									]}
								>
									<Icon size={22} color={colors.primary} />
								</View>
								<AppText
									variant="labelSmall"
									weight="semiBold"
									style={styles.cycleLabel}
								>
									{label}
								</AppText>
							</Card>
						))}
					</View>
					<AppText
						variant="bodyMedium"
						style={[styles.stepBody, { color: colors.mutedForeground }]}
					>
						{body}
					</AppText>
				</>
			);
		}
		// Entrada consumer: copy de entrar a la app, sin prometer request de
		// permiso (en PWA no aplica y LocationSelector ya lo gestiona).
		case "entry":
			return (
				<>
					<View
						style={[
							styles.iconCircle,
							{ backgroundColor: withAlpha(colors.secondary, 0.15) },
						]}
					>
						<MapPin size={26} color={colors.primary} />
					</View>
					<AppText variant="h1" weight="bold" style={styles.stepTitle}>
						{strings.onboarding.entryTitle}
					</AppText>
					<AppText
						variant="bodyLarge"
						style={[styles.stepBody, { color: colors.mutedForeground }]}
					>
						{strings.onboarding.entryBody}
					</AppText>
				</>
			);
		// Cierre business: en vez de CTA de ubicación, enseña dónde vive
		// cada pestaña del panel (este paso estructuralmente la diferencia).
		case "panel":
			return (
				<>
					<AppText variant="h1" weight="bold" style={styles.stepTitle}>
						{strings.onboarding.business.panelTitle}
					</AppText>
					<View style={styles.panelList}>
						{PANEL_TABS.map(({ id, icon: Icon, title, description }) => (
							<Card key={id} style={styles.panelRow}>
								<View
									style={[
										styles.iconCircleSm,
										{ backgroundColor: withAlpha(colors.secondary, 0.15) },
									]}
								>
									<Icon size={22} color={colors.primary} />
								</View>
								<View style={styles.panelTexts}>
									<AppText variant="labelSmall" weight="semiBold">
										{title}
									</AppText>
									<AppText
										variant="bodySmall"
										style={{ color: colors.mutedForeground }}
									>
										{description}
									</AppText>
								</View>
							</Card>
						))}
					</View>
				</>
			);
	}
}

export default function OnboardingScreen() {
	const { colors } = useTheme();
	const { width: pageWidth } = useWindowDimensions();
	const scrollRef = useRef<ScrollView>(null);
	const [page, setPage] = useState(0);
	// Altura real del pager. Un content container de scroll HORIZONTAL no
	// hereda altura ni con minHeight:"100%" (el % no resuelve dentro del
	// content container en RN), así que las pages medían su contenido y el
	// justifyContent no tenía nada que centrar. Se mide el viewport y se le
	// da altura explícita a cada page: funciona igual en nativo y en web.
	const [pagerHeight, setPagerHeight] = useState(0);
	const markSeen = useMarkOnboardingSeen();
	const role = useAuthStore((s) => s.profile?.role ?? null);
	const business = onboardingAudience(role) === "business";
	const steps = business ? BUSINESS_ONBOARDING_STEPS : CONSUMER_ONBOARDING_STEPS;
	const totalPages = steps.length;

	// Marca vista y navega al destino de la audiencia (panel business o
	// home consumer). Se espera a persistir para que onSuccess fije la
	// caché del gate antes de navegar (ver hooks.ts).
	const finish = useCallback(() => {
		void markSeen
			.mutateAsync()
			.catch(() => {})
			.finally(() => {
				router.replace(business ? "/(business)/products" : "/(consumer)");
			});
	}, [markSeen, business]);

	const goToPage = useCallback(
		(index: number) => {
			setPage(index);
			scrollRef.current?.scrollTo({ x: index * pageWidth, animated: true });
		},
		[pageWidth],
	);

	// El índice se sync desde el momentum (swipe); programático (Siguiente)
	// llama a setPage vía goToPage porque en web no siempre dispara momentum.
	const handleMomentumEnd = useCallback(
		(e: NativeSyntheticEvent<NativeScrollEvent>) => {
			const next = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
			setPage(Math.min(Math.max(next, 0), totalPages - 1));
		},
		[pageWidth, totalPages],
	);

	return (
		<Screen>
			<View style={styles.header}>
				<Logo width={84} height={42} />
				<Button
					variant="ghost"
					size="sm"
					onPress={finish}
					accessibilityLabel={strings.onboarding.skip}
				>
					{strings.onboarding.skip}
				</Button>
			</View>

			<ScrollView
				ref={scrollRef}
				horizontal
				pagingEnabled
				snapToInterval={pageWidth}
				snapToAlignment="start"
				decelerationRate="fast"
				showsHorizontalScrollIndicator={false}
				onMomentumScrollEnd={handleMomentumEnd}
				onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}
				style={styles.pager}
				contentContainerStyle={styles.pagerContent}
			>
				{steps.map((step) => (
					<View
						key={step.id}
						style={[
							styles.page,
							// `undefined` en el primer paint (altura de contenido) hasta
							// que onLayout mide; luego caja completa y centrado real.
							{ width: pageWidth, height: pagerHeight || undefined },
						]}
					>
						<StepContent step={step} colors={colors} business={business} />
					</View>
				))}
			</ScrollView>

			<View style={styles.footer}>
				<View
					accessible
					accessibilityLabel={strings.onboarding.stepOf
						.replace("{n}", String(page + 1))
						.replace("{total}", String(totalPages))}
					style={styles.dots}
				>
					{steps.map((step, index) => (
						<View
							key={step.id}
							style={[
								styles.dot,
								index === page && styles.dotActive,
								{
									backgroundColor:
										index === page
											? colors.primary
											: withAlpha(colors.foreground, 0.2),
								},
							]}
						/>
					))}
				</View>
				{page < totalPages - 1 ? (
					<Button fullWidth onPress={() => goToPage(page + 1)}>
						{strings.common.next}
					</Button>
				) : (
					<Button fullWidth onPress={finish}>
						{strings.onboarding.start}
					</Button>
				)}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.sm,
	},
	pager: { flex: 1 },
	// La altura de cada page no se resuelve aquí: la da `pagerHeight`
	// (onLayout) en el JSX. minHeight:"100%" no sirve porque el % no
	// resuelve dentro del content container de un scroll horizontal.
	pagerContent: { flexGrow: 1 },
	page: {
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.xl,
		paddingHorizontal: spacing.xl,
	},
	stepTitle: { textAlign: "center" },
	stepBody: { textAlign: "center" },
	iconRow: {
		flexDirection: "row",
		gap: spacing.md,
	},
	iconCircle: {
		width: 64,
		height: 64,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	iconCircleSm: {
		width: 48,
		height: 48,
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	cycleRow: {
		alignSelf: "stretch",
		flexDirection: "row",
		gap: spacing.md,
	},
	cycleCard: {
		flex: 1,
		alignItems: "center",
		paddingHorizontal: spacing.sm,
	},
	cycleLabel: { textAlign: "center" },
	// Paso panel business: filas compactas icono + título + descripción.
	panelList: {
		alignSelf: "stretch",
		gap: spacing.sm,
	},
	panelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
	},
	panelTexts: {
		flex: 1,
		gap: spacing.xxs,
	},
	footer: {
		gap: spacing.lg,
		paddingHorizontal: spacing.xl,
		paddingBottom: spacing.xl,
	},
	dots: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
	},
	dot: {
		width: spacing.sm,
		height: spacing.sm,
		borderRadius: radii.pill,
	},
	dotActive: {
		width: spacing.xl,
	},
});
