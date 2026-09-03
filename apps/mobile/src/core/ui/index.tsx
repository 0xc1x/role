import { useEffect, useRef, type ReactNode } from "react";
import {
	Platform,
	ActivityIndicator,
	Animated,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View,
	type StyleProp,
	type TextStyle,
	type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation, type Href } from "expo-router";

import { useTheme } from "@/core/theme";
import type { ColorTokens } from "@/core/theme/colors";
import { strings } from "@/core/i18n/strings";
import { spacing, radii } from "@/core/theme/spacing";
import { fonts, typography, type TypeStyle } from "@/core/theme/typography";
import { AppText } from "./AppText";

export { BottomSheetModal } from "./BottomSheetModal";
export { AppText, type FontVariant, type FontWeight } from "./AppText";

export type { ColorTokens, TypeStyle };
export { spacing, fonts, typography };

// ─── Button ─────────────────────────────────────────────────────────
export type ButtonVariant =
	| "primary"
	| "secondary"
	| "outline"
	| "ghost"
	| "danger";

interface ButtonProps {
	onPress?: () => void;
	label: string;
	variant?: ButtonVariant;
	disabled?: boolean;
	loading?: boolean;
	fullWidth?: boolean;
	size?: "sm" | "md" | "lg";
	style?: StyleProp<ViewStyle>;
	icon?: ReactNode;
	accessibilityLabel?: string;
}

export function Button({
	onPress,
	label,
	variant = "primary",
	disabled,
	loading,
	fullWidth,
	size = "md",
	style,
	icon,
	accessibilityLabel,
}: ButtonProps) {
	const { colors } = useTheme();
	const isDisabled = disabled || loading;
	const height = size === "sm" ? 38 : size === "lg" ? 54 : 46;
	const { base, labelStyle, labelColor } = buttonVariant(colors, variant);
	return (
		<Pressable
			onPress={onPress}
			disabled={isDisabled}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			style={({ pressed }) => [
				base,
				{ height, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
				fullWidth && styles.fullWidth,
				style,
			]}
		>
			{loading ? (
				<ActivityIndicator color={labelColor} />
			) : (
				<View style={styles.row}>
					{icon}
					<Text style={[labelStyle, { color: labelColor }]}>{label}</Text>
				</View>
			)}
		</Pressable>
	);
}

function buttonVariant(
	colors: ColorTokens,
	variant: ButtonVariant,
): {
	base: ViewStyle;
	labelStyle: TextStyle;
	labelColor: string;
} {
	const base: ViewStyle = {
		borderRadius: 99,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: 24,
	};
	const labelStyle: TextStyle = {
		fontSize: 16,
		fontWeight: "700" as const,
		lineHeight: 24,
	};
	switch (variant) {
		case "primary":
			return {
				base: { ...base, backgroundColor: colors.primary },
				labelStyle,
				labelColor: "#FFFFFF",
			};
		case "secondary":
			return {
				base: { ...base, backgroundColor: colors.secondary },
				labelStyle,
				labelColor: colors.secondaryForeground,
			};
		case "outline":
			return {
				base: {
					...base,
					borderWidth: 1.5,
					borderColor: colors.foreground,
					backgroundColor: "transparent",
				},
				labelStyle,
				labelColor: colors.foreground,
			};
		case "ghost":
			return {
				base: { ...base, backgroundColor: "transparent" },
				labelStyle: { ...labelStyle, fontWeight: "600" },
				labelColor: colors.foreground,
			};
		case "danger":
			return {
				base: { ...base, backgroundColor: colors.destructive },
				labelStyle,
				labelColor: "#FFFFFF",
			};
	}
}

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

// ─── Heart toggle button (floating favorite) ─────────────────────
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
	const scale = useRef(new Animated.Value(1)).current;

	useEffect(() => {
		if (!isFavorite) return;
		scale.setValue(0.65);
		Animated.spring(scale, {
			toValue: 1,
			friction: 3,
			tension: 160,
			useNativeDriver: Platform.OS !== "web",
		}).start();
	}, [isFavorite, scale]);

	return (
		<Animated.View style={{ transform: [{ scale }] }}>
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
							? `${colors.redAccent}26`
							: colors.card,
						boxShadow: `0px 2px 8px ${colors.shadow}`,
						transform: [{ scale: pressed ? 0.94 : 1 }],
					},
				]}
			>
				<Ionicons
					name={isFavorite ? "heart" : "heart-outline"}
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
			<Ionicons name="search" size={18} color={colors.mutedForeground} />
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
				<Pressable
					onPress={() => {
						onChangeText("");
						onSubmit?.("");
					}}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.common.clear}
					style={[
						styles.searchClear,
						{ backgroundColor: colors.inputBackground },
					]}
				>
					<Ionicons name="close" size={16} color={colors.mutedForeground} />
				</Pressable>
			) : null}
		</View>
	);
}

