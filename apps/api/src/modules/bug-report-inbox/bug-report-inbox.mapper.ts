import {
  BUG_TRIAGE_STATES,
  BugReportValueSchema,
  type BugReportDetailDto,
  type BugReportListItemDto,
  type BugTriageState,
} from '@0xc1x/role-commons';
import type { StoreEntry } from '../store/app-store.repository';

/**
 * Caracteres del resumen que viajan en el listado. El texto íntegro va en el
 * detalle: aquí la tabla es una fila por reporte y el panel las muestra en un
 * monitor, no en una columna de ancho ajustado.
 */
const EXCERPT_LENGTH = 160;

/**
 * Colapsa espacios y recorta. El resumen lo escribe una persona en el teclado
 * de un móvil, así que llega con saltos de línea, y una fila de tabla no puede
 * mostrarlo crudo.
 */
function excerptOf(summary: string | null | undefined): string | null {
  if (!summary) return null;
  const flat = summary.replace(/\s+/g, ' ').trim();
  if (flat.length <= EXCERPT_LENGTH) return flat;
  return `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/**
 * `state` es `text` en la base y NO tiene CHECK: nada impide que mañana haya un
 * `'REABIERTO'` escrito a mano, por un script o por un editor. El vocabulario
 * cerrado es `BUG_TRIAGE_STATES`, y el que lo estrecha es este mapper —
 * COMPARANDO, no casteando.
 *
 * Por qué importa la diferencia: con un `as BugTriageState` el typecheck
 * callaría y llegaría al panel un estado que no sabe pintar, que es peor que
 * no triaje: se vería como un triaje real. Un estado fuera de vocabulario sale
 * `null`, igual que una fila sin triage, y el panel lo muestra como tal.
 *
 * `find` sobre la constante es lo que devuelve el tipo ya estrechado sin
 * escribir un cast: la lista es `readonly ['ABIERTO', ...]`, así que su elemento
 * es `BugTriageState` de verdad.
 */
function readState(state: StoreEntry['state']): BugTriageState | null {
  if (!state) return null;
  return BUG_TRIAGE_STATES.find((conocido) => conocido === state) ?? null;
}

/**
 * `app_store` → DTOs del buzón de reportes.
 *
 * El mapper es una LISTA BLANCA, no un filtro: nombra campo por campo lo que
 * sale. Agregar una clave a `value` no la publica, y quitar una clave del DTO no
 * deja una fuga.
 *
 * Un `...row.value` aquí publicaría `reporter_id` en el listado —PII en la
 * pantalla que el operador amplía de un vistazo, en la que más se filtra— y las
 * rutas de las capturas, que son paths de un bucket privado. Los dos van solo en
 * el detalle, y el detalle los nombra uno por uno.
 *
 * Una fila con `value` que no matchea el contrato NO lanza: sale con
 * `readable: false` y todo en `null`. Se lista vacía, no se pierde y no tumba el
 * resto del buzón. El criterio es `summary`, el ancla del schema.
 */
export class BugReportInboxMapper {
  private static read(row: StoreEntry) {
    const parsed = BugReportValueSchema.safeParse(row.value);
    return parsed.success ? parsed.data : null;
  }

  static toListItem(row: StoreEntry): BugReportListItemDto {
    const value = this.read(row);
    return {
      id: row.id,
      // `state` se estrecha contra el vocabulario y `origin` no necesita
      // estrechar: es un enum de Postgres y el tipo de la fila ya es la unión.
      state: readState(row.state),
      delivery_status: row.delivery_status,
      origin: row.origin,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      readable: value !== null,
      summary: value?.summary ?? null,
      excerpt: excerptOf(value?.summary),
    };
  }

  static toDetail(row: StoreEntry): BugReportDetailDto {
    const value = this.read(row);
    return {
      ...this.toListItem(row),
      description: value?.description ?? null,
      // `images` colapsa ausente en `[]`: el panel abre el detalle de cualquier
      // reporte y no tiene que distinguir "sin capturas" de "sin clave".
      images: value?.images ?? [],
      // PII, y en el detalle es justo donde la necesita quien investiga.
      reporter_id: value?.reporter_id ?? null,
      received_at: value?.at ?? null,
    };
  }
}
