import {
	BusinessMemberAliasSchema,
	BusinessMemberDeliveryCardSchema,
	BusinessMemberSchema,
	businessMemberAliasWarnings,
	TransferBusinessOwnershipResponseSchema,
	UpdateBusinessMemberAliasResponseSchema,
	type BusinessMemberDeliveryCardDto,
	type BusinessMemberDto,
	type CreateBusinessMemberDto,
	type StaffAliasWarningCode,
	type TransferBusinessOwnershipResponseDto,
	type UpdateBusinessMemberAliasResponseDto,
	type UpdateBusinessMemberDto,
} from "@0xc1x/role-commons";
import { z } from "zod";

import { api } from "@/src/core/api/client";
import { Errors } from "@/src/core/error/app-error";

/**
 * Los accesos del equipo, por el API.
 *
 * ─── LA EXCEPCIÓN CONSCIENTE A ADR-0002 ──────────────────────────────────────
 *
 * El móvil consume Supabase directo y RLS es su frontera de datos (ADR-0002).
 * Pero ADMINISTRAR QUIÉN OPERA necesita reglas de negocio que viven en el
 * servidor —el tope del plan, el alcance del gerente— y que desde el cliente no
 * se pueden replicar sin mentir. Por eso esta sección habla con el API: es la
 * excepción acotada de ADR-0013 §A.1, y no se generaliza a otras consultas.
 *
 * ─── CADA RESPUESTA SE VALIDA EN LA FRONTERA ─────────────────────────────────
 *
 * Cada `2xx` se pasa por el schema de commons antes de tocar el resto de la
 * app. Un cuerpo que no cumple el contrato es una ROTURA DEL SERVIDOR, y lo
 * honesto es fallar en voz alta: un `cast` dejaría pasar un `role: "jefe"` o un
 * PIN de cinco dígitos como si fueran buenos, y el error aparecería tres
 * pantallas más abajo, en el sitio menos útil.
 *
 * ─── EL PIN NO SE GUARDA ─────────────────────────────────────────────────────
 *
 * El PIN sólo existe dentro de la tarjeta de entrega que el API devuelve, y de
 * ahí sale: no va a una clave de caché, no se registra y no se guarda en el
 * dispositivo. La tarjeta se la queda la pantalla que la muestra, una vez.
 */

/** La ruta base de las ocho rutas del equipo (§8). */
function staffPath(businessId: string): string {
	return `/businesses/${businessId}/staff`;
}

/** La ruta de UN acceso: la misma base más el identificador de la membresía. */
function memberPath(businessId: string, memberId: string): string {
	return `${staffPath(businessId)}/${memberId}`;
}

/**
 * El alias tiene que ser un correo antes de salir del dispositivo.
 *
 * El alias espeja `auth.users.email` y es con lo que la persona entra, así que
 * mandarle al servidor algo que GoTrue no aceptaría produce un alta que falla
 * en la base: un 400 que era evitable desde el propio formulario. La validación
 * es la del contrato (`BusinessMemberAliasSchema` es `z.email()`), no una más
 * laxa del cliente.
 *
 * ─── Y POR QUÉ ES UN `validation` Y NO UN `unknown` ───────────────────────────
 *
 * Porque el error es de FORMA y la persona puede corregirlo: la taxonomía
 * guarda esa categoría para el dato que el dueño escribió mal, y el mensaje
 * que sale es el de la taxonomía —no una prosa técnica del servidor—.
 */
function assertAlias(alias: string): string {
	const parsed = BusinessMemberAliasSchema.safeParse(alias);
	if (!parsed.success) throw Errors.validation();
	return parsed.data;
}

/**
 * Los avisos de dominio de un alias.
 *
 * Es un ENVOLTORIO, no una reimplementación: la pregunta «¿este dominio tiene
 * una bandeja detrás?» la contesta `businessMemberAliasWarnings` de commons, y
 * esa respuesta es la misma que viaja en `alias_warnings` de la respuesta del
 * API. Copiar el predicado acá sería tener dos verdades sobre la misma regla:
 * una que puede derivar de la otra sin que nadie se entere.
 *
 * Los formularios de alta y de edición (Tasks 8 y 9) llaman a ESTA función para
 * anticipar el aviso; lo que el API responde después es la autoridad.
 */
export function aliasWarnings(alias: string): StaffAliasWarningCode[] {
	return businessMemberAliasWarnings(alias);
}

