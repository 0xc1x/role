import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type CouponDto,
  type CouponPaginatedData,
  type CouponValidation,
  type CreateCouponDto,
  type ListCouponsQuery,
  type UpdateCouponDto,
  type ValidateCouponRequest,
} from '@0xc1x/role-commons';
import { CouponsRepository, type DbExecutor } from './coupons.repository';
import { evaluateCoupon } from './coupon-evaluator';
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
      rows.map((row) => CouponMapper.toListItem(row)),
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

  /**
   * The checkout pre-check: would `POST /orders` accept this code for this
   * business at this amount?
   *
   * ADVISORY, and deliberately so. It takes no lock and consumes no `max_uses`,
   * so two users can both pass this check and one of them will still get
   * `COUPON_EXHAUSTED` at reservation. That is correct behaviour, not a bug to
   * fix here: `max_uses` is settled by the reservation, which is the only
   * writer, and a pre-check that consumed it would burn a redemption on a
   * screen the user can walk away from. Do NOT "fix" this by incrementing
   * `used_count` in this path — it would make the coupon exhausted by lookups.
   *
   * What this endpoint DOES guarantee is that it never approves a code the
   * reservation rejects: same rules (`evaluateCoupon`), same resolution ranking
   * (`couponScopeRank`), same error vocabulary. A rejection is a 200 with
   * `applies: false`, not a 409 — the user is mid-checkout, and the client needs
   * the code to render, not a stack of error handling for a code they simply
   * may not use.
   */
  async validate(body: ValidateCouponRequest): Promise<CouponValidation> {
    const coupon = await this.couponsRepository.findApplicableByCode(
      body.business_id,
      body.code,
    );

    return CouponMapper.toValidation(
      evaluateCoupon(coupon, {
        businessId: body.business_id,
        amount: body.amount,
        now: new Date(),
      }),
      body.code,
    );
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
