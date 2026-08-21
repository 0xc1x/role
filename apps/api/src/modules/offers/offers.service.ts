import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type CreateOfferDto,
  type ListOffersQuery,
  type OfferDto,
  type OfferWithBusiness,
  type PaginatedData,
  type UpdateOfferDto,
} from '@0xc1x/role-commons';
import { toNumber } from '../../common/utils/numeric';
import type { AuthUser } from '../../auth/auth.types';
import type { OfferUpdate } from './offers.repository';
import { OffersRepository } from './offers.repository';
import { OfferMapper } from './offers.mapper';

@Injectable()
export class OffersService {
  constructor(private readonly offersRepository: OffersRepository) {}

  async list(query: ListOffersQuery): Promise<PaginatedData<OfferWithBusiness>> {
    const { items, total } = await this.offersRepository.findMany(query);
    return paginatedDataFromQuery(
      items.map((row) => OfferMapper.toResponse(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(id: string): Promise<OfferWithBusiness> {
    const row = await this.offersRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Offer ${id} not found`);
    }
    return OfferMapper.toResponse(row);
  }

  /**
   * Oferta activa aleatoria con stock y pickup vigente.
   * `null` si no hay ofertas publicables (la landing muestra fallback).
   */
  async getRandom(): Promise<OfferWithBusiness | null> {
    const row = await this.offersRepository.findRandomActive();
    return row ? OfferMapper.toResponse(row) : null;
  }

  async create(user: AuthUser, body: CreateOfferDto): Promise<OfferDto> {
    await this.assertCanMutateBusiness(user, body.business_id);
    await this.assertLocationBelongsToBusiness(
      body.business_location_id,
      body.business_id,
    );
    await this.assertCategoriesActive(body.category_ids);
    this.assertPriceAndPickupWindow(
      body.original_price,
      body.discounted_price,
      body.pickup_start,
      body.pickup_end,
    );

    const created = await this.offersRepository.transaction(async (tx) => {
      const offer = await this.offersRepository.insert(tx, {
        business_id: body.business_id,
        business_location_id: body.business_location_id,
        title: body.title,
        description: body.description ?? null,
        image: body.image ?? null,
        original_price: body.original_price.toString(),
        discounted_price: body.discounted_price.toString(),
        stock: body.stock ?? 1,
        initial_stock: body.initial_stock ?? 1,
        pickup_start: new Date(body.pickup_start),
        pickup_end: new Date(body.pickup_end),
        is_active: body.is_active ?? true,
        includes: body.includes ?? null,
        allergens: body.allergens ?? null,
      });

      await this.offersRepository.setCategories(
        tx,
        offer.id,
        body.category_ids,
      );

      return offer;
    });

    const category_ids = await this.offersRepository.findCategoryIds(created.id);
    return OfferMapper.toDto(created, category_ids);
  }

  async update(
    user: AuthUser,
    id: string,
    body: UpdateOfferDto,
  ): Promise<OfferDto> {
    const existing = await this.offersRepository.findDtoById(id);
    if (!existing) {
      throw new NotFoundException(`Offer ${id} not found`);
    }

    await this.assertCanMutateBusiness(user, existing.business_id);

    const locationId =
      body.business_location_id ?? existing.business_location_id;
    await this.assertLocationBelongsToBusiness(
      locationId,
      existing.business_id,
    );

    if (body.category_ids !== undefined) {
      await this.assertCategoriesActive(body.category_ids);
    }

    const originalPrice =
      body.original_price ?? toNumber(existing.original_price);
    const discountedPrice =
      body.discounted_price ?? toNumber(existing.discounted_price);
    const pickupStart =
      body.pickup_start ?? existing.pickup_start.toISOString();
    const pickupEnd = body.pickup_end ?? existing.pickup_end.toISOString();
    this.assertPriceAndPickupWindow(
      originalPrice,
      discountedPrice,
      pickupStart,
      pickupEnd,
    );

    const patch: OfferUpdate = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.image !== undefined) patch.image = body.image;
    if (body.original_price !== undefined)
      patch.original_price = body.original_price.toString();
    if (body.discounted_price !== undefined)
      patch.discounted_price = body.discounted_price.toString();
    if (body.stock !== undefined) patch.stock = body.stock;
    if (body.initial_stock !== undefined)
      patch.initial_stock = body.initial_stock;
    if (body.pickup_start !== undefined)
      patch.pickup_start = new Date(body.pickup_start);
    if (body.pickup_end !== undefined)
      patch.pickup_end = new Date(body.pickup_end);
    if (body.is_active !== undefined) patch.is_active = body.is_active;
    if (body.includes !== undefined) patch.includes = body.includes;
    if (body.allergens !== undefined) patch.allergens = body.allergens;
    if (body.business_location_id !== undefined)
      patch.business_location_id = body.business_location_id;

    const updated = await this.offersRepository.transaction(async (tx) => {
      const row = await this.offersRepository.update(tx, id, patch);
      if (!row) {
        throw new NotFoundException(`Offer ${id} not found`);
      }

      if (body.category_ids !== undefined) {
        await this.offersRepository.setCategories(tx, id, body.category_ids);
      }

      return row;
    });

    const category_ids = await this.offersRepository.findCategoryIds(updated.id);
    return OfferMapper.toDto(updated, category_ids);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.offersRepository.findDtoById(id);
    if (!existing) {
      throw new NotFoundException(`Offer ${id} not found`);
    }
    await this.assertCanMutateBusiness(user, existing.business_id);

    await this.offersRepository.transaction(async (tx) => {
      const row = await this.offersRepository.update(tx, id, {
        is_active: false,
      });
      if (!row) {
        throw new NotFoundException(`Offer ${id} not found`);
      }
      return row;
    });
  }

  private async assertCanMutateBusiness(
    user: AuthUser,
    businessId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.offersRepository.isBusinessOwner(
      businessId,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException(
        'You can only manage offers for businesses you own',
      );
    }
  }

  private async assertLocationBelongsToBusiness(
    locationId: string,
    businessId: string,
  ): Promise<void> {
    const ok = await this.offersRepository.locationBelongsToBusiness(
      locationId,
      businessId,
    );
    if (!ok) {
      throw new BadRequestException(
        'business_location_id does not belong to business_id',
      );
    }
  }

  private async assertCategoriesActive(categoryIds: string[]): Promise<void> {
    const active =
      await this.offersRepository.findActiveCategoryIds(categoryIds);
    if (active.length !== categoryIds.length) {
      const missing = categoryIds.filter((id) => !active.includes(id));
      throw new BadRequestException(
        `Invalid or inactive category_ids: ${missing.join(', ')}`,
      );
    }
  }

  private assertPriceAndPickupWindow(
    originalPrice: number,
    discountedPrice: number,
    pickupStart: string,
    pickupEnd: string,
  ): void {
    if (discountedPrice > originalPrice) {
      throw new BadRequestException(
        'discounted_price must be less than or equal to original_price',
      );
    }
    if (new Date(pickupEnd).getTime() <= new Date(pickupStart).getTime()) {
      throw new BadRequestException('pickup_end must be after pickup_start');
    }
  }
}
