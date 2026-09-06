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
  ListCommissionsQuerySchema,
  UpdateCommissionSchema,
} from '@0xc1x/role-commons';
import type {
  CommissionDto,
  CommissionPaginatedData,
  ListCommissionsQuery,
  UpdateCommissionDto,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CommissionsService } from './commissions.service';

@ApiTags('Commissions')
@ApiBearerAuth('bearer')
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Roles('admin')
  @Get()
  @ApiOperation({ summary: 'List business commissions (admin)' })
  @ApiOkResponse({ description: 'Paginated commission list' })
  list(
    @Query(new ZodValidationPipe(ListCommissionsQuerySchema))
    query: ListCommissionsQuery,
  ): Promise<CommissionPaginatedData> {
    return this.commissionsService.list(query);
  }

  @Roles('admin')
  @Get(':id')
  @ApiOperation({ summary: 'Get the commission of a business (admin)' })
  @ApiOkResponse({ description: 'Commission detail' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<CommissionDto> {
    return this.commissionsService.getById(id);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary:
      'Update the commission rate of a business (admin). Blocked while it has pending/processing payouts.',
  })
  @ApiOkResponse({ description: 'Commission updated' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCommissionSchema))
    body: UpdateCommissionDto,
  ): Promise<CommissionDto> {
    return this.commissionsService.update(id, body);
  }
}
