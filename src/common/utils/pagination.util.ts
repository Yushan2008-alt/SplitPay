// src/common/utils/pagination.util.ts

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  skip: number;
  take: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Normalise incoming pagination params and compute skip/take for TypeORM.
 */
export function buildPaginationQuery(
  params: PaginationParams,
): PaginationQuery {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIMIT));
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Build the pagination metadata to include in the response envelope.
 */
export function buildPaginationMeta(
  params: PaginationParams,
  total: number,
): PaginationMeta {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIMIT));
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
