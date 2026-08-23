import * as React from "react";
import { Animated, Dimensions, Pressable, StyleSheet, View } from "react-native";
import { Portal } from "@rn-primitives/portal";

import { cn } from "@/lib/utils";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";
import { BAR_HEIGHT } from "@/core/ui/RoleTabBar";
import { useTabBarStore } from "@/core/ui/tabbar-store";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type DrawerContextProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

const DrawerContext = React.createContext<DrawerContextProps | null>(null);

function useDrawer() {
	const ctx = React.useContext(DrawerContext);
	if (!ctx) throw new Error("Drawer compound components must be inside <Drawer>");
	return ctx;
}

// ─── Root ──────────────────────────────────────────────────────────────
export function Drawer({
	open: controlledOpen,
	onOpenChange,
	children,
	defaultOpen = false,
}: {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen! : internalOpen;
	const setOpen = React.useCallback(
		(v: boolean) => {
			if (!isControlled) setInternalOpen(v);
			onOpenChange?.(v);
		},
		[isControlled, onOpenChange],
	);
	const value = React.useMemo(() => ({ open, onOpenChange: setOpen }), [open, setOpen]);
	return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

// ─── Trigger / Close ─────────────────────────────────────────────────
export function DrawerTrigger({
	children,
	onPress,
	...props
}: React.ComponentProps<typeof Pressable> & { children: React.ReactNode }) {
	const { onOpenChange } = useDrawer();
	return (
		<Pressable onPress={() => onOpenChange(true)} {...props}>
			{children}
		</Pressable>
	);
}

export function DrawerClose({
	children,
	onPress,
	...props
}: React.ComponentProps<typeof Pressable> & { children?: React.ReactNode }) {
	const { onOpenChange } = useDrawer();
	return (
		<Pressable
			onPress={(e) => {
				onOpenChange(false);
				// @ts-ignore
				onPress?.(e);
			}}
			{...props}
		>
			{children}
		</Pressable>
	);
}

// ─── Overlay ─────────────────────────────────────────────────────────
export function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
	const { onOpenChange } = useDrawer();
	return (
		<Pressable
			onPress={() => onOpenChange(false)}
			className={cn("absolute inset-0 bg-black/50", className)}
			{...props}
		/>
	);
}

// ─── Content (bottom sheet) ──────────────────────────────────────────
export function DrawerContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof View> & { className?: string }) {
	const { open, onOpenChange } = useDrawer();
	const { colors } = useTheme();
	const insets = useSafeAreaInsets();
	const tabBarProps = useTabBarStore((s) => s.props);
	const hasTabs = tabBarProps !== null;
	const bottomOffset = hasTabs ? BAR_HEIGHT + insets.bottom : 0;
	const offset = React.useRef(new Animated.Value(Dimensions.get("window").height)).current;

	React.useEffect(() => {
		if (!open) return;
		const anim = Animated.timing(offset, {
			toValue: 0,
			duration: 280,
			useNativeDriver: true,
		});
		anim.start();
		return () => anim.stop();
	}, [open, offset]);

	if (!open) return null;

	const sheet = (
		<View
			style={[
				StyleSheet.absoluteFill,
				{ justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1000 },
			]}
		>
			<Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(false)} />
			<Animated.View
				style={[
					{
						backgroundColor: colors.card,
						maxHeight: "92%",
						borderTopLeftRadius: 32,
						borderTopRightRadius: 32,
						overflow: "hidden",
						width: "100%",
						paddingBottom: bottomOffset + spacing.xxxl,
						transform: [{ translateY: offset }],
					},
					{ zIndex: 1001 } as any,
				]}
				className={cn("bg-card", className)}
				{...props}
			>
				<View style={{ paddingTop: spacing.md, alignItems: "center" }}>
					<View style={{ width: 48, height: 5, borderRadius: 2.5, backgroundColor: colors.borderSolid }} />
				</View>
				{children}
			</Animated.View>
		</View>
	);

	// Dentro de tabs, portaleamos entre contenido y navbar para quedar por debajo de la barra.
	// El portal mueve el árbol fuera del <Drawer>, así que reinyectamos el contexto.
	if (hasTabs) {
		return (
			<Portal name="TAB_SHEET">
				<DrawerContext.Provider value={{ open, onOpenChange }}>
					{sheet}
				</DrawerContext.Provider>
			</Portal>
		);
	}
	return sheet;
}

// ─── Header / Footer / Title / Description ───────────────────────────
export function DrawerHeader({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
	return <View className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
	return <View className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

export function DrawerTitle({ className, children, ...props }: React.ComponentProps<typeof View> & { className?: string; children: React.ReactNode }) {
	return (
		<View className={cn("px-4", className)} {...props}>
			{children}
		</View>
	);
}

export function DrawerDescription({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
	return <View className={cn("px-4 text-sm text-muted-foreground", className)} {...props} />;
}

export function DrawerSwipeHandle({ className, ...props }: React.ComponentProps<typeof View> & { className?: string }) {
	return <View className={cn("mx-auto mt-2 h-1.5 w-[100px] rounded-full bg-muted", className)} {...props} />;
}
