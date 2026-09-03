import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type BusinessDto,
  type BusinessLocationDto,
  type CreateBusinessDto,
  type CreateBusinessLocationDto,
  type ListBusinessesQuery,
  type ListBusinessLocationsQuery,
  type PaginatedData,
  type UpdateBusinessDto,
  type UpdateBusinessLocationDto,
} from '@0xc1x/role-commons';
import type { AuthUser } from '../../auth/auth.types';
import {
  BusinessesRepository,
  type BusinessRow,
  type BusinessUpdate,
  type BusinessLocationUpdate,
} from './businesses.repository';
import { BusinessMapper } from './businesses.mapper';

@Injectable()
export class BusinessesService {
  constructor(private readonly businessesRepository: BusinessesRepository) {}

  async list(
    user: AuthUser,
    query: ListBusinessesQuery,
  ): Promise<PaginatedData<BusinessDto>> {
    if (user.role === 'admin') {
      return this.listAll(query);
    }

    const { items, total } = await this.businessesRepository.listForUser(
      user.id,
      query,
    );
    return paginatedDataFromQuery(
      items.map((row) => BusinessMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  private async listAll(
    query: ListBusinessesQuery,
  ): Promise<PaginatedData<BusinessDto>> {
    const { items, total } = await this.businessesRepository.listAll(query);
    return paginatedDataFromQuery(
      items.map((row) => BusinessMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(user: AuthUser, id: string): Promise<BusinessDto> {
    const row = await this.businessesRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    await this.assertCanView(user, row);
    return BusinessMapper.toDto(row);
  }

  async create(user: AuthUser, body: CreateBusinessDto): Promise<BusinessDto> {
    if (user.role !== 'admin') {
      body.owner_id = user.id;
      // Business role always creates pending, is_active false (trigger syncs)
      body.verification_status = 'pending';
      body.is_active = false;
    }

    const existing = await this.businessesRepository.findBySlug(body.slug);
    if (existing) {
      throw new BadRequestException('Slug already exists');
    }

    const created = await this.businessesRepository.transaction(async (tx) => {
      return this.businessesRepository.insert(tx, {
        owner_id: body.owner_id!,
        name: body.name,
        type: body.type ?? 'restaurant',
        slug: body.slug,
        image: body.image ?? null,
        cover_image: body.cover_image ?? null,
        description: body.description ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        website: body.website ?? null,
        commission_rate: (body.commission_rate ?? 0.1).toString(),
        is_active: body.is_active ?? false,
        verification_status: body.verification_status ?? 'pending',
        rejection_reason: body.rejection_reason ?? null,
      });
    });

    // TODO: email hook — business_pending_admin + business_pending_owner
    // Will be implemented via EmailMarketing module after template seeding

    return BusinessMapper.toDto(created);
  }

  async update(
    user: AuthUser,
    id: string,
    body: UpdateBusinessDto,
  ): Promise<BusinessDto> {
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    await this.assertCanMutate(user, existing);

    if (body.slug && body.slug !== existing.slug) {
      const slugExists = await this.businessesRepository.findBySlug(body.slug);
      if (slugExists) {
        throw new BadRequestException('Slug already exists');
      }
    }

    const updated = await this.businessesRepository.transaction(async (tx) => {
      const patch: BusinessUpdate = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.type !== undefined) patch.type = body.type;
      if (body.slug !== undefined) patch.slug = body.slug;
      if (body.image !== undefined) patch.image = body.image;
      if (body.cover_image !== undefined) patch.cover_image = body.cover_image;
      if (body.description !== undefined) patch.description = body.description;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.email !== undefined) patch.email = body.email;
      if (body.website !== undefined) patch.website = body.website;
      if (body.commission_rate !== undefined && body.commission_rate !== null) {
        if (await this.businessesRepository.hasPendingPayout(id)) {
          throw new ConflictException(
            'No se puede cambiar la comisión: el negocio tiene pagos pendientes de procesar',
          );
        }
        patch.commission_rate = body.commission_rate.toString();
      }
      if (body.is_active !== undefined) patch.is_active = body.is_active;
      if (body.verification_status !== undefined) {
        if (user.role !== 'admin') {
          throw new ForbiddenException('Solo admin puede verificar negocios');
        }
        patch.verification_status = body.verification_status;
        patch.verified_at = new Date();
        patch.verified_by = user.id;
        if (body.verification_status === 'approved') {
          patch.is_active = true;
          patch.rejection_reason = null;
        } else if (body.verification_status === 'rejected') {
          patch.is_active = false;
          patch.rejection_reason = body.rejection_reason ?? null;
        } else if (body.verification_status === 'pending') {
          patch.is_active = false;
        }
      } else if (body.rejection_reason !== undefined && user.role === 'admin') {
        patch.rejection_reason = body.rejection_reason;
      }

      const row = await this.businessesRepository.update(tx, id, patch);
      if (!row) {
        throw new NotFoundException(`Business ${id} not found`);
      }
      return row;
    });

    return BusinessMapper.toDto(updated);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.businessesRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Business ${id} not found`);
    }
    await this.assertCanMutate(user, existing);

    await this.businessesRepository.transaction(async (tx) => {
      await this.businessesRepository.update(tx, id, { is_active: false });
    });
  }

  async listLocations(
    user: AuthUser,
    businessId: string,
    query: ListBusinessLocationsQuery,
  ): Promise<PaginatedData<BusinessLocationDto>> {
    await this.assertCanViewBusiness(user, businessId);

    const { items, total } =
      await this.businessesRepository.listLocationsForBusiness(
        businessId,
        query,
      );
    return paginatedDataFromQuery(
      items.map((row) => BusinessMapper.toLocationDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getLocation(
    user: AuthUser,
    businessId: string,
    locationId: string,
  ): Promise<BusinessLocationDto> {
    await this.assertCanViewBusiness(user, businessId);

    const row = await this.businessesRepository.findLocationById(locationId);
    if (!row || row.business_id !== businessId) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }
    return BusinessMapper.toLocationDto(row);
  }

  async createLocation(
    user: AuthUser,
    businessId: string,
    body: CreateBusinessLocationDto,
  ): Promise<BusinessLocationDto> {
    await this.assertCanMutateBusiness(user, businessId);

    const created = await this.businessesRepository.transaction(async (tx) => {
      return this.businessesRepository.insertLocation(tx, {
        business_id: businessId,
        name: body.name,
        address: body.address,
        phone: body.phone ?? null,
        latitude: body.latitude.toString(),
        longitude: body.longitude.toString(),
        is_active: body.is_active ?? true,
        zone: body.zone ?? null,
        is_headquarter: body.is_headquarter ?? false,
      });
    });

    return BusinessMapper.toLocationDto(created);
  }

  async updateLocation(
    user: AuthUser,
    businessId: string,
    locationId: string,
    body: UpdateBusinessLocationDto,
  ): Promise<BusinessLocationDto> {
    await this.assertCanMutateBusiness(user, businessId);

    const existing =
      await this.businessesRepository.findLocationById(locationId);
    if (!existing || existing.business_id !== businessId) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }

    const updated = await this.businessesRepository.transaction(async (tx) => {
      const patch: BusinessLocationUpdate = {};
      if (body.name !== undefined) patch.name = body.name;
      if (body.address !== undefined) patch.address = body.address;
      if (body.phone !== undefined) patch.phone = body.phone;
      if (body.latitude !== undefined)
        patch.latitude = body.latitude.toString();
      if (body.longitude !== undefined)
        patch.longitude = body.longitude.toString();
      if (body.is_active !== undefined) patch.is_active = body.is_active;
      if (body.zone !== undefined) patch.zone = body.zone;
      if (body.is_headquarter !== undefined)
        patch.is_headquarter = body.is_headquarter;

      const row = await this.businessesRepository.updateLocation(
        tx,
        locationId,
        patch,
      );
      if (!row) {
        throw new NotFoundException(`Location ${locationId} not found`);
      }
      return row;
    });

    return BusinessMapper.toLocationDto(updated);
  }

  async removeLocation(
    user: AuthUser,
    businessId: string,
    locationId: string,
  ): Promise<void> {
    await this.assertCanMutateBusiness(user, businessId);

    const existing =
      await this.businessesRepository.findLocationById(locationId);
    if (!existing || existing.business_id !== businessId) {
      throw new NotFoundException(`Location ${locationId} not found`);
    }

    await this.businessesRepository.transaction(async (tx) => {
      await this.businessesRepository.updateLocation(tx, locationId, {
        is_active: false,
      });
    });
  }

  private async assertCanView(
    user: AuthUser,
    business: BusinessRow,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      business.id,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only view businesses you own');
    }
  }

  private async assertCanViewBusiness(
    user: AuthUser,
    businessId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      businessId,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only access businesses you own');
    }
  }

  private async assertCanMutate(
    user: AuthUser,
    business: BusinessRow,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      business.id,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only manage businesses you own');
    }
  }

  private async assertCanMutateBusiness(
    user: AuthUser,
    businessId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const isOwner = await this.businessesRepository.isOwner(
      businessId,
      user.id,
    );
    if (!isOwner) {
      throw new ForbiddenException('You can only manage businesses you own');
    }
  }
}