// ─── SelectableChipsBar ─────────────────────────────────────────────
interface SelectableChipsBarProps<T> {
	items: T[];
	selectedItem: T;
	labelFor: (item: T) => string;
	onSelect: (item: T) => void;
	initialCount?: number;
	paddingHorizontal?: number;
	style?: StyleProp<ViewStyle>;
}

export function SelectableChipsBar<T>({
	items,
	selectedItem,
	labelFor,
	onSelect,
	initialCount,
	paddingHorizontal = spacing.lg,
	style,
}: SelectableChipsBarProps<T>) {
	const { colors } = useTheme();
	const hasLimit = initialCount != null && items.length > initialCount;
	const displayItems = hasLimit ? items.slice(0, initialCount) : items;

	return (
		<View style={[styles.chipsBar, { paddingHorizontal }, style]}>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.chipsBarContent}
			>
				{displayItems.map((item, index) => {
					const selected = item === selectedItem;
					return (
						<Pressable
							key={index}
							onPress={() => onSelect(item)}
							style={[
								styles.chip,
								{
									backgroundColor: selected
										? colors.greenDark
										: colors.green + "4D",
									borderColor: selected
										? colors.greenDark
										: colors.greenDark + "26",
								},
							]}
						>
							<AppText
								variant="bodySmall"
								weight={selected ? "semiBold" : "medium"}
								style={{
									color: selected ? colors.green : colors.greenDark + "B3",
								}}
							>
								{labelFor(item)}
							</AppText>
						</Pressable>
					);
				})}
			</ScrollView>
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
					backgroundColor: colors.secondary + "4D",
					borderColor: colors.primary + "33",
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
			<Pressable onPress={onClear} hitSlop={8} accessibilityRole="button">
				<Ionicons name="close" size={14} color={colors.mutedForeground} />
			</Pressable>
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
			<Pressable
				onPress={onBack ?? handleBack}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel={strings.common.back}
				style={[
					styles.screenHeaderBack,
					{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				]}
			>
				<Ionicons name="chevron-back" size={20} color={colors.foreground} />
			</Pressable>
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

// ─── Card ───────────────────────────────────────────────────────────
interface CardProps {
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
	onPress?: () => void;
}

export function Card({ children, style, onPress }: CardProps) {
	const { colors } = useTheme();
	const inner = [
		styles.card,
		{
			backgroundColor: colors.card,
			borderColor: colors.borderSolid,
			boxShadow: `0px 4px 16px ${colors.cardShadow}`,
		},
		style,
	];
	if (onPress) {
		return (
			<Pressable
				onPress={onPress}
				style={({ pressed }) => [inner, pressed && { opacity: 0.9 }]}
			>
				{children}
			</Pressable>
		);
	}
	return <View style={inner}>{children}</View>;
}

// ─── Screen ─────────────────────────────────────────────────────────
interface ScreenProps {
	children: ReactNode;
	scroll?: boolean;
	contentContainerStyle?: StyleProp<ViewStyle>;
	style?: StyleProp<ViewStyle>;
	keyboardShouldPersistTaps?: "handled" | "never" | "always";
	edges?: Array<"top" | "bottom" | "left" | "right">;
}

export function Screen({
	children,
	scroll = false,
	contentContainerStyle,
	style,
	keyboardShouldPersistTaps,
	edges = ["top", "bottom"],
}: ScreenProps) {
	const { colors } = useTheme();
	const bg = { backgroundColor: colors.background };
	if (!scroll) {
		return (
			<SafeAreaView edges={edges} style={[styles.flex, bg, style]}>
				{children}
			</SafeAreaView>
		);
	}
	return (
		<SafeAreaView edges={edges} style={[styles.flex, bg]}>
			<ScrollView
				style={style}
				contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
				keyboardShouldPersistTaps={keyboardShouldPersistTaps}
				showsVerticalScrollIndicator={false}
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
}

export function TextField({
	label,
	hint,
	error,
	containerStyle,
	multiline,
	...inputProps
}: TextFieldProps) {
	const { colors } = useTheme();
	return (
		<View style={[styles.field, containerStyle]}>
			{label ? (
				<AppText
					variant="labelSmall"
					weight="semiBold"
					style={[styles.fieldLabel, { color: colors.mutedForeground }]}
				>
					{label}
				</AppText>
			) : null}
			<TextInput
				placeholderTextColor={colors.mutedForeground}
				multiline={multiline}
				style={[
					styles.input,
					multiline && styles.inputMultiline,
					{
						backgroundColor: colors.inputBackground,
						borderColor: error ? colors.destructive : colors.border,
						color: colors.foreground,
					},
				]}
				{...inputProps}
			/>
			{error ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.destructive, marginTop: 4 }}
				>
					{error}
				</AppText>
			) : hint && !error ? (
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: 4 }}
				>
					{hint}
				</AppText>
			) : null}
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
}: {
	label: string;
	tone?: BadgeTone;
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
	return (
		<View style={[styles.badge, { backgroundColor: t.bg }]}>
			<AppText variant="bodySmall" weight="semiBold" style={{ color: t.fg }}>
				{label}
			</AppText>
		</View>
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
	const message =
		error instanceof Error
			? error.message
			: "Algo salió mal. Inténtalo de nuevo.";
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
					label="Reintentar"
					variant="outline"
					onPress={onRetry}
					style={{ alignSelf: "center", marginTop: margin(2) }}
				/>
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
	const { colors } = useTheme();
	return (
		<View style={[styles.sectionHeader, style]}>
			<View style={styles.sectionHeaderTitle}>
				{icon}
				<AppText variant="h3" weight="bold">
					{title}
				</AppText>
			</View>
			{onSeeAll ? (
				<Pressable
					onPress={onSeeAll}
					hitSlop={8}
					style={styles.sectionHeaderAction}
				>
					<AppText
						variant="bodySmall"
						weight="semiBold"
						style={{ color: colors.primary }}
					>
						{strings.home.viewAll}
					</AppText>
				</Pressable>
			) : (
				action
			)}
		</View>
	);
}

// ─── Loading ────────────────────────────────────────────────────────
export function LoadingView({ label = "Cargando..." }: { label?: string }) {
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
	icon,
	isSelected,
	onPress,
}: {
	label: string;
	icon: string;
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
					backgroundColor: isSelected ? colors.primary + "0D" : colors.card,
					borderColor: isSelected ? colors.primary : colors.borderSolid,
					borderWidth: isSelected ? 1.5 : 1,
				},
			]}
		>
			<Ionicons
				name={icon as never}
				size={20}
				color={isSelected ? colors.primary : colors.mutedForeground}
			/>
			<AppText
				variant="bodySmall"
				weight={isSelected ? "bold" : "regular"}
				style={{ color: isSelected ? colors.primary : colors.foreground }}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

