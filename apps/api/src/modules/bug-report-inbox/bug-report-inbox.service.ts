import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BUG_TRIAGE_STATES,
  paginatedDataFromQuery,
  type BugReportDetailDto,
  type BugReportPaginatedData,
  type BugTriageState,
  type ListBugReportsQuery,
} from '@0xc1x/role-commons';
import type { StoreEntry } from '../store/app-store.repository';
import { AppStoreRepository } from '../store/app-store.repository';
import { BUG_REPORT_NAMESPACE } from './bug-report-inbox.constants';
import { BugReportInboxMapper } from './bug-report-inbox.mapper';

/** Bandeja de triaje de reportes de error. Admin-only (lo aplica `@Roles('admin')`). */
@Injectable()
export class BugReportInboxService {
  constructor(private readonly store: AppStoreRepository) {}

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

  async getById(id: string): Promise<BugReportDetailDto> {
    return BugReportInboxMapper.toDetail(await this.requireBugReportRow(id));
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
    return BugReportInboxMapper.toDetail(updated);
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
