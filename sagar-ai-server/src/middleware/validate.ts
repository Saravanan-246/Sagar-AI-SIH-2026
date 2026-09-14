import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type ValidateTarget = "body" | "query" | "params";

export function validate<T>(
  schema: ZodType<T>,
  target: ValidateTarget = "body"
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      (req as Request & Record<ValidateTarget, T>)[target] = parsed;
      next();
    } catch (error) {
      next(error);
    }
  };
}

type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
