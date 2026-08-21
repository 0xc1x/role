import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import {
  AppConfigListResponseSchema,
  AppConfigSchema,
  CreateAppConfigSchema,
  ListAppConfigQuerySchema,
  PublicAppConfigSchema,
  UpdateAppConfigSchema,
} from '../schemas/config.schema';

export type AppConfigDto = z.infer<typeof AppConfigSchema>;
export type PublicAppConfigDto = z.infer<typeof PublicAppConfigSchema>;
export type CreateAppConfigDto = z.infer<typeof CreateAppConfigSchema>;
export type UpdateAppConfigDto = z.infer<typeof UpdateAppConfigSchema>;
export type ListAppConfigQuery = z.infer<typeof ListAppConfigQuerySchema>;
export type AppConfigListResponse = z.infer<typeof AppConfigListResponseSchema>;
export type AppConfigPaginatedData = PaginatedData<AppConfigDto>;

/** Mapa clave → valor crudo (JSONB) listo para consumir en clientes. */
export type AppConfigMap = Record<string, unknown>;
