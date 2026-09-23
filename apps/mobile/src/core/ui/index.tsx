import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode, type Ref } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View,
	Platform,
	type RefreshControlProps,
	type StyleProp,
	type TextStyle,
	type ViewStyle,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Eye, EyeOff, Heart, Search, X, type LucideIcon } from "lucide-react-native";
import { router, useNavigation, useSegments, type Href } from "expo-router";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withSpring,
	withTiming,
	Easing,
} from "react-native-reanimated";

import { useTheme } from "@/src/core/theme";
import type { ColorTokens } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { spacing, radii } from "@/src/core/theme/spacing";
import { fonts, typography, type TypeStyle } from "@/src/core/theme/typography";
import { withAlpha } from "@/src/core/theme/alpha";
import { toAppError } from "@/src/core/error/mapper";
import { AppText } from "./AppText";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export { BottomSheetModal } from "./BottomSheetModal";
export { AppText, type FontVariant, type FontWeight } from "./AppText";
export { useWebPullToRefresh } from "./WebPullToRefresh";
// InfoScreen y LegalScreen importan del barrel: exportarlas aquí crearía
// un ciclo; se siguen importando por ruta directa.
export { Logo } from "./Logo";
export { default as Navbar, BAR_HEIGHT } from "./Navbar";

export type { ColorTokens, TypeStyle };
export { spacing, fonts, typography };


// ─── Circular Icon Button (floating) ─────────────────────────────
export function CircleIconButton({
	icon,
	onPress,
	size = 40,
	iconSize = 20,
	iconColor,
	accessibilityLabel,
}: {
	icon: ReactNode;
	onPress?: () => void;
	size?: number;
	iconSize?: number;
	iconColor?: string;
	accessibilityLabel?: string;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			style={({ pressed }) => [
				styles.circleButton,
				{
					width: size,
					height: size,
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					boxShadow: `0px 2px 8px ${colors.shadow}`,
					transform: [{ scale: pressed ? 0.94 : 1 }],
				},
			]}
		>
			{icon}
		</Pressable>
	);
}

// ─── Heart toggle button (floating favorite, reanimated pop) ─────
export function HeartButton({
	isFavorite,
	onPress,
	size = 40,
	iconSize = 20,
	accessibilityLabel,
}: {
	isFavorite: boolean;
	onPress?: () => void;
	size?: number;
	iconSize?: number;
	accessibilityLabel?: string;
}) {
	const { colors } = useTheme();
	const scale = useSharedValue(1);
	const prevFavorite = useRef(isFavorite);

	useEffect(() => {
		if (prevFavorite.current !== isFavorite) {
			prevFavorite.current = isFavorite;
			scale.value = withSequence(
				withTiming(0.65, { duration: 100, easing: Easing.in(Easing.quad) }),
				withTiming(1.4, { duration: 160, easing: Easing.out(Easing.quad) }),
				withSpring(1, { damping: 12, stiffness: 200 }),
			);
		}
	}, [isFavorite, scale]);

	const heartStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={heartStyle}>
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={accessibilityLabel}
				style={({ pressed }) => [
					styles.circleButton,
					{
						width: size,
						height: size,
						backgroundColor: isFavorite
							? `${withAlpha(colors.redAccent, 0.149)}`
							: colors.card,
						boxShadow: `0px 2px 8px ${colors.shadow}`,
						transform: [{ scale: pressed ? 0.94 : 1 }],
					},
				]}
			>
				<Heart
					fill={isFavorite ? colors.redAccent : "none"}
					size={iconSize}
					color={isFavorite ? colors.redAccent : colors.foreground}
				/>
			</Pressable>
		</Animated.View>
	);
}

