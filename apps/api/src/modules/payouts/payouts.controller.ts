import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListPayoutsQuerySchema,
  type ListPayoutsQuery,
} from '@0xc1x/role-commons';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayoutsService } from './payouts.service';

@ApiTags('Payouts')
@Controller('payouts')
@Roles('admin')
@ApiBearerAuth('bearer')
export class PayoutsController {
  constructor(private readonly service: PayoutsService) {}

  @Get()
  @ApiOperation({ summary: 'List payouts (admin)' })
  list(
    @Query(new ZodValidationPipe(ListPayoutsQuerySchema))
    q: ListPayoutsQuery,
  ) {
    return this.service.list(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payout by id (admin)' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate payouts for completed orders (admin)' })
  generate() {
    return this.service.generate();
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark payout as paid (admin)' })
  markPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markPaid(id);
  }
}
