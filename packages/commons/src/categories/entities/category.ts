/**
 * Domain entity for a category.
 * Timestamps are ISO-8601 strings on the wire (same as {@link CategoryDto}).
 */
export interface Category {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  slug: string;
  image_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}
