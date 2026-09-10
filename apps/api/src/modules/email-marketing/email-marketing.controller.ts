import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AddSegmentUsersSchema,
  CreateCampaignSchema,
  CreateEmailComponentSchema,
  CreateEmailTemplateSchema,
  CreateSegmentSchema,
  ListCampaignsQuerySchema,
  ListComponentsQuerySchema,
  ListSegmentsQuerySchema,
  ListSendsQuerySchema,
  PreviewCampaignRequestSchema,
  TestCampaignSchema,
  UpdateEmailSendSchema,
  UpdateCampaignSchema,
  UpdateEmailComponentSchema,
  UpdateEmailTemplateSchema,
  UpdateSegmentSchema,
} from '@0xc1x/role-commons';
import type {
  CampaignDto,
  CampaignPaginatedData,
  CreateCampaignDto,
  CreateEmailComponentDto,
  CreateEmailTemplateDto,
  CreateSegmentDto,
  EmailComponentPaginatedData,
  EmailTemplatePaginatedData,
  ListCampaignsQuery,
  ListComponentsQuery,
  ListSegmentsQuery,
  ListSendsQuery,
  RenderedEmail,
  SegmentPaginatedData,
  TestCampaignDto,
  UpdateCampaignDto,
  UpdateEmailComponentDto,
  UpdateEmailTemplateDto,
  UpdateSegmentDto,
  PreviewCampaignRequestDto,
  UpdateEmailSendDto,
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../auth/auth.types';
import type { emailSends } from '../../database/schema';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';
import { EmailMarketingMapper } from './mappers/email-marketing.mapper';

/**
 * CRUD de email marketing (solo admin). Un solo controller para los cinco
 * recursos: son CRUDs cortos con rutas explícitas.
 */
@ApiTags('Email Marketing')
@Roles('admin')
@ApiBearerAuth('bearer')
@Controller('email-marketing')
export class EmailMarketingController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // ─── Componentes ───────────────────────────────────────────────────

  @Get('components')
  @ApiOperation({ summary: 'List email components (header/footer)' })
  listComponents(
    @Query(new ZodValidationPipe(ListComponentsQuerySchema))
    q: ListComponentsQuery,
  ): Promise<EmailComponentPaginatedData> {
    return this.campaignsService.listComponents(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toComponentDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<EmailComponentPaginatedData>;
  }

  @Post('components')
  async createComponent(
    @Body(new ZodValidationPipe(CreateEmailComponentSchema))
    body: CreateEmailComponentDto,
  ) {
    const rows = await this.campaignsService.insertComponent(body);
    return EmailMarketingMapper.toComponentDto(rows[0]!);
  }

  @Patch('components/:id')
  async updateComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmailComponentSchema))
    body: UpdateEmailComponentDto,
  ) {
    const row = await this.campaignsService.updateComponent(id, body);
    return row ? EmailMarketingMapper.toComponentDto(row) : null;
  }

  @Delete('components/:id')
  removeComponent(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.deleteComponent(id);
  }

  // ─── Plantillas ────────────────────────────────────────────────────

  @Get('templates')
  listTemplates(
    @Query(new ZodValidationPipe(ListComponentsQuerySchema))
    q: ListComponentsQuery,
  ): Promise<EmailTemplatePaginatedData> {
    return this.campaignsService.listTemplates(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toTemplateDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<EmailTemplatePaginatedData>;
  }

  @Post('templates/:id/render')
  @HttpCode(HttpStatus.OK)
  async renderPreview(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RenderedEmail> {
    return this.campaignsService.preview({ templateId: id });
  }

  @Post('templates/:id/test')
  @HttpCode(HttpStatus.OK)
  testTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TestCampaignSchema)) body: TestCampaignDto,
  ) {
    return this.campaignsService.testTemplate(id, body.emails);
  }

  @Post('templates')
  async createTemplate(
    @Body(new ZodValidationPipe(CreateEmailTemplateSchema))
    body: CreateEmailTemplateDto,
  ) {
    const rows = await this.campaignsService.insertTemplate(body);
    return EmailMarketingMapper.toTemplateDto(rows[0]!);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmailTemplateSchema))
    body: UpdateEmailTemplateDto,
  ) {
    const row = await this.campaignsService.updateTemplate(id, body);
    return row ? EmailMarketingMapper.toTemplateDto(row) : null;
  }

  @Delete('templates/:id')
  removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.deleteTemplate(id);
  }

  // ─── Segmentos ─────────────────────────────────────────────────────

  @Get('segments')
  listSegments(
    @Query(new ZodValidationPipe(ListSegmentsQuerySchema)) q: ListSegmentsQuery,
  ): Promise<SegmentPaginatedData> {
    return this.campaignsService.listSegments(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toSegmentDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<SegmentPaginatedData>;
  }

  @Post('segments')
  async createSegment(
    @Body(new ZodValidationPipe(CreateSegmentSchema)) body: CreateSegmentDto,
  ) {
    const { user_ids, ...segment } = body;
    const [row] = await this.campaignsService.insertSegment(segment);
    if (!row) throw new Error('No se pudo crear el segmento');
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      await this.campaignsService.addSegmentUsers(row.id, user_ids);
    }
    return EmailMarketingMapper.toSegmentDto(row);
  }

  @Patch('segments/:id')
  async updateSegment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSegmentSchema)) body: UpdateSegmentDto,
  ) {
    const row = await this.campaignsService.updateSegment(id, body);
    return row ? EmailMarketingMapper.toSegmentDto(row) : null;
  }

  @Delete('segments/:id')
  removeSegment(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.deleteSegment(id);
  }

  @Get('segments/:id/users')
  getSegmentUsers(@Param('id', ParseUUIDPipe) id: string): Promise<string[]> {
    return this.campaignsService.getSegmentUserIds(id);
  }

  @Put('segments/:id/users')
  @HttpCode(HttpStatus.OK)
  setSegmentUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddSegmentUsersSchema))
    body: { user_ids: string[] },
  ) {
    return this.campaignsService.replaceSegmentUsers(id, body.user_ids);
  }

  @Post('segments/:id/users')
  addSegmentUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddSegmentUsersSchema))
    body: { user_ids: string[] },
  ) {
    return this.campaignsService.addSegmentUsers(id, body.user_ids);
  }

  // ─── Campañas ──────────────────────────────────────────────────────

  @Get('campaigns')
  listCampaigns(
    @Query(new ZodValidationPipe(ListCampaignsQuerySchema))
    q: ListCampaignsQuery,
  ): Promise<CampaignPaginatedData> {
    return this.campaignsService.listCampaigns(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toCampaignDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<CampaignPaginatedData>;
  }

  @Get('campaigns/:id')
  getCampaign(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CampaignDto | null> {
    return this.campaignsService
      .getCampaign(id)
      .then((row) => (row ? EmailMarketingMapper.toCampaignDto(row) : null));
  }

  @Post('campaigns')
  async createCampaign(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateCampaignSchema)) body: CreateCampaignDto,
  ) {
    await this.campaignsService.assertTemplateForChannel(
      body.channel,
      body.template_id,
    );
    const rows = await this.campaignsService.insertCampaign({
      ...body,
      created_by: user.id,
      scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
    });
    return EmailMarketingMapper.toCampaignDto(rows[0]!);
  }

  @Patch('campaigns/:id')
  async updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCampaignSchema)) body: UpdateCampaignDto,
  ) {
    const { scheduled_at, ...rest } = body as UpdateCampaignDto & {
      scheduled_at?: string | null;
    };
    if (body.template_id !== undefined || body.channel !== undefined) {
      const current = await this.getCampaign(id);
      if (!current) throw new NotFoundException('Campaña no encontrada');
      const channel = body.channel ?? current.channel;
      const templateId =
        body.template_id !== undefined
          ? body.template_id
          : (current.template_id ?? null);
      await this.campaignsService.assertTemplateForChannel(
        channel,
        templateId,
      );
    }
    return this.campaignsService
      .updateCampaign(id, {
        ...rest,
        ...(scheduled_at !== undefined
          ? { scheduled_at: scheduled_at ? new Date(scheduled_at) : null }
          : {}),
      })
      .then((row) => (row ? EmailMarketingMapper.toCampaignDto(row) : null));
  }

  @Post('campaigns/:id/preview')
  async previewCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PreviewCampaignRequestSchema))
    body?: PreviewCampaignRequestDto,
  ): Promise<RenderedEmail> {
    const campaign = await this.getCampaign(id);
    if (!campaign?.template_id) {
      throw new Error('La campaña no tiene plantilla');
    }
    if (campaign.channel === 'push') {
      throw new BadRequestException(
        'Las campañas push se previsualizan desde la plantilla push',
      );
    }
    return this.campaignsService.preview({
      templateId: campaign.template_id,
      subjectOverride: body?.subject,
      bodyOverride: body?.body_html,
    });
  }

  @Post('campaigns/:id/test')
  @HttpCode(HttpStatus.OK)
  testCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(TestCampaignSchema)) body: TestCampaignDto,
  ) {
    return this.campaignsService.test(id, body);
  }

  @Delete('campaigns/:id')
  removeCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaignsService.deleteCampaign(id);
  }

  @Post('campaigns/:id/audience')
  @HttpCode(HttpStatus.OK)
  audience(@Param('id', ParseUUIDPipe) id: string): Promise<{ total: number }> {
    return this.campaignsService.countAudience(id);
  }

  @Post('campaigns/:id/send')
  @HttpCode(HttpStatus.OK)
  sendCampaign(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaignsService.send(id);
  }

  @Post('campaigns/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelCampaign(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignDto> {
    return this.campaignsService.cancel(id);
  }

  @Get('campaigns/:id/sends')
  listSends(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(ListSendsQuerySchema)) q: ListSendsQuery,
  ) {
    return this.campaignsService.listSends({ campaignId: id, ...q });
  }

  @Get('sends')
  listAllSends(
    @Query(new ZodValidationPipe(ListSendsQuerySchema)) q: ListSendsQuery,
  ) {
    return this.campaignsService.listAllSends(q).then(({ rows, total }) => ({
        data: rows.map((r) => EmailMarketingMapper.toSendDto(r)),
        meta: { page: q.page, limit: q.limit, total },
      })) as Promise<never>;
  }

  @Patch('sends/:id')
  updateSend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmailSendSchema)) body: UpdateEmailSendDto,
  ) {
    // El drizzle insert espera Date para los *_at; el contrato zod viaja en ISO.
    const values = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        typeof value === 'string' && key.endsWith('_at') && value !== ''
          ? new Date(value)
          : value,
      ]),
    );
    return this.campaignsService
      .updateSend(id, values)
      .then((row) => (row ? EmailMarketingMapper.toSendDto(row) : null));
  }

  @Post('sends/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retrySend(@Param('id', ParseUUIDPipe) id: string) {
    const row = await this.campaignsService.findSendById(id);
    if (!row) throw new Error('Envío no encontrado');
    const reset: Partial<typeof emailSends.$inferInsert> = {
      status: 'pending',
      scheduled_at: new Date(),
      queued_at: new Date(),
      attempts: 0,
      error_message: null,
      error_code: null,
    };
    await this.campaignsService.updateSend(id, reset);
    return { ok: true };
  }
}
