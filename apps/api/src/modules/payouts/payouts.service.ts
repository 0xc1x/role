import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type PayoutDto,
  type PaginatedData,
} from '@0xc1x/role-commons';
import { PayoutMapper } from './payouts.mapper';
import { PayoutsRepository } from './payouts.repository';

@Injectable()
export class PayoutsService {
  constructor(private readonly repo: PayoutsRepository) {}

  async list(query: {
    page: number;
    limit: number;
    business_id?: string;
    status?: string;
  }): Promise<PaginatedData<PayoutDto>> {
    const { rows, total } = await this.repo.list(query);
    return paginatedDataFromQuery(
      rows.map((r) => PayoutMapper.toDto(r)),
      query,
      total,
    );
  }

  async getById(id: string): Promise<PayoutDto> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException(`Payout ${id} not found`);
    return PayoutMapper.toDto(row);
  }

  async markPaid(id: string): Promise<PayoutDto> {
    const row = await this.repo.markPaid(id);
    if (!row) throw new NotFoundException(`Payout ${id} not found`);
    return PayoutMapper.toDto(row);
  }

  async generate(): Promise<{ count: number }> {
    const count = await this.repo.generate();
    return { count };
  }
}