// ─── SearchBar ──────────────────────────────────────────────────────
interface SearchBarProps {
	value: string;
	onChangeText: (text: string) => void;
	onSubmit?: (text: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	containerStyle?: StyleProp<ViewStyle>;
}

export function SearchBar({
	value,
	onChangeText,
	onSubmit,
	placeholder,
	autoFocus = false,
	containerStyle,
}: SearchBarProps) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.searchBar,
				{
					backgroundColor: colors.inputBackground,
					borderColor: colors.borderSolid,
				},
				containerStyle,
			]}
		>
			<Search size={18} color={colors.mutedForeground} />
			<TextInput
				value={value}
				onChangeText={onChangeText}
				onSubmitEditing={() => onSubmit?.(value)}
				placeholder={placeholder}
				placeholderTextColor={colors.mutedForeground}
				autoFocus={autoFocus}
				returnKeyType="search"
				style={[styles.searchInput, { color: colors.foreground }]}
			/>
			{value.length > 0 ? (
				<Button
					variant="ghost"
					size="icon"
					onPress={() => {
						onChangeText("");
						onSubmit?.("");
					}}
					hitSlop={8}
					accessibilityRole="button"
					aria-label={strings.common.clearSearch}
					style={{ width: 24, height: 24 }}
					icon={<X size={16} color={colors.mutedForeground} />}
				/>
			) : null}
		</View>
	);
}

// ─── FilterChip (active filter with clear) ─────────────────────────
export function FilterChip({
	label,
	onClear,
}: {
	label: string;
	onClear: () => void;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.filterChip,
				{
					backgroundColor: withAlpha(colors.secondary, 0.302),
					borderColor: withAlpha(colors.primary, 0.2),
				},
			]}
		>
			<AppText
				variant="bodySmall"
				weight="semiBold"
				style={{ color: colors.primary }}
			>
				{label}
			</AppText>
			<Button
				variant="ghost"
				size="icon"
				onPress={onClear}
				aria-label={strings.common.removeFilter.replace("{label}", label)}
				hitSlop={8}
				accessibilityRole="button"
				style={{ width: 24, height: 24 }}
				icon={<X size={14} color={colors.mutedForeground} />}
			/>
		</View>
	);
}

// ─── ScreenHeader (back button + title) ──────────────────────────
/** Atrás vía router global si hay historia; si no (refresh/deep-link), al fallback.
 *  Para pantallas del stack raíz: su GO_BACK siempre popea ahí.
 *  ScreenHeader no la usa: necesita popear el stack propio, no el global. */
export function goBackOr(fallback: Href) {
	if (router.canGoBack()) router.back();
	else router.replace(fallback);
}

