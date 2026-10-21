import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { toast } from "sonner-native";

import type {
	StaffAliasWarningCode,
	UpdateBusinessMemberDto,
} from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { AppText, ErrorState, Screen, ScreenHeader } from "@/src/core/ui";
import { spacing, radii } from "@/src/core/theme/spacing";
import { toAppError } from "@/src/core/error/mapper";
import { Errors } from "@/src/core/error/app-error";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useBusinessLocations,
	useStaffMembers,
	useStaffMutations,
} from "@/src/features/business/hooks";
import { StaffForm, type StaffFormValues } from "./StaffForm";

/**
 * La edición de un acceso (§9.2).
 *
 * ─── POR QUÉ DOS LLAMADAS Y EN ESTE ORDEN ────────────────────────────────────
 *
 * Porque son DOS datos y son DOS rutas: el rol, el alcance y la política de
 * sesión van en `PATCH …/:memberId`, y el alias va en `PATCH …/:memberId/alias`
 * porque cambiarlo cambia el correo de `auth.users` y trae su propio aviso
 * (§9.4). Primero la que no depende de la segunda: si el rol o el alcance se
 * rechazan, el alias no se toca —y si el alias falla, el rol y el alcance ya
 * están guardados y NO se revierten: son datos independientes.
 *
 * ─── Y POR QUÉ EL NOMBRE NO VIAJA ────────────────────────────────────────────
 *
 * Porque el `UpdateBusinessMemberSchema` es estricto y no acepta un `label`:
 * mandarlo sería un 400 que dice «este campo no existe». El nombre se MUESTRA
 * —es el que el dueño presentó— pero no se renombra: ninguna de las nueve
 * rutas del §8 lo hace.
 *
 * ─── Y POR QUÉ EL ÉXITO NO SE NAVEGA ─────────────────────────────────────────
 *
 * Porque la pantalla se queda con el aviso del §9.4 —el que devolvió el API
 * con el alias— y con el formulario abierto, para que quien edita vea lo que
 * acaba de pasar. Quien quiere salir, sale con el botón de atrás de la
 * cabecera.
 *
 * ─── Y POR QUÉ EL DUEÑO NO SE EDITA ──────────────────────────────────────────
 *
 * Porque la propiedad del negocio no se cambia editando un acceso: se
 * transfiere (la Task 13), y el API rechaza (`R0002`) un cambio de rol sobre
 * el dueño. Ofrecer un formulario que el servidor va a rechazar sería mandar
 * a la persona a leer un error por una opción que le ofreció la propia app.
 */
