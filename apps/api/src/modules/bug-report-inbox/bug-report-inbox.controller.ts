import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ListBugReportsQuerySchema,
  SetBugReportStateSchema,
  type BugReportDetailDto,
  type BugReportPaginatedData,
  type ListBugReportsQuery,
  type SetBugReportStateDto,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BugReportInboxService } from './bug-report-inbox.service';

/**
 * Bandeja de triaje de los reportes de error que envía la app móvil.
 *
 * Sin `@Public()` y con `@Roles('admin')` en cada handler: un reporte puede
 * llevar el resumen de lo que el usuario estaba haciendo y un id de usuario, y
 * la superficie no existe para el público ni para un negocio. Los guards son
 * globales, así que no se repite `@UseGuards` — lo mismo que en el hermano.
 *
 * No hay `@Param('namespace')` en ninguna firma a propósito: el namespace
 * `bug_report` está atado en el servicio (ver `bug-report-inbox.constants`), y
 * `ListBugReportsQuerySchema` no es `strict`, así que un `?namespace=contact`
 * se descarta al parsear en vez de obedecerse.
 */
@ApiTags('Bug Report Inbox')
@Controller('bug-report-inbox')
export class BugReportInboxController {
  constructor(private readonly service: BugReportInboxService) {}

  @Roles('admin')
  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List bug reports (admin)' })
  @ApiOkResponse({ description: 'Paginated bug report inbox' })
  list(
    @Query(new ZodValidationPipe(ListBugReportsQuerySchema))
    query: ListBugReportsQuery,
  ): Promise<BugReportPaginatedData> {
    return this.service.list(query);
  }

  /**
   * El detalle. `image_urls` son URLs FIRMADAS de corta duración, no las rutas
   * del bucket: el bucket es privado y la ruta lleva el layout interno con el
   * uid del reportante adentro. El nombre del campo del contrato es la
   * garantía de eso, y por eso la firma vive en el service y no en el mapper.
   */
  @Roles('admin')
  @Get(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get a bug report (admin)' })
  @ApiOkResponse({ description: 'Bug report detail, with signed image URLs' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<BugReportDetailDto> {
    return this.service.getById(id);
  }

  /**
   * El triaje. El body lleva SOLO `state`: no hay camino de correo en un
   * reporte de errores, así que la entrega no la mueve nadie desde el panel y
   * `SetBugReportStateSchema` descarta la clave si alguien la manda.
   */
  @Roles('admin')
  @Patch(':id/state')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Set the triage state of a bug report (admin)' })
  @ApiOkResponse({ description: 'Bug report with the new triage state' })
  setState(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetBugReportStateSchema))
    body: SetBugReportStateDto,
  ): Promise<BugReportDetailDto> {
    return this.service.setState(id, body.state);
  }
}