export const staffRepository = {
	/**
	 * `GET /businesses/:businessId/staff` — los accesos del negocio.
	 *
	 * La respuesta es un ARREGLO PELADO: el API no envuelve la lista en un
	 * objeto, y por eso el schema que la valida es el del arreglo y no el de
	 * una envoltura. Un `manager` recibe sólo los accesos que administra, y el
	 * filtro es del servidor.
	 */
	async list(businessId: string): Promise<BusinessMemberDto[]> {
		const body = await api.get<unknown>(staffPath(businessId));
		return z.array(BusinessMemberSchema).parse(body);
	},

	/**
	 * `POST /businesses/:businessId/staff` — el alta, y la tarjeta de entrega.
	 *
	 * El cuerpo NO lleva `business_id`: lo trae la ruta, y un cuerpo que
	 * pudiera contradecirla sería una puerta de atrás para dar de alta un
	 * acceso en otro negocio.
	 *
	 * ─── Y EL ALIAS QUE NO VIENE ──────────────────────────────────────────────
	 *
	 * Si el cuerpo NO trae alias, el servidor lo genera —«{código}@{slug}.role.ec»
	 * — y esta llamada no lo inventa. Un alias presente, en cambio, se valida
	 * acá: si no es un correo, el error es del formulario y sale antes de la
	 * red, no después de un 400 del servidor.
	 */
	async create(
		businessId: string,
		body: CreateBusinessMemberDto,
	): Promise<BusinessMemberDeliveryCardDto> {
		if (body.alias !== undefined) assertAlias(body.alias);
		const response = await api.post<unknown>(staffPath(businessId), body);
		return BusinessMemberDeliveryCardSchema.parse(response);
	},

	/**
	 * `PATCH /businesses/:businessId/staff/:memberId` — rol, alcance y política
	 * de sesión. Ni el estado, ni el alias, ni el nombre: cada uno tiene su
	 * ruta (`disable` / `enable`, `alias`) o no tiene ninguna.
	 */
	async update(
		businessId: string,
		memberId: string,
		body: UpdateBusinessMemberDto,
	): Promise<BusinessMemberDto> {
		const response = await api.patch<unknown>(
			memberPath(businessId, memberId),
			body,
		);
		return BusinessMemberSchema.parse(response);
	},

	/**
	 * `PATCH /businesses/:businessId/staff/:memberId/alias` — el alias y el
	 * correo que espeja, en una sola operación.
	 *
	 * El alias SIEMPRE se valida acá, no sólo cuando viene del formulario: es
	 * la credencial con la que la persona entra, y un valor inválido que sale
	 * del dispositivo es un 400 del servidor con el que nadie puede hacer nada.
	 *
	 * La respuesta trae `alias_warnings`: el aviso del §9.4 viaja con el dato,
	 * porque es parte de la respuesta y no un adorno de la app.
	 */
	async updateAlias(
		businessId: string,
		memberId: string,
		alias: string,
	): Promise<UpdateBusinessMemberAliasResponseDto> {
		const validAlias = assertAlias(alias);
		const response = await api.patch<unknown>(
			`${memberPath(businessId, memberId)}/alias`,
			{ alias: validAlias },
		);
		return UpdateBusinessMemberAliasResponseSchema.parse(response);
	},

	/**
	 * `POST /businesses/:businessId/staff/:memberId/rotate` — un PIN nuevo, y
	 * nada más.
	 *
	 * NO cierra las sesiones abiertas: pausar es la operación que lo hace, y
	 * las dos se nombran distinto a propósito. Y el cuerpo va vacío: el PIN lo
	 * genera el servidor, así que un `pin` aquí sería una puerta de atrás para
	 * que el cliente escoja su propia credencial.
	 */
	async rotate(
		businessId: string,
		memberId: string,
	): Promise<BusinessMemberDeliveryCardDto> {
		const response = await api.post<unknown>(
			`${memberPath(businessId, memberId)}/rotate`,
		);
		return BusinessMemberDeliveryCardSchema.parse(response);
	},

	/**
	 * `POST /businesses/:businessId/staff/:memberId/disable` — pausa el acceso
	 * y corta sus sesiones abiertas.
	 *
	 * NO es una baja: la fila se queda, para que «quién estaba aquí» siga
	 * teniendo respuesta.
	 */
	async disable(
		businessId: string,
		memberId: string,
	): Promise<BusinessMemberDto> {
		const response = await api.post<unknown>(
			`${memberPath(businessId, memberId)}/disable`,
		);
		return BusinessMemberSchema.parse(response);
	},

	/** `POST /businesses/:businessId/staff/:memberId/enable`: lo mismo, al revés. */
	async enable(
		businessId: string,
		memberId: string,
	): Promise<BusinessMemberDto> {
		const response = await api.post<unknown>(
			`${memberPath(businessId, memberId)}/enable`,
		);
		return BusinessMemberSchema.parse(response);
	},

	/**
	 * `DELETE /businesses/:businessId/staff/:memberId` — la baja del acceso.
	 *
	 * Es irreversible: el alias no vuelve a la bolsa. Y el API responde un 204
	 * sin cuerpo, así que acá no hay nada que leer —ni que adivinar.
	 */
	async remove(businessId: string, memberId: string): Promise<void> {
		await api.delete<void>(memberPath(businessId, memberId));
	},

	/**
	 * `POST /businesses/:businessId/ownership/transfer` — la propiedad del
	 * negocio cambia de manos.
	 *
	 * ─── POR QUÉ NO VA BAJO `/staff` ──────────────────────────────────────────
	 *
	 * Porque no es del equipo: es de la PROPIEDAD. El prefijo de la ruta dice
	 * de qué trata, y esta es otra cosa —cambia quién es el dueño, no qué
	 * accesos hay—. Por eso el cuerpo lleva `new_owner_member_id`: el
	 * identificador de la MEMBRESÍA, no el de la persona, porque la membresía
	 * es lo que tiene el rol.
	 */
	async transferOwnership(
		businessId: string,
		memberId: string,
	): Promise<TransferBusinessOwnershipResponseDto> {
		const response = await api.post<unknown>(
			`/businesses/${businessId}/ownership/transfer`,
			{ new_owner_member_id: memberId },
		);
		return TransferBusinessOwnershipResponseSchema.parse(response);
	},
};
