import { z } from "zod";

/**
 * Common UUID/CUID identifier.
 */
export const idSchema = z.object({
  id: z.string().min(1),
});

/**
 * Common pagination query.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Search query.
 */
export const searchSchema = paginationSchema.extend({
  search: z.string().optional(),
});

/**
 * Boolean query helper.
 */
export const booleanQuery = z.coerce.boolean();