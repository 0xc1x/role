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
    CreateSlideSchema,
    ListSlidesQuerySchema,
    UpdateSlideSchema,
} from '@0xc1x/role-commons';
import type {
    SlideDto,
    SlidePaginatedData,
    CreateSlideDto,
    ListSlideQuery,
    UpdateSlideDto,
} from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SlidesService } from './slides.service';

@ApiTags('Slides')
@Controller('slides')
export class SlidesController {
    constructor(private readonly slideService: SlidesService) { }

    @Public()
    @Get()
    @ApiOperation({ summary: 'List slides' })
    @ApiOkResponse({ description: 'Paginated slide list' })
    list(
        @Query(new ZodValidationPipe(ListSlidesQuerySchema))
        query: ListSlideQuery
    ): Promise<SlidePaginatedData> {
        return this.slideService.list(query);
    }

    @Public()
    @Get(':id')
    @ApiOperation({ summary: 'Get slide by id' })
    @ApiOkResponse({ description: 'Slide detail' })
    getById(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<SlideDto> {
        return this.slideService.getById(id)
    }

    @Post()
    @Roles('admin')
    @HttpCode(HttpStatus.CREATED)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Create a slide (admin)' })
    @ApiCreatedResponse({ description: 'Slide created' })
    create(
        @Body(new ZodValidationPipe(CreateSlideSchema))
        body: CreateSlideDto,
    ): Promise<SlideDto> {
        return this.slideService.create(body);
    }


    @Patch(':id')
    @Roles('admin')
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Update a slide (admin)' })
    @ApiOkResponse({ description: 'Slide updated' })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body(new ZodValidationPipe(UpdateSlideSchema))
        body: UpdateSlideDto,
    ): Promise<SlideDto> {
        return this.slideService.update(id, body);
    }

    @Delete(':id')
    @Roles('admin')
    @HttpCode(HttpStatus.OK)
    @ApiBearerAuth('bearer')
    @ApiOperation({ summary: 'Soft-delete a slide (admin)' })
    @ApiOkResponse({ description: 'Slide soft-deleted' })
    remove(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<void> {
        return this.slideService.remove(id);
    }
}