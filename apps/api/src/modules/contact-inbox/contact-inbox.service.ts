import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type ContactMessageDetailDto,
  type ContactMessagePaginatedData,
  type ListContactMessagesQuery,
} from '@0xc1x/role-commons';
import type { StoreEntry } from '../store/app-store.repository';
import { AppStoreRepository } from '../store/app-store.repository';
import { CONTACT_NAMESPACE } from './contact-inbox.constants';
import { ContactInboxMapper } from './contact-inbox.mapper';

/** Bandeja de contactos para el panel. Admin-only (lo aplica `@Roles('admin')`). */
@Injectable()
export class ContactInboxService {
  constructor(private readonly store: AppStoreRepository) {}

  async list(
    query: ListContactMessagesQuery,
  ): Promise<ContactMessagePaginatedData> {
    const { rows, total } = await this.store.list({
      namespace: CONTACT_NAMESPACE,
      delivery_status: query.status,
      page: query.page,
      limit: query.limit,
    });
    return paginatedDataFromQuery(
      rows.map((row) => ContactInboxMapper.toListItem(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(id: string): Promise<ContactMessageDetailDto> {
    return ContactInboxMapper.toDetail(await this.requireContactRow(id));
  }

  /**
   * Marca el mensaje como atendido: `PENDIENTE` → `PROCESADO`.
   *
   * Idempotente a propósito, sin `if (status !== 'PROCESADO')`: el panel
   * muestra la acción siempre y un doble click no puede terminar en un 409 que
   * el operador tendría que interpretar.
   *
   * LEE ANTES DE ESCRIBIR, y sobre todo por el namespace: una fila de otro
   * namespace responde 404 y no se toca. Un `updateDeliveryStatus` directo por
   * id escribiría sobre `app_store` entero sin mirar qué fila es.
   *
   * LO QUE ESTE CAMBIO NO ES: una marca de "leído por un humano".
   * `delivery_status` en `app_store` lo mueve el camino público de
   * `POST /contact` cuando el correo de notificación se entrega, así que la
   * fila llega en `PROCESADO` antes de que nadie la mire. Distinguir
   * "atendido" de "notificado" necesita una columna propia, y eso es una
   * migración: fuera de este work unit.
   */
  async markHandled(id: string): Promise<ContactMessageDetailDto> {
    await this.requireContactRow(id);
    const updated = await this.store.updateDeliveryStatus(id, 'PROCESADO');
    if (!updated) {
      throw new NotFoundException(`Contact message ${id} not found`);
    }
    return ContactInboxMapper.toDetail(updated);
  }

  /**
   * Última barrera anti-agujero: cualquier fila que no sea del namespace
   * `contact` es un 404, indistinguible de "no existe" para quien llama.
   *
   * `findById` no filtra por namespace a propósito —es un método genérico del
   * store, compartido con `contact.service`— así que la comprobación vive acá.
   */
  private async requireContactRow(id: string): Promise<StoreEntry> {
    const row = await this.store.findById(id);
    if (!row || row.namespace !== CONTACT_NAMESPACE) {
      throw new NotFoundException(`Contact message ${id} not found`);
    }
    return row;
  }
}
