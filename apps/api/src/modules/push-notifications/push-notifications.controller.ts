import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CreatePushSendSchema,
  CreatePushTemplateSchema,
  ListPushNotificationsQuerySchema,
  ListPushTemplatesQuerySchema,
  ListPushTokensQuerySchema,
  PushAudienceSchema,
  PushTestSchema,
  UpdatePushTemplateSchema,
  UpdatePushTokenSchema,
  paginatedDataFromQuery,
} from '@0xc1x/role-commons';
import type {
  CreatePushSendDto,
  CreatePushTemplateDto,
  ListPushNotificationsQuery,
  ListPushTemplatesQuery,
  ListPushTokensQuery,
  PushAudienceDto,
  PushNotificationPaginatedData,
  PushNotificationDto,
  PushSendResult,
  PushTemplateDto,
  PushTemplatePaginatedData,
  PushTestDto,
  PushTokenPaginatedData,
  UpdatePushTemplateDto,
  UpdatePushTokenDto,
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PushAdminService } from './push-admin.service';
import { PushNotificationsRepository } from './push-notifications.repository';
import { PushNotificationsMapper } from './push-notifications.mapper';

/**
 * Gestión de notificaciones push para admin: plantillas reutilizables,
 * envío manual (test y masivo por segmentos/usuarios), historial y
 * dispositivos registrados. El envío real lo ejecuta NotificationsService.
 */
@ApiTags('Push Notifications')
@Roles('admin')
@ApiBearerAuth('bearer')
@Controller('push-notifications')
export class PushNotificationsController {
  constructor(
    private readonly repository: PushNotificationsRepository,
    private readonly pushAdminService: PushAdminService,
  ) {}

  // ─── Plantillas ────────────────────────────────────────────────────

  @Get('templates')
  listTemplates(
    @Query(new ZodValidationPipe(ListPushTemplatesQuerySchema))
    q: ListPushTemplatesQuery,
  ): Promise<PushTemplatePaginatedData> {
    return this.repository.listTemplates(q).then(({ rows, total }) =>
      paginatedDataFromQuery(
        rows.map((r) => PushNotificationsMapper.toTemplateDto(r)),
        q,
        total,
      ),
    );
  }

  @Post('templates')
  async createTemplate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreatePushTemplateSchema))
    body: CreatePushTemplateDto,
  ): Promise<PushTemplateDto | null> {
    const [row] = await this.repository.insertTemplate({
      ...body,
      data: body.data ?? {},
      created_by: user.id,
    });
    return row ? PushNotificationsMapper.toTemplateDto(row) : null;
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePushTemplateSchema))
    body: UpdatePushTemplateDto,
  ): Promise<PushTemplateDto | null> {
    const row = await this.repository.updateTemplate(id, body);
    return row ? PushNotificationsMapper.toTemplateDto(row) : null;
  }

  @Delete('templates/:id')
  removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.deleteTemplate(id);
  }

  @Post('templates/:id/test')
  @HttpCode(HttpStatus.OK)
  testTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PushTestSchema)) body: PushTestDto,
  ): Promise<PushSendResult> {
    return this.pushAdminService.testTemplate(id, body);
  }

  // ─── Envío manual ──────────────────────────────────────────────────

  @Post('audience')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Count reachable users (push enabled + active token)' })
  audience(
    @Body(new ZodValidationPipe(PushAudienceSchema)) body: PushAudienceDto,
  ): Promise<{ total: number }> {
    return this.pushAdminService.countAudience({
      segmentIds: body.segment_ids,
      includeUserIds: body.include_user_ids,
      excludeUserIds: body.exclude_user_ids,
    });
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a manual push and record it in history' })
  send(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreatePushSendSchema)) body: CreatePushSendDto,
  ): Promise<PushSendResult> {
    return this.pushAdminService.send(body, user.id);
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a test push to specific users (no history)' })
  test(
    @Body(new ZodValidationPipe(PushTestSchema)) body: PushTestDto,
  ): Promise<PushSendResult> {
    return this.pushAdminService.test(body);
  }

  // ─── Dispositivos ──────────────────────────────────────────────────

  @Get('tokens')
  listTokens(
    @Query(new ZodValidationPipe(ListPushTokensQuerySchema)) q: ListPushTokensQuery,
  ): Promise<PushTokenPaginatedData> {
    return this.repository.listTokens(q).then(({ rows, total }) =>
      paginatedDataFromQuery(
        rows.map((r) => PushNotificationsMapper.toTokenDto(r)),
        q,
        total,
      ),
    );
  }

  @Patch('tokens/:id')
  async updateToken(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePushTokenSchema)) body: UpdatePushTokenDto,
  ) {
    return this.repository.updateToken(id, body);
  }

  // ─── Historial ─────────────────────────────────────────────────────

  @Get()
  listNotifications(
    @Query(new ZodValidationPipe(ListPushNotificationsQuerySchema))
    q: ListPushNotificationsQuery,
  ): Promise<PushNotificationPaginatedData> {
    return this.repository.listNotifications(q).then(({ rows, total }) =>
      paginatedDataFromQuery(
        rows.map((r) => PushNotificationsMapper.toNotificationDto(r)),
        q,
        total,
      ),
    );
  }

  @Get(':id')
  async getNotification(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PushNotificationDto | null> {
    const row = await this.repository.findNotificationById(id);
    return row ? PushNotificationsMapper.toNotificationDto(row) : null;
  }
}
