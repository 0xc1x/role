import { buttonTextVariants, buttonVariants } from "@/components/ui/button";
import { NativeOnlyAnimatedView } from "@/components/ui/native-only-animated-view";
import { TextClassContext } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useTheme } from "@/src/core/theme";
import * as AlertDialogPrimitive from "@rn-primitives/alert-dialog";
import * as React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";
import { FullWindowOverlay as RNFullWindowOverlay } from "react-native-screens";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const FullWindowOverlay =
	Platform.OS === "ios" ? RNFullWindowOverlay : React.Fragment;

/**
 * El `z-index` de la ventana de confirmación.
 *
 * ─── POR QUÉ 1100 Y NO 50 ─────────────────────────────────────────────────────
 *
 * Porque el diálogo se abre ENCIMA de una hoja —la de acciones del equipo— y
 * los dos se portalean al MISMO host: en `@rn-primitives/portal` el `name` del
 * portal es sólo la clave dentro del host, así que la hoja y el diálogo
 * compiten como hermanos. La hoja pone su fondo en `zIndex: 1000` y su panel
 * en `zIndex: 1001` (`src/components/ui/drawer.tsx`): con el `z-50` de
 * Tailwind, la hoja se pintaba encima del diálogo —su fondo atenuaba la
 * ventana y se comía el toque de «confirmar», que cerraba la hoja en vez de
 * confirmar—.
 *
 * ─── Y POR QUÉ EN iOS NO HACÍA FALTA ──────────────────────────────────────────
 *
 * Porque en iOS el diálogo se apoya en `FullWindowOverlay`
 * (`react-native-screens`), que lo pone por encima de la pantalla entera. En
 * Android y en web ese apoyo no existe —ahí `FullWindowOverlay` es un
 * fragmento— y el orden lo decide el `z-index`. Por eso el número va aquí y
 * no en una clase: tiene que ganarle al de la hoja en las TRES plataformas.
 */
const ALERT_DIALOG_Z_INDEX = 1100;

function AlertDialogOverlay({
	className,
	children,
	style,
	...props
}: Omit<
	React.ComponentProps<typeof AlertDialogPrimitive.Overlay>,
	"asChild"
> & {
	children?: React.ReactNode;
}) {
	return (
		<FullWindowOverlay>
			<AlertDialogPrimitive.Overlay
				className={cn(
					"absolute bottom-0 left-0 right-0 top-0 flex items-center justify-center bg-black/50 p-2",
					Platform.select({
						web: "animate-in fade-in-0 fixed",
					}),
					className,
				)}
				{...props}
				// El `z-index` va en el estilo y no en la clase, y va al
				// final: es lo que tiene que ganarle al de la hoja.
				style={[{ zIndex: ALERT_DIALOG_Z_INDEX }, style]}
				asChild={Platform.OS !== "web"}
			>
				<NativeOnlyAnimatedView
					entering={FadeIn.duration(200)
						.delay(50)
						.reduceMotion(ReduceMotion.System)}
					exiting={FadeOut.duration(150).reduceMotion(ReduceMotion.System)}
					as="Pressable"
				>
					{children}
				</NativeOnlyAnimatedView>
			</AlertDialogPrimitive.Overlay>
		</FullWindowOverlay>
	);
}

function AlertDialogContent({
	className,
	portalHost,
	style,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
	portalHost?: string;
}) {
	const { colors } = useTheme();
	return (
		<AlertDialogPortal hostName={portalHost}>
			<AlertDialogOverlay>
				<AlertDialogPrimitive.Content
					className={cn(
						"bg-background border-border z-50 flex w-full max-w-[calc(100%-2rem)] flex-col gap-4 rounded-lg border p-6 shadow-lg shadow-black/5 sm:max-w-lg",
						Platform.select({
							web: "animate-in fade-in-0 zoom-in-95 duration-200",
						}),
						className,
					)}
					// Native tokens: bg-background/border-border vars stay light on native.
					style={StyleSheet.flatten([
						{
							backgroundColor: colors.background,
							borderColor: colors.borderSolid,
						},
						style,
					])}
					{...props}
				/>
			</AlertDialogOverlay>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({ className, ...props }: ViewProps) {
	return (
		<TextClassContext.Provider value="text-center sm:text-left">
			<View className={cn("flex flex-col gap-2", className)} {...props} />
		</TextClassContext.Provider>
	);
}

function AlertDialogFooter({ className, ...props }: ViewProps) {
	return (
		<View
			className={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
	return (
		<AlertDialogPrimitive.Title
			className={cn("text-foreground text-lg font-semibold", className)}
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
	return (
		<AlertDialogPrimitive.Description
			className={cn("text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	style,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
	const { colors } = useTheme();
	return (
		<TextClassContext.Provider value={buttonTextVariants({ className })}>
			<AlertDialogPrimitive.Action
				className={cn(buttonVariants(), className)}
				// Native token: default variant fill (text via Text mapper above).
				style={StyleSheet.flatten([{ backgroundColor: colors.primary }, style])}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

function AlertDialogCancel({
	className,
	style,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
	const { colors } = useTheme();
	return (
		<TextClassContext.Provider
			value={buttonTextVariants({ className, variant: "outline" })}
		>
			<AlertDialogPrimitive.Cancel
				className={cn(buttonVariants({ variant: "outline" }), className)}
				// Native tokens: outline variant fill + border.
				style={StyleSheet.flatten([
					{
						backgroundColor: colors.inputBackground,
						borderColor: colors.borderSolid,
					},
					style,
				])}
				{...props}
			/>
		</TextClassContext.Provider>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
