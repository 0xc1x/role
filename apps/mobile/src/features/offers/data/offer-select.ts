/**
 * The embedded PostgREST select that composes an offer with its
 * business, pickup location and categories. Single source shared by the
 * offers and business repositories (drift between the two caused subtle
 * shape differences — keep it in one place).
 */
export const OFFER_SELECT = `
  id, business_id, business_location_id, title, description, image,
  original_price, discounted_price, stock, initial_stock,
  pickup_start, pickup_end, is_active, includes, allergens, rating, review_count,
  created_at,
  businesses:business_id (
    id, name, type, image, rating, review_count
  ),
  business_locations:business_locations!offers_business_location_id_fkey (
    id, name, address, latitude, longitude, zone
  ),
  offer_categories (
    categories:categories!offer_categories_category_id_fkey (
      id, name, slug, emoji, image_url, active
    )
  )
`;