export function StaffEditScreen({
	businessId,
	memberId,
}: {
	businessId: string;
	memberId: string;
}) {
	const {
		data: locations,
		isLoading: locationsLoading,
		isError: locationsError,
		error: locationsErrorValue,
		refetch: refetchLocations,
	} = useBusinessLocations(businessId);
	// El acceso se busca EN LA LISTA: no hay una ruta que devuelva un acceso
	// suelto, y la lista es la lectura que el API ya le hace a este dueño.
	const {
		data: members,
		isLoading: membersLoading,
		isError: membersError,
		error: membersErrorValue,
		refetch: refetchMembers,
	} = useStaffMembers(businessId);
	const { update, updateAlias } = useStaffMutations(businessId);

	// El error de la EDICIÓN —no el de las consultas—: vive en la pantalla
	// porque la mutación lo suelta al reintentarse.
	const [error, setError] = useState<string | null>(null);
	// Los avisos del §9.4 que CONTESTÓ EL API: los pinta el formulario, y en
	// modo edición el cliente no calcula ninguno.
	const [aliasWarnings, setAliasWarnings] = useState<StaffAliasWarningCode[]>(
		[],
	);
	// El alias con el que el servidor CONTESTÓ esos avisos: los avisos son de
	// un alias, y si la persona escribe otro el aviso ya no habla de lo que
	// hay escrito.
	const [aliasWarningsFor, setAliasWarningsFor] = useState<string | undefined>(
		undefined,
	);
	// El alias con el que el acceso está AHORA.
	//
	// Vive en estado y no se lee del `member` de vivo porque la lista se
	// vuelve a leer sola después de cada guardado y su respuesta puede
	// tardar: comparar contra el alias de la lista haría que un segundo
	// guardado —antes de que llegue la respuesta— reenviara el alias que ya
	// se guardó.
	const [savedAlias, setSavedAlias] = useState<string | null>(null);

	const isLoading = locationsLoading || membersLoading;
	const isError = locationsError || membersError;
	const member = members?.find((m) => m.id === memberId) ?? null;
	// El alias con el que está el acceso: el guardado, si hubo uno; el de la
	// lista, si no.
	const currentAlias = savedAlias ?? member?.alias ?? "";

	const header = (
		<ScreenHeader
			title={strings.business.staff.editTitle}
			fallback={`/business/${businessId}/staff`}
		/>
	);

	const save = (values: StaffFormValues) => {
		if (!member) return;
		setError(null);
		setAliasWarnings([]);
		setAliasWarningsFor(undefined);

		// El cuerpo es EXACTAMENTE el del `UpdateBusinessMemberSchema`: el rol,
		// la política de sesión y el alcance. Ni el nombre —que no se renombra—
		// ni el alias —que tiene su propia ruta—.
		//
		// El alcance puede viajar VACÍO: el acceso ya existe y puede no
		// alcanzar ninguna sucursal (§5.1), y obligar a marcar una sería
		// regalar un permiso sin que nadie lo pidiera.
		const body: UpdateBusinessMemberDto = {
			role: values.role,
			session_ttl_hours: values.session_ttl_hours,
			business_location_ids: values.business_location_ids,
		};

		// El alias sólo se manda si CAMBIÓ: repetirlo sería una escritura por
		// nada, y —peor— cambiaría el correo de `auth.users` sin que nadie lo
		// pidiera.
		const alias = values.alias?.trim() ?? "";
		const aliasChanged = alias !== "" && alias !== currentAlias;

		update.mutate(
			{ memberId, body },
			{
				onSuccess: () => {
					if (!aliasChanged) {
						toast.success(strings.business.staff.editSaved);
						return;
					}
					updateAlias.mutate(
						{ memberId, alias },
						{
							onSuccess: (response) => {
								// El aviso del §9.4 lo cuenta el API: se pinta lo
								// que él devolvió, no lo que el cliente opinaba.
								setAliasWarnings(response.alias_warnings);
								setAliasWarningsFor(alias);
								// El alias guardado es el que hay a partir de
								// ahora: un segundo guardado no lo reenvía.
								setSavedAlias(alias);
								toast.success(strings.business.staff.editSaved);
							},
							onError: (e) =>
								setError(toAppError(e, strings.business.genericError).message),
						},
					);
				},
				onError: (e) =>
					setError(toAppError(e, strings.business.genericError).message),
			},
		);
	};

	// Un negocio o un acceso sin identificador es un NEGOCIO O ACCESO QUE NO
	// ESTÁ: las consultas están apagadas, así que no hay cargando ni fallando
	// —hay nada—.
	if (!businessId || !memberId) {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<ErrorState error={Errors.notFound()} />
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
							key={`staff-edit-skeleton-${index}`}
							style={styles.skeletonCard}
						/>
					))}
					<Skeleton style={styles.skeletonButton} />
				</View>
			</Screen>
		);
	}

	if (isError) {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<ErrorState
					error={locationsError ? locationsErrorValue : membersErrorValue}
					onRetry={() => {
						// Se reintenta lo que falló: las dos consultas son
						// independientes y las dos pueden haber caído.
						if (locationsError) void refetchLocations();
						if (membersError) void refetchMembers();
					}}
				/>
			</Screen>
		);
	}

	// El acceso no está en la lista: no hay nada que editar, y decirlo con el
	// error de la taxonomía es mejor que un formulario vacío.
	if (!member) {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<ErrorState error={Errors.notFound()} />
			</Screen>
		);
	}

	// El dueño no se edita: la propiedad se TRANSFIERE (Task 13). Aquí no hay
	// formulario que ofrecer.
	if (member.role === "owner") {
		return (
			<Screen scroll contentContainerStyle={styles.container}>
				{header}
				<View style={styles.notice}>
					<AppText variant="bodyMedium">
						{strings.business.staff.ownerNotEditable}
					</AppText>
				</View>
			</Screen>
		);
	}

	return (
		<Screen scroll contentContainerStyle={styles.container}>
			{header}
			<View style={styles.form}>
				<StaffForm
					locations={locations ?? []}
					initial={{
						label: member.label,
						role: member.role,
						business_location_ids: member.business_location_ids,
						session_ttl_hours: member.session_ttl_hours,
						alias: member.alias,
					}}
					aliasWarnings={aliasWarnings}
					aliasWarningsFor={aliasWarningsFor}
					submitting={update.isPending || updateAlias.isPending}
					error={error}
					onSubmit={save}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, paddingBottom: spacing.xxl },
	form: { marginTop: spacing.xl },
	notice: { marginTop: spacing.xl },
	loading: { marginTop: spacing.xl, gap: spacing.md },
	skeletonCard: { height: 132, borderRadius: radii.lg },
	skeletonButton: { height: 48, borderRadius: radii.md },
});
