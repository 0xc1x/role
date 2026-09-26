import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
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
import { safeErrorFields } from '@0xc1x/role-commons';
import { AppConfigRepository } from './app-config.repository';
import { AppConfigMapper } from './mappers/app-config.mapper';

@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(private readonly appConfigRepository: AppConfigRepository) {}

  async create(body: CreateAppConfigDto): Promise<AppConfigDto> {
    const existing = await this.appConfigRepository.findByKey(body.key);
    if (existing) {
      throw new ConflictException(
        `Ya existe una configuración con la clave "${body.key}"`,
      );
    }

    const inserted = await this.appConfigRepository.transaction(async (tx) => {
      return this.appConfigRepository.insert(
        tx,
        AppConfigMapper.toInsert(body),
      );
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
    } catch (err) {
      // Antes esto devolvía una lista vacía: una caída de Postgres era
      // indistinguible de "no hay configuraciones" en el admin, sin log ni
      // requestId. Se registra la huella acotada y se propaga para que
      // `AllExceptionsFilter` responda 500 con un `requestId` mostrable.
      this.logger.error({
        event: 'app_config_list_failed',
        ...safeErrorFields(err),
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener las configuraciones',
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
