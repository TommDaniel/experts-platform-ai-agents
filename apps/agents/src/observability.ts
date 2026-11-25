import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
} from "@opentelemetry/semantic-conventions";

if (process.env.OTEL_ENABLED !== "false") {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "agents",
      [ATTR_SERVICE_INSTANCE_ID]: process.env.OTEL_SERVICE_INSTANCE_ID ?? `agents-${process.pid}`,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? "development",
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_TRACES_ENDPOINT ?? "http://localhost:4318/v1/traces",
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: process.env.OTEL_METRICS_ENDPOINT ?? "http://localhost:9009/otlp/v1/metrics",
        }),
        exportIntervalMillis: 10_000,
      }),
    ],
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: process.env.OTEL_LOGS_ENDPOINT ?? "http://localhost:3100/otlp/v1/logs",
        }),
      }),
    ],
    instrumentations: [new HttpInstrumentation()],
  });

  sdk.start();

  const shutdown = (): void => {
    void sdk.shutdown();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
