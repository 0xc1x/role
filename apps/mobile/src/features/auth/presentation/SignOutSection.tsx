import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/ui/text";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { strings } from "@/src/core/i18n/strings";
import { APP_VERSION } from "@/src/core/version";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing } from "@/src/core/theme/spacing";
import { performSignOut } from "@/src/features/auth/sign-out";
import { Button } from "@/components/ui/button";

/** Diálogo de cierre de sesión + versión (compartido consumer/business). */
export function SignOutSection({ style }: { style?: object }) {
	const [open, setOpen] = useState(false);
	const { colors } = useTheme();
	const confirmSignOut = () => {
		void performSignOut();
		setOpen(false);
	};
	return (
		<View style={[styles.wrap, style]}>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogTrigger asChild>
					<Button
						variant="destructive"
						onPress={() => setOpen(true)}
					>
						{strings.profile.signOutItem}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.auth.signOut}</AlertDialogTitle>
						<AlertDialogDescription>{strings.auth.signOutConfirm}</AlertDialogDescription>
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
			<AppText
				variant="bodySmall"
				style={{ color: colors.mutedForeground, textAlign: "center" }}
			>
				{strings.settings.version} {APP_VERSION}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: spacing.sm },
});
