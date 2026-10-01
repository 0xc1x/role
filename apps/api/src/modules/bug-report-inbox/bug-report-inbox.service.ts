import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import {
  BUG_TRIAGE_STATES,
  paginatedDataFromQuery,
  type BugReportDetailDto,
  type BugReportPaginatedData,
  type BugTriageState,
  type ListBugReportsQuery,
} from '@0xc1x/role-commons';
import type { Env } from '../../config/env.schema';
import type { StoreEntry } from '../store/app-store.repository';
import { AppStoreRepository } from '../store/app-store.repository';
import {
  BUG_REPORT_IMAGES_BUCKET,
  BUG_REPORT_IMAGE_URL_TTL_SECONDS,
  BUG_REPORT_NAMESPACE,
} from './bug-report-inbox.constants';
import { BugReportInboxMapper } from './bug-report-inbox.mapper';

/** Bandeja de triaje de reportes de error. Admin-only (lo aplica `@Roles('admin')`). */
@Injectable()
export class BugReportInboxService {
  /**
   * Cliente de SUPABASE STORAGE con service role, como el de `upload.service` y
   * `businesses.service`: es la única credencial que puede firmar una URL de un
   * bucket privado. No va en el constructor porque el listado no lo necesita y
   * un cliente por instancia es un cliente por buzón: se construye la primera
   * vez que alguien abre un detalle con capturas.
   */
  private storage: ReturnType<typeof createClient>['storage'] | null = null;

