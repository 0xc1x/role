/**
 * Domain entity for a tip.
 * Timestamps are ISO-8601 strings on the wire (same as {@link TipDto}).
 */
export interface Tip {
  id: string;
  content: string;
  active: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
}
