import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type CategoryDto,
  type CategoryPaginatedData,
  type CreateCategoryDto,
  type ListCategoriesQuery,
  type UpdateCategoryDto,
} from '@0xc1x/role-commons';
import {
  CategoriesRepository,
  type DbExecutor,
} from './categories.repository';
import { CategoryMapper } from './categories.mapper';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async list(query: ListCategoriesQuery): Promise<CategoryPaginatedData> {
    const { rows, total } = await this.categoriesRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      active: query.active,
    });

    return paginatedDataFromQuery(
      rows.map((row) => CategoryMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(id: string): Promise<CategoryDto> {
    const row = await this.categoriesRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Category ${id} not found`);
    }
    return CategoryMapper.toDto(row);
  }

  async create(body: CreateCategoryDto): Promise<CategoryDto> {
    const slug = body.slug ?? this.slugify(body.name);
    if (!slug) {
      throw new BadRequestException(
        'Could not derive a valid slug from name; provide an explicit slug',
      );
    }

    const created = await this.categoriesRepository.transaction(async (tx) => {
      await this.assertNameAvailable(body.name, undefined, tx);
      await this.assertSlugAvailable(slug, undefined, tx);

      return this.categoriesRepository.insert(
        tx,
        CategoryMapper.toInsert(body, slug),
      );
    });

    return CategoryMapper.toDto(created);
  }

  async update(id: string, body: UpdateCategoryDto): Promise<CategoryDto> {
    const existing = await this.categoriesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Category ${id} not found`);
    }

    if (body.name !== undefined && body.name !== existing.name) {
      await this.assertNameAvailable(body.name, id);
    }
    if (body.slug !== undefined && body.slug !== existing.slug) {
      await this.assertSlugAvailable(body.slug, id);
    }

    const patch = CategoryMapper.toUpdate(body);

    const updated = await this.categoriesRepository.transaction(async (tx) => {
      const row = await this.categoriesRepository.update(tx, id, patch);
      if (!row) {
        throw new NotFoundException(`Category ${id} not found`);
      }
      return row;
    });

    return CategoryMapper.toDto(updated);
  }

  async remove(id: string): Promise<CategoryDto> {
    const deleted = await this.categoriesRepository.transaction(async (tx) => {
      const row = await this.categoriesRepository.softDelete(tx, id);
      if (!row) {
        throw new NotFoundException(`Category ${id} not found`);
      }
      return row;
    });

    return CategoryMapper.toDto(deleted);
  }

  private slugify(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120);
  }

  private async assertNameAvailable(
    name: string,
    excludeId: string | undefined,
    executor?: DbExecutor,
  ): Promise<void> {
    const conflict = await this.categoriesRepository.findByName(
      name,
      { excludeId },
      executor,
    );
    if (conflict) {
      throw new ConflictException(
        `Category with name '${name}' already exists`,
      );
    }
  }

  private async assertSlugAvailable(
    slug: string,
    excludeId: string | undefined,
    executor?: DbExecutor,
  ): Promise<void> {
    const conflict = await this.categoriesRepository.findBySlug(
      slug,
      { excludeId },
      executor,
    );
    if (conflict) {
      throw new ConflictException(
        `Category with slug '${slug}' already exists`,
      );
    }
  }
}
