import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions";

const DEFAULT_TRACES_ENDPOINT = "http://localhost:4318/v1/traces";
const DEFAULT_METRICS_ENDPOINT = "http://localhost:9009/otlp/v1/metrics";
const DEFAULT_LOGS_ENDPOINT = "http://localhost:3100/otlp/v1/logs";
const METRIC_EXPORT_INTERVAL_MS = 10_000;

let sdk: NodeSDK | null = null;

export function initObservability(): void {
  if (process.env.OTEL_ENABLED === "false") {
    return;
  }
  if (sdk) {
    return;
  }

  if (process.env.OTEL_DEBUG === "1") {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "api",
    [ATTR_SERVICE_INSTANCE_ID]: process.env.OTEL_SERVICE_INSTANCE_ID ?? `api-${process.pid}`,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? "development",
  });

  sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_TRACES_ENDPOINT ?? DEFAULT_TRACES_ENDPOINT,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: process.env.OTEL_METRICS_ENDPOINT ?? DEFAULT_METRICS_ENDPOINT,
        }),
        exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: process.env.OTEL_LOGS_ENDPOINT ?? DEFAULT_LOGS_ENDPOINT,
        }),
      }),
    ],
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
    ],
  });

  sdk.start();
}

export async function shutdownObservability(): Promise<void> {
  if (!sdk) {
    return;
  }
  await sdk.shutdown();
  sdk = null;
}

initObservability();
