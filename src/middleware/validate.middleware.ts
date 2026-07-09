import {
  NextFunction,
  Request,
  Response,
} from "express";
import { ZodTypeAny } from "zod";

export function validate(
  schema: ZodTypeAny,
  source: "body" | "query" | "params" = "body",
) {
  return (
    req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    try {
      const parsed = schema.parse(req[source]);

      Object.assign(req[source], parsed);

      next();
    } catch (error) {
      next(error);
    }
  };
}