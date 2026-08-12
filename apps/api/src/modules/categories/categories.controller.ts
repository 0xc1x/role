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
  CreateCategorySchema,
  ListCategoriesQuerySchema,
  UpdateCategorySchema,
} from '@0xc1x/role-commons';
import type {
  CategoryDto,
  CategoryPaginatedData,
  CreateCategoryDto,
  ListCategoriesQuery,
  UpdateCategoryDto,
} from '@0xc1x/role-commons';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List categories' })
  @ApiOkResponse({ description: 'Paginated category list' })
  list(
    @Query(new ZodValidationPipe(ListCategoriesQuerySchema))
    query: ListCategoriesQuery,
  ): Promise<CategoryPaginatedData> {
    return this.categoriesService.list(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get category by id' })
  @ApiOkResponse({ description: 'Category detail' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryDto> {
    return this.categoriesService.getById(id);
  }

  @Post()
  @Roles('admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create a category (admin)' })
  @ApiCreatedResponse({ description: 'Category created' })
  create(
    @Body(new ZodValidationPipe(CreateCategorySchema))
    body: CreateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoriesService.create(body);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update a category (admin)' })
  @ApiOkResponse({ description: 'Category updated' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCategorySchema))
    body: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categoriesService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Soft-delete a category (admin)' })
  @ApiOkResponse({ description: 'Category soft-deleted' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CategoryDto> {
    return this.categoriesService.remove(id);
  }
}
