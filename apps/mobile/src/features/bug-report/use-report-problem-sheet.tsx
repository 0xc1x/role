import { useCallback, useState, type ReactNode } from "react";

import { ReportProblemSheet } from "./components/ReportProblemSheet";

/**
 * El dueño del `ReportProblemSheet`: lo abre la fila del menú y lo monta la
 * misma pantalla que lo abrió.
 *
 * POR QUÉ NO ES UNA RUTA: el `Drawer` se portaliza a un host que tiene que estar
 * montado POR ENCIMA de la pantalla que lo pidió, y los hosts (`TAB_SHEET`)
 * viven adentro de los layouts de tabs. Una ruta de raíz —que en el `<Stack>`
 * cuelga al lado de los grupos, como era `app/report-problem.tsx`— no tiene
 * ninguno: la hoja se portalizaba a la pantalla de tabs que ya estaba tapada y
 * el usuario veía una página vacía con el título del buzón, sin ver la hoja
 * nunca. Montada desde la pantalla visible, el host es el correcto, que es lo
 * mismo que ya hacen `OfferFiltersSheet` y `ProductForm`.
 *
 * Montado y desmontado, no escondido con `visible={false}`: al cerrar, el estado
 * del formulario desaparece con el nodo. Reabrir con el texto del reporte
 * anterior sin querer sería peor que reabrir vacío.
 *
 * NO decide quién puede reportar: las dos pantallas que lo montan ya son
 * pantallas de sesión iniciada con su propio guard —el perfil del consumidor
 * expulsa al invitado y el panel del negocio tiene el guard de rol—, así que acá
 * no hay redirect a `/login`. El que lo tenía era el de la ruta, y solo lo
 * necesitaba la ruta: desde adentro de la app no hay a quién expulsar.
 */
export function useReportProblemSheet(): {
	openReportProblem: () => void;
	reportProblemSheet: ReactNode;
} {
	const [open, setOpen] = useState(false);
	const openReportProblem = useCallback(() => setOpen(true), []);
	const closeReportProblem = useCallback(() => setOpen(false), []);
	return {
		openReportProblem,
		reportProblemSheet: open ? (
			<ReportProblemSheet visible onClose={closeReportProblem} />
		) : null,
	};
}
