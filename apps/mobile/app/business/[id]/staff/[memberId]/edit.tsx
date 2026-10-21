import { useLocalSearchParams } from "expo-router";

import { StaffEditScreen } from "@/src/features/business/components/staff/StaffEditScreen";

/**
 * La RUTA de la edición de un acceso.
 *
 * La pantalla vive en `src/features/` —y no aquí— porque es la parte que se
 * prueba: la ruta sólo resuelve los dos parámetros y se los pasa. El nombre
 * del acceso NO viaja por la navegación: es un dato que se lee de la lista.
 */
export default function BusinessStaffEditRoute() {
	const { id, memberId } = useLocalSearchParams<{
		id: string;
		memberId: string;
	}>();
	return <StaffEditScreen businessId={id ?? ""} memberId={memberId ?? ""} />;
}
