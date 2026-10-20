import type { BusinessMemberDto } from '@0xc1x/role-commons';
import type { BusinessMemberRow } from './staff.repository';

/**
 * `business_members` + its reach → the contract's member.
 *
 * ─── POR QUÉ HACE FALTA UN MAPPER Y NO BASTA CON SELECCIONAR ──────────────────
 *
 * `BusinessMemberSchema` lleva `business_location_ids` como ARREGLO y la tabla no
 * tiene esa columna: el alcance son filas en `business_member_locations` (§4.2).
 * Sin el mapper la fila cruda no cumple el contrato, y el AGENTS de `apps/api` es
 * explícito en que por la API no sale una fila de base de datos sin pasar por
 * uno.
 *
 * ─── Y POR QUÉ ACÁ NO HAY NADA QUE DECIDIR ─────────────────────────────────────
 *
 * Los timestamps salen como ISO porque `TimestamptzSchema` es `z.string()` y
 * `businesses.mapper.ts` ya normaliza los suyos igual; el resto es copia. En
 * particular NO se omite ningún campo "por seguridad": el `alias` es el espejo
 * de `auth.users.email` y la regla de no verlo es de la CAPA DE SERVICIO (la
 * contención del `manager`), no del serializador. Un mapper que filtrara campos
 * según quién pregunta sería un segundo sitio donde vive la regla.
 */
export class StaffMapper {
  static toMemberDto(
    row: BusinessMemberRow,
    locationIds: readonly string[],
  ): BusinessMemberDto {
    return {
      id: row.id,
      business_id: row.business_id,
      user_id: row.user_id,
      role: row.role,
      label: row.label,
      alias: row.alias,
      status: row.status,
      session_ttl_hours: row.session_ttl_hours,
      business_location_ids: [...locationIds],
      last_authenticated_at: row.last_authenticated_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      deleted_at: row.deleted_at?.toISOString() ?? null,
    };
  }
}
