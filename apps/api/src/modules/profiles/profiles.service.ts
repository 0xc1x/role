import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type ListProfilesQuery,
  type ProfileDto,
} from '@0xc1x/role-commons';
import { ProfilesRepository, type ProfileRow } from './profiles.repository';

@Injectable()
export class ProfilesService {
  constructor(private readonly repository: ProfilesRepository) {}

  async list(query: ListProfilesQuery & { subscribed_to?: string }) {
    const { rows, total } = await this.repository.list({ ...query });
    return paginatedDataFromQuery(
      rows.map((row) => this.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  async getById(id: string): Promise<ProfileDto | null> {
    const row = await this.repository.findById(id);
    return row ? this.toDto(row) : null;
  }

  async update(
    id: string,
    values: Partial<Pick<ProfileRow, 'full_name' | 'phone' | 'city' | 'role'>>,
  ): Promise<ProfileDto> {
    const row = await this.repository.update(id, values);
    if (!row) throw new NotFoundException('Perfil no encontrado');
    return this.toDto(row);
  }

  /**
   * Espejo de `handle_new_user` + defaults (ADR-0008): crea preferencias y
   * consents por defecto. Dormido: se invocará desde el registro vía API
   * cuando ese flujo exista; el trigger SQL sigue activo para Supabase Auth.
   */
  async registerDefaults(userId: string): Promise<void> {
    await this.repository.insertRegistrationDefaults(userId);
  }

  private toDto(row: ProfileRow): ProfileDto {
    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      avatar_url: row.avatar_url,
      phone: row.phone,
      role: row.role,
      city: row.city,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}
