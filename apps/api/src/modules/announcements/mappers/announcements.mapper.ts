import type {
  AnnouncementDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from '@0xc1x/role-commons';
import type {
  AnnouncementInsert,
  AnnouncementRow,
  AnnouncementUpdate,
} from '../announcements.repository';

/**
 * `AnnouncementSchema` (el contrato) NO lleva `user_ids` ni `business_ids`, así
 * que este mapper tampoco puede devolverlas: el objeto de acá tiene la forma
 * exacta del DTO y TypeScript no deja agregar una columna de más. La razón está
 * en el contrato y es la misma que el CHECK de `priority` no está acá: la
 * policy deja leer la misma fila a muchísimos dispositivos, y mandarle a cada
 * uno la lista de todos los demás a los que el aviso apunta regala el
 * targeting del operador a quien solo debía ver el texto.
 *
 * El `severity` y el `audience_kind` no necesitan casteo: la columna de drizzle
 * los declara con la opción `enum`, que es el mismo vocabulario del contrato
 * (comparado test a test en `announcements.mapper.spec.ts`).
 */
export function toAnnouncementDto(row: AnnouncementRow): AnnouncementDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    severity: row.severity,
    audience_kind: row.audience_kind,
    priority: row.priority,
    active: row.active,
    start_at: row.start_at?.toISOString() ?? null,
    end_at: row.end_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

/**
 * Las listas de audiencia se escriben SIEMPRE, aunque vengan vacías: la columna
 * tiene `default '{}'`, y dejar que el default pague solo esconde que un
 * `specific` se publicó sin destino. Escribirlas explícitas hace que la fila
 * diga lo que el operador pidió, y `create` ya rechazó el caso sin ids.
 */
export function toAnnouncementInsert(
  dto: CreateAnnouncementDto,
): AnnouncementInsert {
  return {
    title: dto.title,
    body: dto.body,
    severity: dto.severity,
    audience_kind: dto.audience_kind,
    user_ids: dto.user_ids ?? [],
    business_ids: dto.business_ids ?? [],
    priority: dto.priority,
    active: dto.active,
    start_at: dto.start_at ? new Date(dto.start_at) : null,
    end_at: dto.end_at ? new Date(dto.end_at) : null,
  };
}

/**
 * PATCH parcial: solo lo que viene definido. La diferencia con `create` es
 * deliberada —una ventana con una sola fecha no se puede limpiar con `null`
 * implícito, y `start_at: null` explícito sí limpia— así que la presencia se
 * decide con `!== undefined` y no con truthiness.
 */
export function toAnnouncementUpdate(
  dto: UpdateAnnouncementDto,
): AnnouncementUpdate {
  const update: AnnouncementUpdate = {};
  if (dto.title !== undefined) update.title = dto.title;
  if (dto.body !== undefined) update.body = dto.body;
  if (dto.severity !== undefined) update.severity = dto.severity;
  if (dto.audience_kind !== undefined) update.audience_kind = dto.audience_kind;
  if (dto.user_ids !== undefined) update.user_ids = dto.user_ids;
  if (dto.business_ids !== undefined) update.business_ids = dto.business_ids;
  if (dto.priority !== undefined) update.priority = dto.priority;
  if (dto.active !== undefined) update.active = dto.active;
  if (dto.start_at !== undefined)
    update.start_at = dto.start_at ? new Date(dto.start_at) : null;
  if (dto.end_at !== undefined)
    update.end_at = dto.end_at ? new Date(dto.end_at) : null;
  return update;
}

export const AnnouncementMapper = {
  toDto: toAnnouncementDto,
  toInsert: toAnnouncementInsert,
  toUpdate: toAnnouncementUpdate,
};
