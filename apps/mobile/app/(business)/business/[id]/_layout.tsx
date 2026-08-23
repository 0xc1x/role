import { Stack } from "expo-router";

/**
 * Stack interno para las sub-secciones de un negocio concreto
 * (payouts, cupones, ayuda, notificaciones, estadísticas).
 * Vive dentro del grupo de Tabs, por lo que no genera tabs adicionales.
 */
export default function BusinessIdLayout() {
	return <Stack screenOptions={{ headerShown: false }} />;
}
