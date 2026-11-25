import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const logger = new Logger("HTTP");

export function accessLogMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const start = performance.now();

  response.on("finish", () => {
    const route = request.route?.path;
    const path = Array.isArray(route) ? (route[0] ?? request.path) : (route ?? request.path);
    const status = response.statusCode ?? 0;
    const durationMs = Math.round(performance.now() - start);
    const message = `${request.method} ${path} ${status} ${durationMs}ms`;

    if (status >= 500) {
      logger.error(message);
    } else if (status >= 400) {
      logger.warn(message);
    } else {
      logger.log(message);
    }
  });

  next();
}
