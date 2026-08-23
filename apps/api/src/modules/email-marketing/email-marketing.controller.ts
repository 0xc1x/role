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
  TestCampaignSchema,
  UpdateCampaignSchema,
  UpdateEmailComponentSchema,
  UpdateEmailTemplateSchema,
  UpdateSegmentSchema,
} from '@0xc1x/role-commons';
import type {
  CampaignDto,
  CampaignPaginatedData,
  CreateCampaignDto,
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
} from '@0xc1x/role-commons';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthUser } from '../../auth/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CampaignsService } from './campaigns.service';
import { EmailMarketingRepository } from './email-marketing.repository';
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
  constructor(
    private readonly repository: EmailMarketingRepository,
    private readonly campaignsService: CampaignsService,
  ) {}

  // ─── Componentes ───────────────────────────────────────────────────

  @Get('components')
  @ApiOperation({ summary: 'List email components (header/footer)' })
  listComponents(
    @Query(new ZodValidationPipe(ListComponentsQuerySchema))
    q: ListComponentsQuery,
  ): Promise<EmailComponentPaginatedData> {
    return this.repository.listComponents(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toComponentDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<EmailComponentPaginatedData>;
  }

  @Post('components')
  createComponent(
    @Body(new ZodValidationPipe(CreateEmailComponentSchema)) body: any,
  ) {
    return this.repository.insertComponent(body);
  }

  @Patch('components/:id')
  updateComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmailComponentSchema))
    body: UpdateEmailComponentDto,
  ) {
    return this.repository.updateComponent(id, body);
  }

  @Delete('components/:id')
  removeComponent(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.deleteComponent(id);
  }

  // ─── Plantillas ────────────────────────────────────────────────────

  @Get('templates')
  listTemplates(
    @Query(new ZodValidationPipe(ListComponentsQuerySchema))
    q: ListComponentsQuery,
  ): Promise<EmailTemplatePaginatedData> {
    return this.repository.listTemplates(q).then(({ rows, total }) => ({
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
    @Body(new ZodValidationPipe(CreateEmailTemplateSchema)) body: any,
  ) {
    const rows = await this.repository.insertTemplate(body);
    return EmailMarketingMapper.toTemplateDto(rows[0]!);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateEmailTemplateSchema))
    body: UpdateEmailTemplateDto,
  ) {
    const row = await this.repository.updateTemplate(id, body);
    return row ? EmailMarketingMapper.toTemplateDto(row) : null;
  }

  @Delete('templates/:id')
  removeTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.deleteTemplate(id);
  }

  // ─── Segmentos ─────────────────────────────────────────────────────

  @Get('segments')
  listSegments(
    @Query(new ZodValidationPipe(ListSegmentsQuerySchema)) q: ListSegmentsQuery,
  ): Promise<SegmentPaginatedData> {
    return this.repository.listSegments(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toSegmentDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<SegmentPaginatedData>;
  }

  @Post('segments')
  async createSegment(
    @Body(new ZodValidationPipe(CreateSegmentSchema)) body: any,
  ) {
    const { user_ids, ...segment } = body as {
      name: string;
      description?: string | null;
      type?: 'static' | 'dynamic';
      filters?: unknown;
      is_active?: boolean;
      user_ids?: string[];
    };
    const [row] = await this.repository.insertSegment(segment);
    if (!row) throw new Error('No se pudo crear el segmento');
    if (Array.isArray(user_ids) && user_ids.length > 0) {
      await this.repository.addSegmentUsers(row.id, user_ids);
    }
    return row;
  }

  @Patch('segments/:id')
  updateSegment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSegmentSchema)) body: UpdateSegmentDto,
  ) {
    return this.repository.updateSegment(id, body);
  }

  @Delete('segments/:id')
  removeSegment(@Param('id', ParseUUIDPipe) id: string) {
    return this.repository.deleteSegment(id);
  }

  @Get('segments/:id/users')
  getSegmentUsers(@Param('id', ParseUUIDPipe) id: string): Promise<string[]> {
    return this.repository.getSegmentUserIds(id);
  }

  @Put('segments/:id/users')
  @HttpCode(HttpStatus.OK)
  setSegmentUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddSegmentUsersSchema))
    body: { user_ids: string[] },
  ) {
    return this.repository.replaceSegmentUsers(id, body.user_ids);
  }

  @Post('segments/:id/users')
  addSegmentUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddSegmentUsersSchema))
    body: { user_ids: string[] },
  ) {
    return this.repository.addSegmentUsers(id, body.user_ids);
  }

  // ─── Campañas ──────────────────────────────────────────────────────

  @Get('campaigns')
  listCampaigns(
    @Query(new ZodValidationPipe(ListCampaignsQuerySchema))
    q: ListCampaignsQuery,
  ): Promise<CampaignPaginatedData> {
    return this.repository.listCampaigns(q).then(({ rows, total }) => ({
      data: rows.map((r) => EmailMarketingMapper.toCampaignDto(r)),
      meta: { page: q.page, limit: q.limit, total },
    })) as Promise<CampaignPaginatedData>;
  }

  @Get('campaigns/:id')
  getCampaign(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CampaignDto | null> {
    return this.repository
      .getCampaignById(id)
      .then((row) => (row ? EmailMarketingMapper.toCampaignDto(row) : null));
  }

  @Post('campaigns')
  createCampaign(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateCampaignSchema)) body: CreateCampaignDto,
  ) {
    return this.repository.insertCampaign({
      ...body,
      created_by: user.id,
      scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
    });
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCampaignSchema)) body: UpdateCampaignDto,
  ) {
    const { scheduled_at, ...rest } = body as UpdateCampaignDto & {
      scheduled_at?: string | null;
    };
    return this.repository.updateCampaign(id, {
      ...rest,
      ...(scheduled_at !== undefined
        ? { scheduled_at: scheduled_at ? new Date(scheduled_at) : null }
        : {}),
    });
  }

  @Post('campaigns/:id/preview')
  async previewCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body?: { subject?: string; body_html?: string },
  ): Promise<RenderedEmail> {
    const campaign = await this.getCampaign(id);
    if (!campaign?.template_id) {
      throw new Error('La campaña no tiene plantilla');
    }
    return this.campaignsService.preview({
      templateId: campaign.template_id,
      subjectOverride: body?.subject ?? campaign.subject_override,
      bodyOverride: body?.body_html ?? campaign.body_override,
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
    return this.repository.deleteCampaign(id);
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
}
