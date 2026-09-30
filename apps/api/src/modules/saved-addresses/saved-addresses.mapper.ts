import type {
  AddSavedAddressRequestDto,
  SavedAddressDto,
  UpdateSavedAddressDto,
} from '@0xc1x/role-commons';
import { toNumber } from '../../common/utils/numeric';
import type {
  SavedAddressCreate,
  SavedAddressPatch,
  SavedAddressRow,
} from './saved-addresses.repository';

/**
 * Saved-address persistence rows → API DTOs, and request bodies → write payloads.
 *
 * `user_id` crosses the wire because it is the caller's own id: the API never
 * resolves an address book for anyone else, so the field is what a consumer
 * correlates the response with its own session. It is read from the ROW, never
 * from the request — the same split `AddFavoriteRequestSchema` documents.
 *
 * `latitude` / `longitude` are coerced here rather than at the boundary: they
 * are `numeric` columns and postgres-js hands `numeric` back as a string, while
 * the Zod contract says `z.number()`. The mapper is where that promise is kept.
 */
export class SavedAddressMapper {
  static toDto(row: SavedAddressRow): SavedAddressDto {
    return {
      id: row.id,
      user_id: row.user_id,
      label: row.label,
      address: row.address,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      is_default: row.is_default,
      // The column is `text` with a `'home'` default and no CHECK, so the enum
      // comes from the request schema and is not re-derived from storage. Same
      // cast the slides mapper makes for its `type` column.
      type: row.type as SavedAddressDto['type'],
      references: row.references,
      housing_type: row.housing_type,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  /**
   * Request body → insert payload, minus the identity and minus the default flag.
   *
   * `is_default` is deliberately NOT copied: it is not a column default, it is a
   * decision `SavedAddressesService.create` makes after reading whether the
   * caller has any address yet, and a mapper that passed it straight through
   * would be the second place that rule could live.
   *
   * Undefined optional fields are left undefined rather than written as `null`,
   * so the column defaults apply: an address saved without a `type` gets the
   * table's `'home'`, and one saved without references gets `NULL`.
   */
  static toCreate(body: AddSavedAddressRequestDto): SavedAddressCreate {
    return {
      label: body.label,
      address: body.address,
      latitude: String(body.latitude),
      longitude: String(body.longitude),
      type: body.type,
      references: body.references,
      housing_type: body.housing_type,
    };
  }

  /**
   * Request body → update payload. Only the keys the client actually sent are
   * written, so a PATCH that renames an address does not blank its references
   * and a PATCH that promotes the default does not rewrite the coordinates.
   *
   * `is_default` is copied like any other field, but copying it is not the same
   * as honouring it: whether the request is ALLOWED and what happens to the
   * previous default are decided by `SavedAddressesService.update`, which is the
   * only place the one-default rule lives.
   */
  static toPatch(body: UpdateSavedAddressDto): SavedAddressPatch {
    const patch: SavedAddressPatch = {};

    if (body.label !== undefined) patch.label = body.label;
    if (body.address !== undefined) patch.address = body.address;
    if (body.latitude !== undefined) patch.latitude = String(body.latitude);
    if (body.longitude !== undefined) patch.longitude = String(body.longitude);
    if (body.type !== undefined) patch.type = body.type;
    if (body.references !== undefined) patch.references = body.references;
    if (body.housing_type !== undefined) patch.housing_type = body.housing_type;
    if (body.is_default !== undefined) patch.is_default = body.is_default;

    return patch;
  }
}