interface ScreenHeaderProps {
	title?: string;
	onBack?: () => void;
	/** Destino cuando el stack propio no tiene historia que popear. Default: home consumidor. */
	fallback?: Href;
	style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({ title, onBack, fallback, style }: ScreenHeaderProps) {
	const { colors } = useTheme();
	const navigation = useNavigation();

	// Popea solo el stack que contiene a esta pantalla. Si ese stack no tiene
	// historia propia (pantallas dentro de tabs ocultos), el GO_BACK burbujea
	// al navegador de tabs (backBehavior firstRoute) y salta al primer tab en
	// vez de volver atrás; en ese caso se navega al fallback declarado.
	const handleBack = () => {
		if ((navigation.getState()?.index ?? 0) > 0) navigation.goBack();
		else router.navigate(fallback ?? "/(consumer)");
	};

	return (
		<View style={[styles.screenHeader, style]}>
			<Button
				variant="ghost"
				size="icon"
				onPress={onBack ?? handleBack}
				hitSlop={8}
				accessibilityRole="button"
				aria-label={strings.common.back}
				icon={<ChevronLeft size={22} color={colors.foreground} />}
			/>
			{title ? (
				<AppText
					variant="h2"
					weight="bold"
					numberOfLines={1}
					style={styles.screenHeaderTitle}
				>
					{title}
				</AppText>
			) : null}
		</View>
	);
}

// ─── Screen ─────────────────────────────────────────────────────────
interface ScreenProps {
	children: ReactNode;
	scroll?: boolean;
	contentContainerStyle?: StyleProp<ViewStyle>;
	style?: StyleProp<ViewStyle>;
	keyboardShouldPersistTaps?: "handled" | "never" | "always";
	edges?: Array<"top" | "bottom" | "left" | "right">;
	refreshControl?: ReactElement<RefreshControlProps>;
	scrollRef?: Ref<ScrollView>;
}

export function Screen({
	children,
	scroll = false,
	contentContainerStyle,
	style,
	keyboardShouldPersistTaps,
	edges = ["top", "bottom"],
	refreshControl,
	scrollRef,
}: ScreenProps) {
	const { colors } = useTheme();
	const bg = { backgroundColor: colors.background };
	// Dueño único del inset inferior en los grupos con tabs: OuterBar/
	// Navbar va en flujo debajo de TODA pantalla de (consumer)/(business)
	// (incluidos los stacks anidados como profile/*) y guarda la zona de
	// gesto con su propio bottomInset pintado con el fondo temático. El
	// bottom de SafeAreaView aquí duplicaba ese inset y, apilado sobre el
	// padding de diseño del contenido, se leía como franja en todas las
	// tabs — por eso se filtra en la zona compartida en vez de tocar
	// pantallas una por una. Fuera de esos grupos (stacks raíz, modales,
	// auth, checkout) edges se respeta intacto: ahí no hay barra que
	// guarde el gesto. Los edges explícitos sin bottom (p. ej. business
	// products/orders) no cambian: el filtro es no-op para ellos.
	const segments = useSegments();
	const resolvedEdges = useMemo(() => {
		const group = segments[0];
		if (group === "(consumer)" || group === "(business)") {
			return edges.filter((edge) => edge !== "bottom");
		}
		return edges;
	}, [segments, edges]);
	if (!scroll) {
		return (
			<SafeAreaView edges={resolvedEdges} style={[styles.flex, bg, style]}>
				{children}
			</SafeAreaView>
		);
	}
	return (
		<SafeAreaView edges={resolvedEdges} style={[styles.flex, bg]}>
			<ScrollView
				ref={scrollRef}
				style={style}
				contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
				keyboardShouldPersistTaps={keyboardShouldPersistTaps}
				showsVerticalScrollIndicator={false}
				refreshControl={refreshControl}
			>
				{children}
			</ScrollView>
		</SafeAreaView>
	);
}

// ─── TextField ──────────────────────────────────────────────────────
interface TextFieldProps extends TextInputProps {
	label?: string;
	hint?: string;
	error?: string | null;
	containerStyle?: StyleProp<ViewStyle>;
	/** Prefix icon (Lucide), used by the auth forms. */
	icon?: LucideIcon;
	/** Toggle de visibilidad para contraseñas (junto a secureTextEntry). */
	secureToggle?: boolean;
}

export function TextField({
	label,
	hint,
	error,
	containerStyle,
	multiline,
	icon: Icon,
	secureToggle,
	...inputProps
}: TextFieldProps) {
	const { colors } = useTheme();
	const [focused, setFocused] = useState(false);
	const [obscured, setObscured] = useState(
		secureToggle ? (inputProps.secureTextEntry ?? false) : false,
	);
	const labelNode = label ? (
		<AppText
			variant="labelSmall"
			weight="semiBold"
			style={[styles.fieldLabel, { color: colors.mutedForeground }]}
		>
			{label}
		</AppText>
	) : null;
	const hintNode = error ? (
		<AppText
			variant="bodySmall"
			style={{ color: colors.destructive, marginTop: 4 }}
		>
			{error}
		</AppText>
	) : hint ? (
		<AppText
			variant="bodySmall"
			style={{ color: colors.mutedForeground, marginTop: 4 }}
		>
			{hint}
		</AppText>
	) : null;

	if (Icon || secureToggle) {
		const editable = inputProps.editable !== false;
		return (
			<View style={[styles.field, containerStyle]}>
				{labelNode}
				<View
					style={[
						styles.fieldRow,
						{
							backgroundColor: colors.inputBackground,
							borderColor: error
								? colors.destructive
								: focused
									? colors.primary
									: colors.borderSolid,
							opacity: editable ? 1 : 0.6,
						},
					]}
				>
				{Icon ? (
					<Icon size={20} color={colors.mutedForeground} />
				) : null}
					<TextInput
						placeholderTextColor={colors.mutedForeground}
						onFocus={(e) => {
							setFocused(true);
							inputProps.onFocus?.(e);
						}}
						onBlur={(e) => {
							setFocused(false);
							inputProps.onBlur?.(e);
						}}
						style={[styles.fieldInput, { color: colors.foreground }]}
						{...inputProps}
						secureTextEntry={secureToggle ? obscured : inputProps.secureTextEntry}
					/>
					{secureToggle ? (
						<Button
							variant="ghost"
							size="icon"
							onPress={() => setObscured((s) => !s)}
							hitSlop={8}
							accessibilityRole="button"
							aria-label={
								obscured ? strings.auth.showPassword : strings.auth.hidePassword
							}
							style={{ width: 32, height: 32 }}
							icon={
								obscured ? (
									<Eye size={20} color={colors.mutedForeground} />
								) : (
									<EyeOff size={20} color={colors.mutedForeground} />
								)
							}
						/>
					) : null}
				</View>
				{hintNode}
			</View>
		);
	}
	return (
		<View style={[styles.field, containerStyle]}>
			{labelNode}
			<TextInput
				placeholderTextColor={colors.mutedForeground}
				multiline={multiline}
				onFocus={(e) => {
					setFocused(true);
					inputProps.onFocus?.(e);
				}}
				onBlur={(e) => {
					setFocused(false);
					inputProps.onBlur?.(e);
				}}
				style={[
					styles.input,
					multiline && styles.inputMultiline,
					{
						backgroundColor: colors.inputBackground,
						borderColor: error
							? colors.destructive
							: focused
								? colors.primary
								: colors.border,
						color: colors.foreground,
					},
				]}
				{...inputProps}
			/>
			{hintNode}
		</View>
	);
}

// ─── StatusBadge ────────────────────────────────────────────────────
export type BadgeTone =
	| "neutral"
	| "brand"
	| "success"
	| "warning"
	| "danger"
	| "info";

export function StatusBadge({
	label,
	tone = "neutral",
	dot = false,
}: {
	label: string;
	tone?: BadgeTone;
	/** Punto pulsante del estado (header del detalle del pedido). */
	dot?: boolean;
}) {
	const { colors } = useTheme();
	const toneMap: Record<BadgeTone, { bg: string; fg: string }> = {
		neutral: { bg: colors.muted, fg: colors.mutedForeground },
		brand: { bg: colors.secondary, fg: colors.secondaryForeground },
		success: { bg: colors.surfaceSuccess, fg: colors.success },
		warning: { bg: colors.surfaceWarning, fg: colors.warning },
		danger: { bg: colors.destructiveSurface, fg: colors.destructive },
		info: { bg: colors.infoSurface, fg: colors.info },
	};
	const t = toneMap[tone];
	const opacity = useSharedValue(1);
	useEffect(() => {
		if (dot) {
			opacity.value = withRepeat(
				withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) }),
				-1,
				true,
			);
		}
	}, [dot, opacity]);
	const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
	  return (
		<Badge
		variant="outline"
		style={{ backgroundColor: t.bg, borderColor: withAlpha(t.fg, 0.35) }}
		>
		{dot ? (
			<Animated.View style={dotStyle}>
				<View
					style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.fg }}
				/>
			</Animated.View>
		) : null}
		<AppText variant="bodySmall" weight="semiBold" style={{ color: t.fg }}>
			{label}
		</AppText>
		</Badge>
	);
}

