import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateAppConfigSchema,
  ListAppConfigQuerySchema,
  UpdateAppConfigSchema,
} from '@0xc1x/role-commons';
import type {
  AppConfigDto,
  AppConfigPaginatedData,
  CreateAppConfigDto,
  ListAppConfigQuery,
  PublicAppConfigDto,
  UpdateAppConfigDto,
} from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AppConfigService } from './app-config.service';

@ApiTags('App Config')
@Controller('app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  /**
   * Lista pública de configuración (solo activas + públicas).
   * La landing la consume al renderizar; mobile lee Supabase directo.
   */
  @Public()
  @Get('public')
  @ApiOperation({ summary: 'List public app config (key/value)' })
  @ApiOkResponse({ description: 'Public config entries' })
  listPublic(): Promise<PublicAppConfigDto[]> {
    return this.appConfigService.listPublic();
  }

  /** Lista completa paginada para el grid del admin. */
  @Roles('admin')
  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all app config (admin)' })
  @ApiOkResponse({ description: 'Paginated config list' })
  list(
    @Query(new ZodValidationPipe(ListAppConfigQuerySchema))
    query: ListAppConfigQuery,
  ): Promise<AppConfigPaginatedData> {
    return this.appConfigService.list(query);
  }

  @Roles('admin')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a config entry (admin)' })
  @ApiCreatedResponse({ description: 'Config entry created' })
  create(
    @Body(new ZodValidationPipe(CreateAppConfigSchema))
    body: CreateAppConfigDto,
  ): Promise<AppConfigDto> {
    return this.appConfigService.create(body);
  }

  @Roles('admin')
  @Patch(':key')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update a config entry by key (admin)' })
  @ApiOkResponse({ description: 'Config entry updated' })
  update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(UpdateAppConfigSchema))
    body: UpdateAppConfigDto,
  ): Promise<AppConfigDto> {
    return this.appConfigService.update(key, body);
  }

  @Roles('admin')
  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Delete a config entry by key (admin)' })
  @ApiOkResponse({ description: 'Config entry deleted' })
  remove(@Param('key') key: string): Promise<void> {
    return this.appConfigService.remove(key);
  }
}
