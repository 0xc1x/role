import { useState } from "react";
import { router } from "expo-router";
import { Store } from "lucide-react-native";
import { View, StyleSheet } from "react-native";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";
import { strings } from "@/src/core/i18n/strings";
import { EmptyState, Screen } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { useAuthStore } from "@/src/features/auth/store";
import { performSignOut } from "@/src/features/auth/sign-out";
import { Button } from "@/components/ui/button";

/**
 * Estado "aún no tienes negocio" compartido por products/orders/management
 * (patrón NoBusinessPrompt de fudi): registrar negocio o cerrar sesión
 * (por si entró con la cuenta equivocada).
 */
export function NoBusinessPrompt() {
	const [signOutOpen, setSignOutOpen] = useState(false);
	const { colors } = useTheme();

	const confirmSignOut = () => {
		setSignOutOpen(false);
		void performSignOut();
	};

	return (
		<Screen>
			<View style={styles.container}>
				<EmptyState
					icon={<Store size={28} color={colors.primary} />}
					title={strings.business.noBusiness}
					message={strings.business.newBusinessSubtitle}
					action={
						<View style={styles.actions}>
							<Button onPress={() => router.push("/my-business/business-new")}>
								{strings.business.createBusiness}
							</Button>
							<Button variant="ghost" onPress={() => setSignOutOpen(true)}>
								{strings.auth.signOut}
							</Button>
						</View>
					}
				/>
			</View>

			<AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.auth.signOut}</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.auth.signOutConfirm}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.cancel}</Text>
						</AlertDialogCancel>
						<AlertDialogAction onPress={confirmSignOut}>
							<Text>{strings.auth.signOut}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, justifyContent: "center" },
	actions: { gap: 8, width: "100%" },
});
