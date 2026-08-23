import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type CommissionDto,
  type CommissionPaginatedData,
  type ListCommissionsQuery,
  type UpdateCommissionDto,
} from '@0xc1x/role-commons';
import { CommissionsRepository } from './commissions.repository';
import { CommissionMapper } from './commissions.mapper';

@Injectable()
export class CommissionsService {
  constructor(private readonly commissionsRepository: CommissionsRepository) {}

  async list(query: ListCommissionsQuery): Promise<CommissionPaginatedData> {
    const { rows, total } = await this.commissionsRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
    });

    return paginatedDataFromQuery(
      rows.map((row) => CommissionMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(id: string): Promise<CommissionDto> {
    const row = await this.commissionsRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    return CommissionMapper.toDto(row);
  }

  async update(id: string, body: UpdateCommissionDto): Promise<CommissionDto> {
    const updated = await this.commissionsRepository.transaction(async (tx) => {
      const existing = await this.commissionsRepository.findById(id);
      if (!existing) {
        throw new NotFoundException(`Business ${id} not found`);
      }
      if (existing.has_pending_payouts) {
        throw new ConflictException(
          'No se puede cambiar la comisión: el negocio tiene pagos pendientes de procesar',
        );
      }

      const row = await this.commissionsRepository.updateCommissionRate(
        tx,
        id,
        body.commission_rate,
      );
      if (!row) {
        throw new NotFoundException(`Business ${id} not found`);
      }
      return row;
    });

    return CommissionMapper.toDto(updated);
  }
}
