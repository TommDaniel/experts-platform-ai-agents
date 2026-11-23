import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import {
  ATTR_DB_OPERATION_NAME,
  ATTR_DB_QUERY_TEXT,
  ATTR_DB_SYSTEM_NAME,
  DB_SYSTEM_NAME_VALUE_POSTGRESQL,
} from "@opentelemetry/semantic-conventions";
import type { Sql } from "postgres";

const tracer = trace.getTracer("api.postgres");
const meter = metrics.getMeter("api.postgres");

const queryCounter = meter.createCounter("db.query.count", {
  description: "Number of SQL queries executed against PostgreSQL",
  unit: "1",
});

const queryDuration = meter.createHistogram("db.query.duration", {
  description: "Duration of PostgreSQL queries",
  unit: "ms",
});

const OPERATION_RE =
  /^\s*(select|insert|update|delete|create|alter|drop|truncate|begin|commit|rollback|with|set|show|grant|revoke)/i;

function deriveOperation(sql: string): string {
  const match = OPERATION_RE.exec(sql);
  return match?.[1]?.toLowerCase() ?? "other";
}

function toException(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const DB_ATTRIBUTES = {
  [ATTR_DB_SYSTEM_NAME]: DB_SYSTEM_NAME_VALUE_POSTGRESQL,
} as const;

function recordQueryMetrics(operation: string, durationMs: number): void {
  const attributes = { ...DB_ATTRIBUTES, [ATTR_DB_OPERATION_NAME]: operation };
  queryCounter.add(1, attributes);
  queryDuration.record(durationMs, attributes);
}

type UnsafeParameters = Parameters<Sql["unsafe"]>[1];
type UnsafeOptions = Parameters<Sql["unsafe"]>[2];

function instrumentUnsafe(sql: Sql): void {
  const originalUnsafe = sql.unsafe;

  sql.unsafe = ((query: string, parameters?: UnsafeParameters, queryOptions?: UnsafeOptions) => {
    const operation = deriveOperation(query);
    const start = performance.now();
    const span = tracer.startSpan(`db.query.${operation}`, {
      attributes: {
        ...DB_ATTRIBUTES,
        [ATTR_DB_OPERATION_NAME]: operation,
        [ATTR_DB_QUERY_TEXT]: query,
      },
    });
    const spanContext = trace.setSpan(context.active(), span);

    let finished = false;
    const finish = (error?: unknown): void => {
      if (finished) {
        return;
      }
      finished = true;
      const durationMs = performance.now() - start;
      if (error !== undefined) {
        span.recordException(toException(error));
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      recordQueryMetrics(operation, durationMs);
      span.end();
    };

    const pending = context.with(spanContext, () =>
      originalUnsafe.call(sql, query, parameters, queryOptions),
    );

    void pending.then(
      () => finish(),
      (error: unknown) => finish(error),
    );

    return pending;
  }) as Sql["unsafe"];
}

export function instrumentPostgresClient<T extends Sql>(client: T): T {
  instrumentUnsafe(client);

  const originalBegin = client.begin;
  client.begin = ((...args: unknown[]) => {
    const [first, second] = args;
    const beginOptions = typeof first === "function" ? undefined : first;
    const callback = (typeof first === "function" ? first : second) as (sql: Sql) => unknown;

    const span = tracer.startSpan("db.transaction", {
      attributes: {
        ...DB_ATTRIBUTES,
        [ATTR_DB_OPERATION_NAME]: "transaction",
      },
    });
    const spanContext = trace.setSpan(context.active(), span);

    const transaction = (sql: Sql): unknown => {
      instrumentUnsafe(sql);
      return callback(sql);
    };

    const begin = originalBegin as (...args: unknown[]) => Promise<unknown>;
    return context.with(spanContext, () => {
      const pending =
        beginOptions === undefined
          ? begin.call(client, transaction)
          : begin.call(client, beginOptions, transaction);
      return pending.then(
        (result: unknown) => {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          return result;
        },
        (error: unknown) => {
          span.recordException(toException(error));
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
          throw error;
        },
      );
    });
  }) as Sql["begin"];

  return client;
}
