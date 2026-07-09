import { Request } from "express";

import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
} from "../constants/pagination.constants";

export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Extracts pagination information from the request query.
 */
export function getPagination(
  req: Request,
): PaginationOptions {
  const page = Math.max(
    Number(req.query.page) || DEFAULT_PAGE,
    DEFAULT_PAGE,
  );

  const limit = Math.min(
    Math.max(
      Number(req.query.limit) || DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

/**
 * Builds pagination metadata.
 */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}