import { ParsedQs } from "qs";

/**
 * Generic API Response
 */
export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

/**
 * Pagination Metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated API Response
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Common Query Parameters
 */
export interface PaginationQuery extends ParsedQs {
  page?: string;
  limit?: string;
}

export interface SearchQuery extends PaginationQuery {
  search?: string;
}

export interface SortQuery extends SearchQuery {
  sortBy?: string;
  order?: "asc" | "desc";
}