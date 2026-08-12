import type { z } from 'zod';
import type {
  ApiErrorSchema,
  LoginRequestSchema,
  RegisterRequestSchema,
  RefreshRequestSchema,
  LogoutRequestSchema,
  InviteBusinessRequestSchema,
  ListBusinessesQuerySchema,
  ListBusinessLocationsQuerySchema,
  ListOffersQuerySchema,
  CreateOrderRequestSchema,
  UpdateOrderStatusSchema,
  ListOrdersQuerySchema,
  ListBusinessOrdersQuerySchema,
  PaginationMetaSchema,
  PaginationQuerySchema,
} from '../schemas/api.schema';

// ─── Generic API types ──────────────────────────────────────────────────────

/** Pagination metadata for list endpoints (aligned with `page` / `limit` query). */
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/** Shared page/limit query fragment. */
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * Optional full envelope for a single resource.
 * Prefer returning `T` directly from Nest controllers; HTTP status already
 * conveys success/failure. Keep this for clients that expect an envelope.
 */
export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error: ApiError | null;
};

/**
 * Alternate paginated envelope (`success` + `pagination`).
 * Prefer {@link PaginatedData} for Nest HTTP list endpoints.
 */
export type PaginatedResponse<T> = {
  success: true;
  data: T[];
  pagination: PaginationMeta;
};

/**
 * Canonical paginated list body for Role API:
 * `{ data: T[], meta: PaginationMeta }`
 */
export type PaginatedData<T> = {
  data: T[];
  meta: PaginationMeta;
};

/** @deprecated Use {@link PaginationMeta} — same shape. */
export type PaginatedMeta = PaginationMeta;

// ─── Response builders (type-safe factories) ────────────────────────────────

export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    total_pages: limit > 0 ? Math.ceil(total / limit) : 0,
  };
}

export function paginatedData<T>(
  data: readonly T[],
  meta: PaginationMeta,
): PaginatedData<T> {
  return { data: [...data], meta };
}

export function paginatedDataFromQuery<T>(
  data: readonly T[],
  query: Pick<PaginationMeta, 'page' | 'limit'>,
  total: number,
): PaginatedData<T> {
  return paginatedData(data, buildPaginationMeta(query.page, query.limit, total));
}

export function apiOk<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function apiFail(error: ApiError): ApiResponse<null> {
  return { success: false, data: null, error };
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type InviteBusinessRequest = z.infer<typeof InviteBusinessRequestSchema>;
export type ListBusinessesQuery = z.infer<typeof ListBusinessesQuerySchema>;
export type ListBusinessLocationsQuery = z.infer<typeof ListBusinessLocationsQuerySchema>;

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'business' | 'admin';
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at: string | null;
  user: AuthUser;
}

// ─── Offers ─────────────────────────────────────────────────────────────────

export type ListOffersQuery = z.infer<typeof ListOffersQuerySchema>;

export interface OfferWithBusiness {
  id: string;
  business_id: string;
  business_location_id: string;
  title: string;
  description: string | null;
  image: string | null;
  category_ids: string[];
  categories: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  original_price: number;
  discounted_price: number;
  discount_percentage: number | null;
  stock: number;
  initial_stock: number;
  pickup_start: string;
  pickup_end: string;
  is_active: boolean;
  includes: string | null;
  allergens: string | null;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
  business: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    rating: number | null;
  };
  location: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    zone: string | null;
  };
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusSchema>;
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;
export type ListBusinessOrdersQuery = z.infer<typeof ListBusinessOrdersQuerySchema>;
