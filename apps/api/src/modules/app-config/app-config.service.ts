import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type AppConfigDto,
  type AppConfigPaginatedData,
  type CreateAppConfigDto,
  type ListAppConfigQuery,
  type PublicAppConfigDto,
  type UpdateAppConfigDto,
} from '@0xc1x/role-commons';
import { AppConfigRepository } from './app-config.repository';
import { AppConfigMapper } from './mappers/app-config.mapper';

@Injectable()
export class AppConfigService {
  constructor(private readonly appConfigRepository: AppConfigRepository) {}

  async create(body: CreateAppConfigDto): Promise<AppConfigDto> {
    const existing = await this.appConfigRepository.findByKey(body.key);
    if (existing) {
      throw new ConflictException(
        `Ya existe una configuración con la clave "${body.key}"`,
      );
    }

    const inserted = await this.appConfigRepository.transaction(async (tx) => {
      return this.appConfigRepository.insert(tx, AppConfigMapper.toInsert(body));
    });

    return AppConfigMapper.toDto(inserted);
  }

  /**
   * Lista pública (solo activas + públicas) para clientes
   * (landing vía API; mobile consume Supabase directo).
   */
  async listPublic(): Promise<PublicAppConfigDto[]> {
    const rows = await this.appConfigRepository.listPublic();
    return AppConfigMapper.toPublicList(rows);
  }

  /** Lista completa paginada para el grid del admin. */
  async list(query: ListAppConfigQuery): Promise<AppConfigPaginatedData> {
    try {
      const result = await this.appConfigRepository.list({
        page: query.page,
        limit: query.limit,
        search: query.search,
        category: query.category,
        active: query.active,
      });

      return paginatedDataFromQuery(
        result.rows.map((row) => AppConfigMapper.toDto(row)),
        { page: query.page, limit: query.limit },
        result.total,
      );
    } catch {
      return paginatedDataFromQuery(
        [],
        { page: query.page, limit: query.limit },
        0,
      );
    }
  }

  async update(key: string, body: UpdateAppConfigDto): Promise<AppConfigDto> {
    const updated = await this.appConfigRepository.transaction(async (tx) => {
      return this.appConfigRepository.update(
        tx,
        key,
        AppConfigMapper.toUpdate(body),
      );
    });
    if (!updated) {
      throw new NotFoundException(
        `No existe configuración con la clave "${key}"`,
      );
    }
    return AppConfigMapper.toDto(updated);
  }

  async remove(key: string): Promise<void> {
    const deleted = await this.appConfigRepository.remove(key);
    if (!deleted) {
      throw new NotFoundException(
        `No existe configuración con la clave "${key}"`,
      );
    }
  }
}
