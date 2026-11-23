import { metrics } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";
import type { NextFunction, Request, Response } from "express";

const meter = metrics.getMeter("api.http");

const requestCounter = meter.createCounter("http.server.request.count", {
  description: "Total number of HTTP requests received",
});

const requestDuration = meter.createHistogram("http.server.request.duration", {
  description: "Time taken to serve an HTTP request",
  unit: "ms",
});

export function httpMetricsMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const start = performance.now();

  response.on("finish", () => {
    const route = request.route?.path;
    const attributes = {
      [ATTR_HTTP_REQUEST_METHOD]: request.method ?? "UNKNOWN",
      [ATTR_HTTP_ROUTE]: Array.isArray(route)
        ? (route[0] ?? request.path)
        : (route ?? request.path),
      [ATTR_HTTP_RESPONSE_STATUS_CODE]: String(response.statusCode ?? 0),
    };
    requestCounter.add(1, attributes);
    requestDuration.record(performance.now() - start, attributes);
  });

  next();
}
