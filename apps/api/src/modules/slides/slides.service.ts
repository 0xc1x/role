import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type SlideDto,
  type SlidePaginatedData,
  type CreateSlideDto,
  type ListSlideQuery,
  type UpdateSlideDto,
} from '@0xc1x/role-commons';
import { SlidesRepository, type SlideRow } from './slides.repository';
import { SlideMapper } from './mappers/slides.mapper';

@Injectable()
export class SlidesService {
  constructor(private readonly slidesRepository: SlidesRepository) {}

  async create(body: CreateSlideDto): Promise<SlideDto> {
    const inserted = await this.slidesRepository.transaction(async (tx) => {
      return this.slidesRepository.insert(tx, SlideMapper.toInsert(body));
    });

    return SlideMapper.toDto(inserted);
  }

  async getById(id: string): Promise<SlideDto> {
    const row = await this.slidesRepository.findById(id);
    if (!row || !this.isCurrentlyAvailable(row, new Date())) {
      throw new NotFoundException(`Slide with id ${id} not found`);
    }
    return SlideMapper.toDto(row);
  }

  async list(query: ListSlideQuery): Promise<SlidePaginatedData> {
    // Public list must enforce the same availability window as getById, and it
    // must be enforced in SQL so `total`/pagination match the returned rows.
    return this.listWithFilter(query, true, new Date());
  }

  async listAdmin(query: ListSlideQuery): Promise<SlidePaginatedData> {
    return this.listWithFilter(query, query.active);
  }

  private async listWithFilter(
    query: ListSlideQuery,
    active: boolean | undefined,
    availableAt?: Date,
  ): Promise<SlidePaginatedData> {
    let rows: Awaited<ReturnType<SlidesRepository['list']>>['rows'] = [];
    let total = 0;

    try {
      const result = await this.slidesRepository.list({
        page: query.page,
        limit: query.limit,
        search: query.search,
        active,
        availableAt,
      });
      rows = result.rows;
      total = result.total;
    } catch {
      return paginatedDataFromQuery(
        [],
        { page: query.page, limit: query.limit },
        0,
      );
    }

    return paginatedDataFromQuery(
      rows.map((row) => SlideMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * Detail-read availability rule. The public list applies the equivalent
   * predicate in SQL via `SlidesRepository.list({ availableAt })`; keep both in
   * sync — `slides.service.spec.ts` pins that equivalence.
   */
  private isCurrentlyAvailable(row: SlideRow, now: Date): boolean {
    return (
      row.active &&
      (!row.start_at || row.start_at <= now) &&
      (!row.end_at || row.end_at >= now)
    );
  }

  async update(id: string, body: UpdateSlideDto): Promise<SlideDto> {
    // Verificamos existencia primero (fuera de transacción)
    const existing = await this.slidesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Slide with id ${id} not found`);
    }

    const updated = await this.slidesRepository.transaction(async (tx) => {
      const row = await this.slidesRepository.update(
        tx,
        id,
        SlideMapper.toUpdate(body),
      );
      if (!row) {
        throw new NotFoundException(`Slide with id ${id} not found`);
      }
      return row;
    });

    return SlideMapper.toDto(updated);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.slidesRepository.transaction(async (tx) => {
      return this.slidesRepository.softDelete(tx, id);
    });

    if (!deleted) {
      throw new NotFoundException(`Slide with id ${id} not found`);
    }
  }

  // Opcional: Activar/Desactivar rápidamente
  async toggleActive(id: string, active: boolean): Promise<SlideDto> {
    const updated = await this.slidesRepository.transaction(async (tx) => {
      const row = await this.slidesRepository.update(tx, id, { active });

      if (!row) {
        throw new NotFoundException(`Slide with id ${id} not found`);
      }

      return row;
    });

    return SlideMapper.toDto(updated);
  }
}
