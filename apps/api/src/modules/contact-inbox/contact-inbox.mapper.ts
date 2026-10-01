import {
  ContactMessageValueSchema,
  type ContactMessageDetailDto,
  type ContactMessageListItemDto,
} from '@0xc1x/role-commons';
import type { StoreEntry } from '../store/app-store.repository';

/** Caracteres del mensaje que viajan en el listado. El texto íntegro, en el detalle. */
const EXCERPT_LENGTH = 160;

/**
 * Colapsa espacios y recorta. El `message` público llega con saltos de línea y
 * una tabla de una línea por fila no puede mostrarlo crudo.
 */
function excerptOf(message: string | null | undefined): string | null {
  if (!message) return null;
  const flat = message.replace(/\s+/g, ' ').trim();
  if (flat.length <= EXCERPT_LENGTH) return flat;
  return `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/**
 * `app_store` → DTOs de la bandeja.
 *
 * El mapper es una LISTA BLANCA, no un filtro: nombra campo por campo lo que
 * sale. Agregar una clave a `value` no la publica, y quitar una clave del DTO no
 * deja una fuga. Con `to`/`from` (direcciones internas de ruteo) y `error`
 * (texto crudo del proveedor de correo) presentes en la fila, un
 * `...row.value` sería una fuga garantizada.
 *
 * Una fila con `value` que no matchea el contrato NO lanza: sale con
 * `readable: false` y todo en `null`. Se lista vacía, no se pierde y no tumba el
 * resto de la bandeja.
 */
export class ContactInboxMapper {
  private static read(row: StoreEntry) {
    const parsed = ContactMessageValueSchema.safeParse(row.value);
    return parsed.success ? parsed.data : null;
  }

  static toListItem(row: StoreEntry): ContactMessageListItemDto {
    const value = this.read(row);
    return {
      id: row.id,
      delivery_status: row.delivery_status,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      readable: value !== null,
      name: value?.name ?? null,
      email: value?.email ?? null,
      role: value?.role ?? null,
      city: value?.city ?? null,
      excerpt: excerptOf(value?.message),
    };
  }

  static toDetail(row: StoreEntry): ContactMessageDetailDto {
    const value = this.read(row);
    return {
      ...this.toListItem(row),
      message: value?.message ?? null,
      city_raw: value?.city_raw ?? null,
      city_other: value?.city_other ?? null,
      received_at: value?.at ?? null,
      ip: value?.ip ?? null,
    };
  }
}
