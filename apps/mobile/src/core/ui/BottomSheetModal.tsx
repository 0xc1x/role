import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "./AppText";
import { useTheme } from "@/core/theme";
import { radii, spacing } from "@/core/theme/spacing";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";

/**
 * Compat wrapper — mantiene la API existente (`title`/`footer`/`onClose`)
 * pero delega 1:1 en el `Drawer` único portado de `apps/admin`.
 * Así no hay bifurcación web/native: un solo componente, sin `Platform.OS`.
 */
export function BottomSheetModal({
	title,
	footer,
	onClose,
	children,
}: {
	title?: string;
	footer?: ReactNode;
	onClose: () => void;
	children: ReactNode;
}) {
	const { colors } = useTheme();
	return (
		<Drawer open onOpenChange={(open) => !open && onClose()}>
			<DrawerContent>
				{title ? (
					<DrawerHeader>
						<View
							style={{
								flexDirection: "row",
								alignItems: "center",
								justifyContent: "space-between",
							}}
						>
							<DrawerTitle>
								<AppText variant="h3" weight="bold">
									{title}
								</AppText>
							</DrawerTitle>
							<DrawerClose
								style={{
									width: 32,
									height: 32,
									borderRadius: radii.md,
									alignItems: "center",
									justifyContent: "center",
									backgroundColor: colors.inputBackground,
								}}
							>
								<Ionicons name="close" size={16} color={colors.foreground} />
							</DrawerClose>
						</View>
					</DrawerHeader>
				) : null}
				{/* Body con scroll: el contenido largo (ej. formulario de
				dirección) hace scroll sin tapar el footer. El sheet sigue
				cerrándose por arrastre desde la barrita del Drawer. */}
				<ScrollView
					style={{ flex: 1 }}
					contentContainerStyle={{
						gap: spacing.sm,
						paddingHorizontal: spacing.xl,
						paddingBottom: spacing.md,
					}}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={false}
				>
					{children}
				</ScrollView>
				<DrawerFooter style={{ paddingHorizontal: spacing.md, paddingTop: 6 }}>
					{footer ? (footer) : null}
				</DrawerFooter>
				
			</DrawerContent>
		</Drawer>
	);
}
