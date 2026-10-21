import { type Href, router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import type { CreateBusinessMemberDto } from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { ErrorState, Screen, ScreenHeader } from "@/src/core/ui";
import { spacing, radii } from "@/src/core/theme/spacing";
import { toAppError } from "@/src/core/error/mapper";
import { Errors } from "@/src/core/error/app-error";
import { Skeleton } from "@/components/ui/skeleton";
import { DeliveryCardSheet } from "./DeliveryCardSheet";
import { StaffForm, type StaffFormValues } from "./StaffForm";
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
 * listado con un `replace`.
 *
 * ─── Y POR QUÉ EL PIN NO VIAJA EN NINGÚN RÓTULO ───────────────────────────────
 *
 * Porque la ruta es legible: va en el historial, en los logs y en el botón de
 * atrás. El PIN se queda en el estado de la mutación —que es memoria de la
 * pantalla— y `create.reset()` lo suelta al cerrar la hoja. Ni los parámetros
 * de navegación ni el estado de la ruta llevan nunca la tarjeta.
 *
 * ─── Y POR QUÉ EL ERROR SE PINTA CON LA PROSA DEL API ─────────────────────────
 *
 * Porque el API ya escribe el motivo para la persona —«Tu plan no admite otro
 * acceso»— y ese texto llega en el `AppError`. Pintar un «algo salió mal»
 * encima taparía el motivo real y dejaría a la persona sin saber qué
 * corregir; un 422 del tope del plan (`R0001`) se cuenta con sus palabras.
 *
 * ─── Y POR QUÉ LAS SUCURSALES TIENEN TRES ESTADOS Y NO UNO ───────────────────
 *
 * Porque un fallo de la consulta NO es «este negocio no tiene sucursales»:
 * es un fallo, y decirlo como un hecho del negocio sería mentirle. Con la
 * consulta viva se pinta un esqueleto; si falla, se pinta el error con su
 * reintento; y sólo cuando llega una lista vacía se puede decir que el
 * negocio no tiene sucursales.
 *
 * ─── Y POR QUÉ LA HOJA NO DEPENDE DE LAS SUCURSALES ──────────────────────────
 *
 * Porque la hoja de entrega es lo único que tiene el PIN, y el PIN no se
 * puede volver a pedir. La consulta de sucursales es COMPARTIDA con la
 * pantalla del listado, así que un reintento en segundo plano que falle la
 * dejaría en error con los datos ya en memoria: si la hoja viviera dentro
 * del estado de éxito, ese fallo reemplazaría la tarjeta por un error de
 * sucursales y el PIN se perdería sin que nadie lo hubiera visto. Por eso la
 * hoja se monta fuera de los estados de la consulta.
 */
export function StaffNewScreen({ businessId }: { businessId: string }) {
	const {
		data: locations,
		isLoading,
		isError,
		error: locationsError,
		refetch,
	} = useBusinessLocations(businessId);
	const { create } = useStaffMutations(businessId);

	// El error del ALTA —no el de las sucursales—: vive en la pantalla porque
	// la mutación lo suelta al reintentarse.
	const [error, setError] = useState<string | null>(null);

	// La tarjeta sale del ESTADO DE LA MUTACIÓN y no de otro `useState`: así
	// hay una sola copia del PIN en la pantalla, y `create.reset()` la suelta
	// entera. Lo que se guarda en el estado local se puede olvidar; lo que
	// guarda la mutación, no.
	const card = create.data ?? null;

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
			onError: (e) =>
				setError(toAppError(e, strings.business.genericError).message),
		});
	};

	const closeSheet = () => {
		// Se suelta la tarjeta antes de irse: el PIN no queda en el estado de
		// la mutación esperando a que alguien vuelva a esta pantalla.
		create.reset();
		router.replace(`/business/${businessId}/staff` as Href);
	};

	const header = (
		<ScreenHeader
			title={strings.business.staff.newTitle}
			fallback={`/business/${businessId}/staff`}
		/>
	);

	// La hoja se monta FUERA de los estados de las sucursales: depende sólo
	// de la tarjeta y del cierre. Si viviera dentro del estado de éxito, un
	// reintento de la consulta que fallara —el que dispara un `visibility
	// change` con la pantalla en primer plano— reemplazaría la hoja por un
	// error de las sucursales y el PIN se perdería sin copia de nadie.
	const sheet = card ? (
		<DeliveryCardSheet card={card} onClose={closeSheet} />
	) : null;

	// Un negocio sin identificador es un NEGOCIO QUE NO ESTÁ: la consulta
	// está apagada, así que no hay cargando ni fallando —hay nada— y sin este
	// caso el formulario se pintaría con cero sucursales y le diría a la
	// persona que este negocio no tiene sucursales. No hay reintento porque no
	// hay nada que reintentar: lo que falta es la ruta.
	if (!businessId) {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<ErrorState error={Errors.notFound()} />
				{sheet}
			</Screen>
		);
	}

	if (isLoading) {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<View style={styles.loading}>
					{[0, 1, 2, 3].map((index) => (
						<Skeleton
							key={`staff-form-skeleton-${index}`}
							style={styles.skeletonCard}
						/>
					))}
					<Skeleton style={styles.skeletonButton} />
				</View>
				{sheet}
			</Screen>
		);
	}

	if (isError) {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<ErrorState error={locationsError} onRetry={() => void refetch()} />
				{sheet}
			</Screen>
		);
	}

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			{header}
			<View style={styles.form}>
				<StaffForm
					locations={locations ?? []}
					submitting={create.isPending}
					error={error}
					onSubmit={save}
				/>
			</View>
			{sheet}
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, paddingBottom: spacing.xxl },
	form: { marginTop: spacing.xl },
	loading: { marginTop: spacing.xl, gap: spacing.md },
	skeletonCard: { height: 132, borderRadius: radii.lg },
	skeletonButton: { height: 48, borderRadius: radii.md },
});
