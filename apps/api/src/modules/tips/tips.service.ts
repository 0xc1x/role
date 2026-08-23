import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type CreateTipDto,
  type ListTipsQuery,
  type TipDto,
  type TipPaginatedData,
  type UpdateTipDto,
} from '@0xc1x/role-commons';
import { TipsRepository } from './tips.repository';
import { TipMapper } from './tips.mapper';

@Injectable()
export class TipsService {
  constructor(private readonly tipsRepository: TipsRepository) {}

  async list(query: ListTipsQuery): Promise<TipPaginatedData> {
    const { rows, total } = await this.tipsRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      active: query.active,
    });

    return paginatedDataFromQuery(
      rows.map((row) => TipMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getRandom(): Promise<TipDto> {
    const row = await this.tipsRepository.findRandom();
    if (!row) {
      throw new NotFoundException('No active tips available');
    }
    return TipMapper.toDto(row);
  }

  async getById(id: string): Promise<TipDto> {
    const row = await this.tipsRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Tip ${id} not found`);
    }
    return TipMapper.toDto(row);
  }

  async create(body: CreateTipDto): Promise<TipDto> {
    const created = await this.tipsRepository.transaction(async (tx) =>
      this.tipsRepository.insert(tx, TipMapper.toInsert(body)),
    );

    return TipMapper.toDto(created);
  }

  async update(id: string, body: UpdateTipDto): Promise<TipDto> {
    const patch = TipMapper.toUpdate(body);

    const updated = await this.tipsRepository.transaction(async (tx) => {
      const row = await this.tipsRepository.update(tx, id, patch);
      if (!row) {
        throw new NotFoundException(`Tip ${id} not found`);
      }
      return row;
    });

    return TipMapper.toDto(updated);
  }

  async remove(id: string): Promise<TipDto> {
    const deleted = await this.tipsRepository.transaction(async (tx) => {
      const row = await this.tipsRepository.softDelete(tx, id);
      if (!row) {
        throw new NotFoundException(`Tip ${id} not found`);
      }
      return row;
    });

    return TipMapper.toDto(deleted);
  }
}
