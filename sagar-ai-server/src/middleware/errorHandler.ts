import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: "not_found",
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      message: "Request validation failed.",
      details: err.issues,
    });
    return;
  }

  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: "request_error",
      message: err.message,
      details: err.details,
    });
    return;
  }

  // Logged in full server-side; the client only ever gets a generic
  // message - internal error text can carry paths, provider details or
  // upstream responses that must not leave the server.
  console.error("[sagar-ai-server] Unhandled error:", err);

  res.status(500).json({
    error: "internal_error",
    message: "Sagar could not process this request. Please try again.",
  });
}
