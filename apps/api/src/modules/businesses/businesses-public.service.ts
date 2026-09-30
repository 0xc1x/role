import { Injectable, NotFoundException } from '@nestjs/common';
import {
  paginatedDataFromQuery,
  type ListPublicBusinessesQuery,
  type PublicBusinessPaginatedData,
  type PublicBusinessStorefrontDto,
} from '@0xc1x/role-commons';
import { PublicBusinessMapper } from './businesses-public.mapper';
import { BusinessesRepository } from './businesses.repository';

/**
 * Public business surface: the catalog and the storefront.
 *
 * Split from `BusinessesService` for the same reason the mapper is split: the
 * admin/owner service is a panel API and this one is anonymous. Keeping them
 * apart means the gate that decides what a stranger may read lives in a class
 * where no panel code has to be reasoned about, and the ownership checks of
 * `BusinessesService` cannot be mistaken for the visibility check of this one.
 *
 * There is no ownership question here. The repository applies
 * `publiclyVisibleBusiness()` to every read, so the only thing this service
 * decides is what to say when a business is not there.
 */
@Injectable()
export class BusinessesPublicService {
  constructor(private readonly businessesRepository: BusinessesRepository) {}

  async list(
    query: ListPublicBusinessesQuery,
  ): Promise<PublicBusinessPaginatedData> {
    const { items, total } = await this.businessesRepository.listPublic(query);
    return paginatedDataFromQuery(
      items.map((row) => PublicBusinessMapper.toDto(row)),
      { page: query.page, limit: query.limit },
      total,
    );
  }

  /**
   * Storefront for one business.
   *
   * 404, not 403: an unknown id, a deactivated business and a business still in
   * review are the same answer, because anything else tells a stranger that the
   * id they guessed exists and is merely not ready. The business row is read
   * first and gated on its own — the locations and the hours are then read for
   * an id that is already known to be public, which is also what keeps the
   * "never expose a business_id the caller did not ask about" rule true by
   * construction: both child reads are filtered by the same id.
   *
   * The three reads are independent and not transactional, and that is correct
   * here: there is nothing to roll back, and a snapshot would buy a consistency
   * guarantee this read does not need to be useful. A business deactivated
   * between the first read and the second is still described accurately, because
   * the response is assembled from rows whose business was public a moment ago,
   * and the next request 404s.
   */
  async storefront(id: string): Promise<PublicBusinessStorefrontDto> {
    const business = await this.businessesRepository.findPublicById(id);
    if (!business) {
      throw new NotFoundException(`Business ${id} not found`);
    }

    const [locations, hours] = await Promise.all([
      this.businessesRepository.listPublicLocations(id),
      this.businessesRepository.listPublicHours(id),
    ]);

    return PublicBusinessMapper.toStorefrontDto({
      business,
      locations,
      hours,
    });
  }
}