// ─── Empty / error states ───────────────────────────────────────────
export function EmptyState({
	icon,
	title,
	message,
	action,
	style,
}: {
	icon?: ReactNode;
	title: string;
	message?: string;
	action?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	const { colors } = useTheme();
	return (
		<View style={[styles.stateBox, style]}>
			{icon ? (
				<View style={[styles.stateIcon, { backgroundColor: colors.muted }]}>
					{icon}
				</View>
			) : null}
			<AppText variant="h3" weight="bold" style={{ textAlign: "center" }}>
				{title}
			</AppText>
			{message ? (
				<AppText
					variant="bodyMedium"
					style={{ textAlign: "center", color: colors.mutedForeground }}
				>
					{message}
				</AppText>
			) : null}
			{action}
		</View>
	);
}

export function ErrorState({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry?: () => void;
}) {
	const { colors } = useTheme();
	// Nunca renderices error.message crudo: toAppError mapea PostgREST/red
	// a la taxonomía de la app con copy es-ES.
	const message = toAppError(error).message;
	return (
		<View style={styles.stateBox}>
			<AppText
				variant="h3"
				weight="bold"
				style={{ textAlign: "center", color: colors.destructive }}
			>
				{message}
			</AppText>
			{onRetry ? (
				<Button
					variant="outline"
					onPress={onRetry}
					style={{ alignSelf: "center", marginTop: margin(2) }}
				>
				{strings.common.retry}
				</Button>
			) : null}
		</View>
	);
}

// ─── SectionHeader ──────────────────────────────────────────────────
export function SectionHeader({
	title,
	icon,
	onSeeAll,
	action,
	style,
}: {
	title: string;
	icon?: ReactNode;
	onSeeAll?: () => void;
	action?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<View style={[styles.sectionHeader, style]}>
			<View style={styles.sectionHeaderTitle}>
				{icon}
				<AppText variant="h3" weight="bold">
					{title}
				</AppText>
			</View>
			{onSeeAll ? (
				<Button variant="link" onPress={onSeeAll} hitSlop={8}>
					{strings.home.viewAll}
				</Button>
			) : (
				action
			)}
		</View>
	);
}

// ─── Loading ────────────────────────────────────────────────────────
export function LoadingView({
	label = strings.common.loading,
}: {
	label?: string;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.flex,
				styles.stateBox,
				{ backgroundColor: colors.background },
			]}
		>
			<ActivityIndicator size="large" color={colors.primary} />
			<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
		</View>
	);
}

