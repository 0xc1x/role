import { useLocalSearchParams } from "expo-router";

import { StaffNewScreen } from "@/src/features/business/components/staff/StaffNewScreen";

/**
 * La RUTA del alta de un acceso.
 *
 * La pantalla vive en `src/features/` —y no aquí— porque es la parte que se
 * prueba: la ruta sólo resuelve el parámetro y se la pasa. Lo que la ruta NO
 * hace es llevar la tarjeta de entrega: el PIN jamás viaja por la navegación.
 */
export default function BusinessStaffNewRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <StaffNewScreen businessId={id ?? ""} />;
}
