import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, type Href } from "expo-router";

import { strings } from "@/src/core/i18n/strings";
import { goBackOr, Screen, ScreenHeader } from "@/src/core/ui";
import { spacing } from "@/src/core/theme/spacing";
import { useAuthStore } from "@/src/features/auth/store";
import { ReportProblemSheet } from "@/src/features/bug-report/components/ReportProblemSheet";

/**
 * Ruta de raíz del buzón de reportes, alcanzable desde las dos audiencias.
 *
 * POR QUÉ NO VIVE DENTRO DE `(consumer)/profile/` ni de `(business)/management/`:
 * las dos entradas son de audiencias distintas y cada grupo tiene su `_layout`
 * con guard de rol. Una pantalla a la que las dos tienen que llegar no puede
 * quedar adentro de una de ellas —el guard de la expulsaría sin explicación—.
 * Precedente: `app/onboarding.tsx` y `app/all-offers.tsx`.
 *
 * LA RUTA ES UN SHELL: el `ScreenHeader` da el título y la salida de la ruta, y
 * el trabajo está todo en el sheet, que se abre apenas la sesión está resuelta.
 * El header queda detrás del overlay del `Drawer` mientras el sheet está
 * abierto, y es lo que el lector de pantalla encuentra si el usuario sale por
 * el gesto de atrás en vez de por el botón del sheet.
 */
export default function ReportProblemScreen() {
	const { status, initialized } = useAuthStore();
	const role = useAuthStore((s) => s.profile?.role);
	const [sheetVisible, setSheetVisible] = useState(false);

	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	useEffect(() => {
		if (initialized && status !== "guest") setSheetVisible(true);
	}, [initialized, status]);

	// Atrás depende de quién reportó: el `fallback` por defecto de
	// `ScreenHeader` es la home del consumidor y mandaría al dueño de un
	// negocio a una pantalla que no es suya.
	const fallback: Href =
		role === "business" || role === "admin"
			? "/(business)/management"
			: "/(consumer)/profile";

	if (!initialized || status === "guest") return null;

	return (
		<Screen>
			<View style={styles.header}>
				<ScreenHeader title={strings.bugReport.title} fallback={fallback} />
			</View>
			{/* Montado y desmontado, no escondido con `visible={false}`: al cerrar, el
			    estado del formulario desaparece con el nodo. Reabrir con el texto
			    del reporte anterior sin querer sería peor que reabrir vacío. */}
			{sheetVisible ? (
				<ReportProblemSheet
					visible
					onClose={() => {
						setSheetVisible(false);
						goBackOr(fallback);
					}}
				/>
			) : null}
		</Screen>
	);
}

const styles = StyleSheet.create({
	header: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
});
