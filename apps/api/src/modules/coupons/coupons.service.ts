import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type CouponDto,
  type CouponListItemDto,
  type CouponPaginatedData,
  type CreateCouponDto,
  type ListCouponsQuery,
  type UpdateCouponDto,
} from '@0xc1x/role-commons';
import { CouponsRepository, type DbExecutor } from './coupons.repository';
import { CouponMapper } from './coupons.mapper';

@Injectable()
export class CouponsService {
  constructor(private readonly couponsRepository: CouponsRepository) {}

  async list(query: ListCouponsQuery): Promise<CouponPaginatedData> {
    const { rows, total } = await this.couponsRepository.list({
      page: query.page,
      limit: query.limit,
      search: query.search,
      is_active: query.is_active,
      global: query.global,
    });

    return paginatedDataFromQuery(
      rows.map((row) => CouponMapper.toListItem(row)) as CouponListItemDto[],
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(id: string): Promise<CouponDto> {
    const row = await this.couponsRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }
    return CouponMapper.toDto(row);
  }

  async create(body: CreateCouponDto): Promise<CouponDto> {
    const created = await this.couponsRepository.transaction(async (tx) => {
      // Los cupones globales (sin negocio) requieren código único en su ámbito.
      if (body.business_id === null || body.business_id === undefined) {
        await this.assertGlobalCodeAvailable(body.code, undefined, tx);
      }

      return this.couponsRepository.insert(tx, CouponMapper.toInsert(body));
    });

    return CouponMapper.toDto(created);
  }

  async update(id: string, body: UpdateCouponDto): Promise<CouponDto> {
    const existing = await this.couponsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }

    // El refine del schema cubre create; en update el value puede llegar solo,
    // así que el chequeo porcentual se hace sobre los valores fusionados.
    const type = body.type ?? existing.type;
    const value = body.value ?? Number(existing.value);
    if (type === 'percentage' && value > 100) {
      throw new BadRequestException('El porcentaje no puede superar 100');
    }

    if (
      body.code !== undefined &&
      body.code !== existing.code &&
      existing.business_id === null
    ) {
      await this.assertGlobalCodeAvailable(body.code, id);
    }

    const patch = CouponMapper.toUpdate(body);

    const updated = await this.couponsRepository.transaction(async (tx) => {
      const row = await this.couponsRepository.update(tx, id, patch);
      if (!row) {
        throw new NotFoundException(`Coupon ${id} not found`);
      }
      return row;
    });

    return CouponMapper.toDto(updated);
  }

  async remove(id: string): Promise<CouponDto> {
    const existing = await this.couponsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Coupon ${id} not found`);
    }
    if (existing.used_count > 0) {
      // Preserva el historial de canjes: orders.coupon_id referencia el id.
      throw new ConflictException(
        'Coupon has recorded redemptions; deactivate it instead',
      );
    }

    const deleted = await this.couponsRepository.transaction(async (tx) => {
      const row = await this.couponsRepository.remove(tx, id);
      if (!row) {
        throw new NotFoundException(`Coupon ${id} not found`);
      }
      return row;
    });

    return CouponMapper.toDto(deleted);
  }

  private async assertGlobalCodeAvailable(
    code: string,
    excludeId: string | undefined,
    executor?: DbExecutor,
  ): Promise<void> {
    const conflict = await this.couponsRepository.findGlobalByCode(
      code,
      { excludeId },
      executor,
    );
    if (conflict) {
      throw new ConflictException(
        `Global coupon with code '${code}' already exists`,
      );
    }
  }
}
