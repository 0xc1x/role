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
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateTipSchema,
  ListTipsQuerySchema,
  UpdateTipSchema,
} from '@0xc1x/role-commons';
import type {
  CreateTipDto,
  ListTipsQuery,
  TipDto,
  TipPaginatedData,
  UpdateTipDto,
} from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TipsService } from './tips.service';

@ApiTags('Tips')
@Controller('tips')
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List tips' })
  @ApiOkResponse({ description: 'Paginated tip list' })
  list(
    @Query(new ZodValidationPipe(ListTipsQuerySchema))
    query: ListTipsQuery,
  ): Promise<TipPaginatedData> {
    return this.tipsService.list(query);
  }

  @Public()
  @Get('random')
  @ApiOperation({ summary: 'Get a random active tip' })
  @ApiOkResponse({ description: 'Random tip' })
  getRandom(): Promise<TipDto> {
    return this.tipsService.getRandom();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get tip by id' })
  @ApiOkResponse({ description: 'Tip detail' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<TipDto> {
    return this.tipsService.getById(id);
  }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a tip (admin)' })
  @ApiCreatedResponse({ description: 'Tip created' })
  create(
    @Body(new ZodValidationPipe(CreateTipSchema)) body: CreateTipDto,
  ): Promise<TipDto> {
    return this.tipsService.create(body);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update a tip (admin)' })
  @ApiOkResponse({ description: 'Tip updated' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTipSchema)) body: UpdateTipDto,
  ): Promise<TipDto> {
    return this.tipsService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Soft-delete a tip (admin)' })
  @ApiOkResponse({ description: 'Tip soft-deleted' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<TipDto> {
    return this.tipsService.remove(id);
  }
}