  constructor(
    private readonly store: AppStoreRepository,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(query: ListBugReportsQuery): Promise<BugReportPaginatedData> {
    const { rows, total } = await this.store.list({
      namespace: BUG_REPORT_NAMESPACE,
      state: query.state,
      origin: query.origin,
      page: query.page,
      limit: query.limit,
    });
    return paginatedDataFromQuery(
      rows.map((row) => BugReportInboxMapper.toListItem(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * El detalle, con las capturas firmadas.
   *
   * FIRMAR ACÁ Y NO EN EL MAPPER porque el mapper es puro y sin DI, y una firma
   * es una llamada de red con una credencial: mezclarla ahí volvería al mapper
   * imposible de probar sin Supabase ymeter en el medio. Además el bucket es una
   * constante del servidor, así que la firma nunca usa un bucket que venga de
   * `value`.
   */
  async getById(id: string): Promise<BugReportDetailDto> {
    const row = await this.requireBugReportRow(id);
    return this.withSignedImages(row);
  }

  /**
   * Mueve el eje de triaje: qué hizo el equipo con el reporte.
   *
   * LO QUE NO ES: mover la entrega. `delivery_status` lo mueve el camino
   * público de `POST /contact` cuando se entrega el correo de aviso, y un
   * reporte de errores no tiene camino de correo (D8), así que su badge de
   * entrega NO significa "el equipo fue notificado" como en la bandeja de
   * contactos. Por eso `updateState` escribe solo `state` y este método no
   * toca `delivery_status`; el schema del body tampoco lo acepta, así que el
   * panel no puede fingir una entrega por la puerta de atrás.
   *
   * VALIDA EN EL SERVICIO, no solo en el pipe del body: el pipe cubre esta ruta
   * HTTP, y acá está la frontera que cualquier otro llamador —un job, un
   * script, el importador que algún día bajará reportes de otra parte— tiene
   * que atravesar. `state` es `text` sin CHECK, así que la validación contra
   * `BUG_TRIAGE_STATES` es lo único que impide que un string cualquiera quede
   * escrito como si fuera un triaje.
   *
   * LEE ANTES DE ESCRIBIR, y sobre todo por el namespace: una fila de otro
   * namespace responde 404 y no se toca. Un `updateState` directo por id
   * escribiría sobre `app_store` entero sin mirar qué fila es.
   */
  async setState(
    id: string,
    state: BugTriageState,
  ): Promise<BugReportDetailDto> {
    if (!this.esEstadoValido(state)) {
      throw new BadRequestException(`Unknown bug triage state: ${state}`);
    }
    await this.requireBugReportRow(id);
    const updated = await this.store.updateState(id, state);
    if (!updated) {
      throw new NotFoundException(`Bug report ${id} not found`);
    }
    // Firma acá también, y no solo en `getById`: el PATCH devuelve el detalle
    // completo, así que el panel reemplaza el drawer con esta respuesta. Si
    // volviera sin `image_urls`, cada triaje borraría las capturas de la vista
    // que el operador está leyendo.
    return this.withSignedImages(updated);
  }

  /**
   * Mapea a detalle y le pone las URLs firmadas de las capturas.
   *
   * LO QUE ESTE MÉTODO NO HACE, y es la parte importante: no reemplaza una ruta
   * que no se pudo firmar. La omite. Un reporte cuya captura fue borrada del
   * bucket tiene que LLEGAR igual, legible, con un array más corto: si una firma
   * fallara -&gt; 500, un reporte con una imagen pendiente de borrar desaparecería
   * del buzón, que es justo cuando más falta hace verlo. Y el lugar de la captura
   * caída no se llena con la ruta cruda, porque entonces la respuesta llevaría
   * el path que este diseño existe para no publicar.
   */
  private async withSignedImages(row: StoreEntry): Promise<BugReportDetailDto> {
    const detail = BugReportInboxMapper.toDetail(row);
    const paths = BugReportInboxMapper.imagePathsOf(row);
    if (paths.length === 0) return detail;

    const bucket = this.assertBucketAllowed();
    if (!bucket) return detail;
    const storage = this.storageClient();
    const firmadas = await Promise.all(
      paths.map(async (path) => {
        try {
          const { data, error } = await storage
            .from(bucket)
            .createSignedUrl(path, BUG_REPORT_IMAGE_URL_TTL_SECONDS);
          // Sin `error` pero sin `signedUrl` también es una firma fallida: se
          // omite igual, por el mismo motivo que arriba.
          return error || !data?.signedUrl ? null : data.signedUrl;
        } catch {
          // Un throw del cliente (red caída, DNS) es la misma clase de fallo que
          // un `error`: la captura se omite y el detalle sigue.
          return null;
        }
      }),
    );

    return { ...detail, image_urls: firmadas.filter((u) => u !== null) };
  }

  /**
   * El bucket tiene que estar en la allowlist antes de firmar.
   *
   * Falla en silencio a propósito —devuelve `[]`, que el `withSignedImages`
   * traduce en "sin capturas"— y no con un 403 o un 500. La allowlist es
   * configuración de despliegue, no un error del operador: si alguien la dejó
   * afuera, el buzón tiene que seguir mostrando los reportes, porque el texto
   * del reporte es lo importante y las capturas son lo accesorio. Un throw
   * convertiría una variable mal puesta en un buzón entero caído.
   */
  private assertBucketAllowed(): string | null {
    const allowed = (
      this.config.get('SUPABASE_ALLOWED_BUCKETS', { infer: true }) ?? ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return allowed.includes(BUG_REPORT_IMAGES_BUCKET)
      ? BUG_REPORT_IMAGES_BUCKET
      : null;
  }

  /** El cliente de storage se construye una vez y se reusa. */
  private storageClient(): ReturnType<typeof createClient>['storage'] {
    this.storage ??= createClient(
      this.config.get('SUPABASE_URL', { infer: true }),
      this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    ).storage;
    return this.storage;
  }

  /**
   * `find` contra la constante del SSOT, no un cast: el tipo de `state` en la
   * fila es `string | null` porque la columna es `text`, y estrecharlo con un
   * `as BugTriageState` dejaría pasar un estado que el panel no sabe pintar.
   */
  private esEstadoValido(state: string): state is BugTriageState {
    return BUG_TRIAGE_STATES.some((conocido) => conocido === state);
  }

  /**
   * Última barrera anti-agujero: cualquier fila que no sea del namespace
   * `bug_report` es un 404, indistinguible de "no existe" para quien llama.
   *
   * `findById` no filtra por namespace a propósito —es un método genérico del
   * store, compartido con `contact.service` y con el camino público del
   * contacto—, así que la comprobación vive acá.
   */
  private async requireBugReportRow(id: string): Promise<StoreEntry> {
    const row = await this.store.findById(id);
    if (!row || row.namespace !== BUG_REPORT_NAMESPACE) {
      throw new NotFoundException(`Bug report ${id} not found`);
    }
    return row;
  }
}