// ─── Styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
	flex: { flex: 1 },
	scrollContent: { paddingBottom: 32 },
	card: {
		borderRadius: 24,
		borderWidth: 1,
		padding: 16,
	},
	circleButton: {
		borderRadius: 99,
		alignItems: "center",
		justifyContent: "center",
	},
	field: { marginBottom: spacing.md },
	fieldLabel: { marginBottom: 6 },
	input: {
		borderRadius: 18,
		borderWidth: 1,
		paddingHorizontal: 16,
		paddingVertical: 12,
		fontSize: 15,
	},
	inputMultiline: { minHeight: 96, textAlignVertical: "top" },
	badge: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
		alignSelf: "flex-start",
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
		borderRadius: 28,
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
		borderRadius: 20,
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
		borderRadius: 12,
		borderWidth: 1,
	},
	// minWidth: 0 permite que el input encoja dentro de filas flex en web
	// (sin esto el placeholder desborda la caja).
	searchInput: { flex: 1, minWidth: 0, paddingVertical: spacing.sm + 2, fontSize: 14 },
	searchClear: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},

	// ── Chips ────────────────────────────────────────────────────
	chipsBar: {
		width: "100%",
	},
	chipsBarContent: {
		gap: spacing.sm,
		alignItems: "center",
	},
	chip: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderRadius: radii.md,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
		minHeight: 40,
	},
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
