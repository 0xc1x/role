import { z } from "zod";
import { UuidSchema } from "../../_common/schemas/common";
import { BusinessMemberSchema } from "./business-member.schema";

/**
 * `POST /businesses/:businessId/ownership/transfer`.
 *
 * ─── POR QUÉ UN SOLO CAMPO Y POR QUÉ `.strict()` ───────────────────────────────
 *
 * La operación es una sola: cambiar el dueño del negocio. Lo que se manda es a
 * QUIÉN se le transfiere, y el identificador es el de la MEMBRESÍA —no el de la
 * persona— porque la membresía es lo que tiene el rol, y el rol es lo que se
 * transfiere.
 *
 * `.strict()` por el motivo de `CreateBusinessMemberSchema`: un body con
 * `business_id` adentro es una puerta de atrás para transferir la propiedad de
 * otro negocio, y un body con `user_id` es una puerta de atrás para
 * transferirla a alguien que no es un acceso de este negocio. Las dos cosas son
 * un 400, no un 200 que finge haber guardado lo que el cliente creía.
 *
 * Y `new_owner_member_id` no puede ser el dueño actual: la base lo rechaza con
 * `R0004`, que la API traduce a un 422 con el motivo.
 */
export const TransferBusinessOwnershipSchema = z.strictObject({
	new_owner_member_id: UuidSchema,
});

/**
 * La respuesta de `POST …/ownership/transfer`: las dos membresías en su estado
 * nuevo.
 *
 * ─── POR QUÉ DOS MIEMBRESÍAS Y NO UNA ─────────────────────────────────────────
 *
 * Porque el que entrega y el que recibe quedan los dos con un rol nuevo, y el
 * panel tiene que poder pintar a los dos sin volver a preguntar. El dueño
 * saliente es `manager` y el receptor es `owner`.
 *
 * ─── POR QUÉ NINGUNA DE LAS DOS ES EL PIN ────────────────────────────────────
 *
 * El PIN es la contraseña del `auth.users` y se entrega UNA vez, en la tarjeta
 * de alta (`BusinessMemberDeliveryCardSchema`). Una transferencia no crea
 * cuentas ni rota PINs, así que la respuesta no lleva ninguno: es la regla del
 * §8, y que sea una aserción —y no una costumbre— es lo que la hace una regla.
 */
export const TransferBusinessOwnershipResponseSchema = z.strictObject({
	previous_owner: BusinessMemberSchema,
	new_owner: BusinessMemberSchema,
});
