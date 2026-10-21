import { type Href, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type {
	BusinessMemberDeliveryCardDto,
	CreateBusinessMemberDto,
} from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { Screen, ScreenHeader } from "@/src/core/ui";
import { spacing } from "@/src/core/theme/spacing";
import { toAppError } from "@/src/core/error/mapper";
import { DeliveryCardSheet } from "@/src/features/business/components/staff/DeliveryCardSheet";
import {
	StaffForm,
	type StaffFormValues,
} from "@/src/features/business/components/staff/StaffForm";
import {
	useBusinessLocations,
	useStaffMutations,
} from "@/src/features/business/hooks";

/**
 * El alta de un acceso (§9.2).
 *
 * ─── POR QUÉ LA HOJA SE MONTA AQUÍ Y NO EN EL LISTADO ──────────────────────────
 *
 * Porque la tarjeta de entrega es lo único que tiene el PIN, y el PIN se
 * entrega UNA vez. Si la pantalla del listado abriera la hoja, el PIN viajaría
 * por los parámetros de navegación —donde cualquiera que mira la pantalla lo
 * puede leer— y volvería a aparecer cada vez que se abriera el listado. Aquí
 * la hoja vive mientras la persona la está usando, y al cerrarla se vuelve al
 * listado con un `replace`: el PIN se queda en la memoria de la pantalla que
 * lo recibió y ni siquiera en la caché de React Query.
 *
 * ─── Y POR QUÉ EL ERROR SE PINTA CON LA PROSA DEL API ─────────────────────────
 *
 * Porque el API ya escribe el motivo para la persona —«Tu plan no admite otro
 * acceso»— y ese texto llega en el `AppError`. Pintar un «algo salió mal»
 * encima taparía el motivo real y dejaría a la persona sin saber qué
 * corregir; un 422 del tope del plan (`R0001`) se cuenta con sus palabras.
 */
export default function BusinessStaffNewScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";

	const { data: locations } = useBusinessLocations(businessId);
	const { create } = useStaffMutations(businessId);

	// La tarjeta vive en el ESTADO de la pantalla, no en los parámetros de la
	// ruta: por la ruta el PIN viajaría en un sitio que se puede leer.
	const [card, setCard] = useState<BusinessMemberDeliveryCardDto | null>(null);
	const [error, setError] = useState<string | null>(null);

	const save = (values: StaffFormValues) => {
		setError(null);
		const body: CreateBusinessMemberDto = {
			label: values.label,
			role: values.role,
			business_location_ids: values.business_location_ids,
			session_ttl_hours: values.session_ttl_hours,
		};
		// El alias vacío NO viaja: su ausencia es lo que le dice al servidor
		// que lo proponga.
		if (values.alias) body.alias = values.alias;

		create.mutate(body, {
			onSuccess: (deliveryCard) => setCard(deliveryCard),
			onError: (e) =>
				setError(toAppError(e, strings.business.genericError).message),
		});
	};

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			<ScreenHeader
				title={strings.business.staff.newTitle}
				fallback={`/business/${businessId}/staff`}
			/>
			<View style={styles.form}>
				<StaffForm
					locations={locations ?? []}
					submitting={create.isPending}
					error={error}
					onSubmit={save}
				/>
			</View>
			{card ? (
				<DeliveryCardSheet
					card={card}
					onClose={() =>
						router.replace(`/business/${businessId}/staff` as Href)
					}
				/>
			) : null}
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, paddingBottom: spacing.xxl },
	form: { marginTop: spacing.xl },
});
