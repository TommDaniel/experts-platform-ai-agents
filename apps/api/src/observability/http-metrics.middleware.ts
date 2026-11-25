import { metrics } from "@opentelemetry/api";
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_HTTP_ROUTE,
} from "@opentelemetry/semantic-conventions";
import type { NextFunction, Request, Response } from "express";

const meter = metrics.getMeter("api.http");

// Duration is emitted by @opentelemetry/instrumentation-http as
// `http.server.request.duration` in seconds. Keeping a second histogram here
// (milliseconds) produced duplicate buckets and an invalid p95, so this
// middleware only owns the request counter.
const requestCounter = meter.createCounter("http.server.request.count", {
  description: "Total number of HTTP requests received",
});

export function httpMetricsMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
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
  });

  next();
}