function margin(mult: number): number {
	return spacing.md * mult;
}

export function SectionTitle({ children }: { children: string }) {
	const { colors } = useTheme();
	return (
		<AppText
			variant="labelSmall"
			weight="bold"
			style={{ color: colors.mutedForeground }}
		>
			{children}
		</AppText>
	);
}

export function ThemeOptionCard({
	label,
	icon: Icon,
	isSelected,
	onPress,
}: {
	label: string;
	icon: LucideIcon;
	isSelected: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={[
				styles.themeCard,
				{
					backgroundColor: isSelected ? withAlpha(colors.primary, 0.051) : colors.card,
					borderColor: isSelected ? colors.primary : colors.borderSolid,
					// Ancho uniforme: 1.5 solo en seleccionada desplazaba
					// la fila 1px al cambiar de opción.
					borderWidth: 1,
				},
			]}
		>
		<Icon
			size={20}
			color={isSelected ? colors.primary : colors.mutedForeground}
		/>
		<AppText
			variant="bodySmall"
				weight={isSelected ? "bold" : "regular"}
				style={{
					color: isSelected ? colors.primary : colors.foreground,
					textAlign: "center",
				}}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
	flex: { flex: 1 },
	scrollContent: { paddingBottom: spacing.xxl },
	card: {
		borderRadius: radii.md,
		borderWidth: 1,
		padding: 16,
	},
	circleButton: {
		borderRadius: radii.pill,
		alignItems: "center",
		justifyContent: "center",
	},
	field: { marginBottom: spacing.md },
	fieldLabel: { marginBottom: 6 },
	fieldRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: radii.md,
		paddingHorizontal: 16,
		paddingVertical: 12,
	},
	fieldInput: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 0 },
	eyeButton: {
		padding: spacing.xs,
		alignItems: "center",
		justifyContent: "center",
	},
	input: {
		borderRadius: radii.md,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		fontSize: 15,
	},
	inputMultiline: { minHeight: 96, textAlignVertical: "top" },
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
		borderWidth: 1,
		alignSelf: "flex-start",
	},
	badgeDot: {
		width: 6,
		height: 6,
		borderRadius: radii.sm,
	},
	stateBox: {
		alignItems: "center",
		paddingVertical: spacing.xxxl,
		paddingHorizontal: spacing.xl,
		gap: spacing.sm,
	},
	stateIcon: {
		width: 56,
		height: 56,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.sm,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: spacing.xl,
		marginBottom: spacing.md,
		paddingHorizontal: spacing.xl,
	},
	sectionHeaderTitle: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	sectionHeaderAction: {
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		justifyContent: "center",
	},

	// ── ScreenHeader ────────────────────────────────────────────
	screenHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	screenHeaderBack: {
		width: 40,
		height: 40,
		borderRadius: radii.xxl,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	screenHeaderTitle: { flex: 1 },
	fullWidth: { width: "100%" },

	// ── SearchBar ────────────────────────────────────────────────
	searchBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingHorizontal: spacing.md,
		borderRadius: radii.md,
		borderWidth: 1,
	},
	// minWidth: 0 permite que el input encoja dentro de filas flex en web
	// (sin esto el placeholder desborda la caja).
	searchInput: { flex: 1, minWidth: 0, paddingVertical: spacing.sm + 2, fontSize: 14 },
	searchClear: {
		width: 24,
		height: 24,
		borderRadius: radii.md,
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Chips ────────────────────────────────────────────────────
	filterChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs + 2,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	themeCard: {
		flex: 1,
		alignItems: "center",
		gap: spacing.xs,
		paddingVertical: spacing.md,
		borderRadius: radii.md,
	},
});
