import {
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
  ListContactMessagesQuerySchema,
  type ContactMessageDetailDto,
  type ContactMessagePaginatedData,
  type ListContactMessagesQuery,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ContactInboxService } from './contact-inbox.service';

/**
 * Bandeja de los mensajes que deja el formulario público de contacto.
 *
 * Sin `@Public()` y con `@Roles('admin')` en cada handler: son datos personales
 * de gente que escribió desde la landing, y el endpoint no existe para el
 * público. No hay `@Param('namespace')` en ninguna firma a propósito — el
 * namespace `contact` está atado en el servicio (ver `contact-inbox.constants`).
 */
@ApiTags('Contact Inbox')
@Controller('contact-inbox')
export class ContactInboxController {
  constructor(private readonly service: ContactInboxService) {}

  @Roles('admin')
  @Get()
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List public contact messages (admin)' })
  @ApiOkResponse({ description: 'Paginated contact inbox' })
  list(
    @Query(new ZodValidationPipe(ListContactMessagesQuerySchema))
    query: ListContactMessagesQuery,
  ): Promise<ContactMessagePaginatedData> {
    return this.service.list(query);
  }

  @Roles('admin')
  @Get(':id')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get a contact message (admin)' })
  @ApiOkResponse({ description: 'Contact message detail' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContactMessageDetailDto> {
    return this.service.getById(id);
  }

  @Roles('admin')
  @Patch(':id/handled')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Mark a contact message as handled (admin). Idempotent.',
  })
  @ApiOkResponse({ description: 'Contact message marked as handled' })
  markHandled(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ContactMessageDetailDto> {
    return this.service.markHandled(id);
  }
}
