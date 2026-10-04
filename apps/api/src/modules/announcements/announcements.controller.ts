import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AnnouncementListQuerySchema,
  CreateAnnouncementSchema,
  UpdateAnnouncementSchema,
} from '@0c1x/role-commons';
import type {
  AnnouncementDto,
  AnnouncementListQuery,
  CreateAnnouncementDto,
  PaginatedAnnouncements,
  UpdateAnnouncementDto,
} from '@0c1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AnnouncementsService } from './announcements.service';

@ApiTags('Announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  /**
   * Los avisos que le tocan a quien pregunta. Sin sesión ve los que la policy
   * deja ver a un anónimo; con sesión, los de su audiencia.
   *
   * La cabecera `Authorization` se pasa tal cual al service, que la reenvía a
   * Supabase: la lectura tiene que ocurrir COMO el usuario, porque la que
   * decide qué filas vuelven es la policy, no la API.
   */
  @Public()
  @Get()
  @ApiOperation({
    summary: 'List the announcements the caller is eligible for',
  })
  @ApiOkResponse({ description: 'Eligible announcement list' })
  list(
    @Headers('authorization') authorization?: string,
  ): Promise<AnnouncementDto[]> {
    return this.announcementsService.listForAudience(authorization ?? null);
  }

  @Roles('admin')
  @Get('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List announcements (admin)' })
  @ApiOkResponse({ description: 'Paginated announcement list' })
  listAdmin(
    @Query(new ZodValidationPipe(AnnouncementListQuerySchema))
    query: AnnouncementListQuery,
  ): Promise<PaginatedAnnouncements> {
    return this.announcementsService.listAdmin(query);
  }

  @Roles('admin')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create an announcement (admin)' })
  @ApiCreatedResponse({ description: 'Announcement created' })
  create(
    @Body(new ZodValidationPipe(CreateAnnouncementSchema))
    body: CreateAnnouncementDto,
  ): Promise<AnnouncementDto> {
    return this.announcementsService.create(body);
  }

  @Roles('admin')
  @Patch(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update an announcement (admin)' })
  @ApiOkResponse({ description: 'Announcement updated' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAnnouncementSchema))
    body: UpdateAnnouncementDto,
  ): Promise<AnnouncementDto> {
    return this.announcementsService.update(id, body);
  }

  /** Soft delete: `active = false`. No hay borrado físico. */
  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Soft-delete an announcement (admin)' })
  @ApiOkResponse({ description: 'Announcement deactivated' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.announcementsService.remove(id);
  }

  /**
   * Marca un aviso obligatorio como entendido.
   *
   * `@Public` porque el cliente puede no tener sesión —el landing no la tiene—,
   * pero el service exige un token verificado: público es que se pueda LLEGAR,
   * no que se pueda escribir sin probar quién es. El `user_id` no viene del body
   * por eso: sale del token, o el acknowledgement sería de cualquiera.
   */
  @Public()
  @Post('acknowledgements')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Acknowledge an announcement' })
  @ApiNoContentResponse()
  acknowledge(
    // El id va en el body, no en la ruta: el recurso que se crea es la fila de
    // `announcement_acknowledgements`, cuya clave es compuesta con el usuario y
    // por eso no tiene un id propio que poner en el path.
    @Body('announcement_id', ParseUUIDPipe) announcementId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    return this.announcementsService.acknowledge(
      announcementId,
      authorization ?? '',
    );
  }
}
