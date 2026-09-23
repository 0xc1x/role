import * as React from "react";
import {
	Pressable,
	type PressableProps,
	type StyleProp,
	type View,
	type ViewStyle,
} from "react-native";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { radii } from "@/src/core/theme/spacing";

type CardPressableProps = React.ComponentProps<typeof Card> &
	React.RefAttributes<View> & {
		onPress: PressableProps["onPress"];
		style?: StyleProp<ViewStyle>;
	};

/**
 * Card tappable: Pressable fuera + Card de RNR dentro.
 * No forzar flex:1 en el Card: en nativo colapsa la altura a 0
 * cuando el padre aún no tiene tamaño intrínseco.
 */
function CardPressable({
	className,
	style,
	onPress,
	...props
}: CardPressableProps) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			// className va solo al Card interior (resets p-0/border-0/...):
			// duplicarlo en el Pressable aplica layout al nivel equivocado.
			style={({ pressed }) => [
				style,
				pressed && { opacity: 0.9 },
			]}
		>
			<Card
				// Sin flex-1: el contenido (imagen 160 + body) define la altura
				className={cn(className)}
				style={[style, {borderRadius: radii.xl}]}
				{...props}
			/>
		</Pressable>
	);
}

export { CardPressable };