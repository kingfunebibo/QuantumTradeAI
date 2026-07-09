import { Request } from "express";

export interface QueryOptions {
  search?: string;
  sortBy: string;
  order: "asc" | "desc";
}

/**
 * Extracts common query parameters from the request.
 */
export function getQueryOptions(
  req: Request,
  defaultSortBy = "createdAt",
): QueryOptions {
  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim()
      : undefined;

  const sortBy =
    typeof req.query.sortBy === "string" &&
    req.query.sortBy.trim() !== ""
      ? req.query.sortBy.trim()
      : defaultSortBy;

  const order =
    req.query.order === "asc" ? "asc" : "desc";

  return {
    search,
    sortBy,
    order,
  };
}