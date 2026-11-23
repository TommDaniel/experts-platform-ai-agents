import { LoggerService } from "@nestjs/common";
import { context as otelContext, trace, TraceFlags } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

type Severity = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

const oTelLogger = logs.getLogger("api");

const SEVERITY_NUMBERS: Record<Severity, SeverityNumber> = {
  fatal: SeverityNumber.FATAL,
  error: SeverityNumber.ERROR,
  warn: SeverityNumber.WARN,
  info: SeverityNumber.INFO,
  debug: SeverityNumber.DEBUG,
  trace: SeverityNumber.TRACE,
};

function formatMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function lastStringParam(params: unknown[]): string | undefined {
  for (let i = params.length - 1; i >= 0; i--) {
    const param = params[i];
    if (typeof param === "string") {
      return param;
    }
  }
  return undefined;
}

export class ObservabilityLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]): void {
    this.emit("info", "LOG", message, params);
  }

  error(message: unknown, stack?: unknown, ...params: unknown[]): void {
    this.emit("error", "ERROR", message, [stack, ...params]);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.emit("warn", "WARN", message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.emit("debug", "DEBUG", message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.emit("trace", "VERBOSE", message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.emit("fatal", "FATAL", message, params);
  }

  private emit(
    severity: Severity,
    severityText: string,
    message: unknown,
    params: unknown[],
  ): void {
    const context = lastStringParam(params);
    const stack = params.find(
      (param): param is string => typeof param === "string" && param.includes("\n"),
    );

    const prefix = `${new Date().toISOString()} ${severityText}${context ? ` [${context}]` : ""}`;
    if (severity === "error" || severity === "fatal") {
      console.error(prefix, formatMessage(message), stack ?? "");
    } else {
      console.log(prefix, formatMessage(message));
    }

    const span = trace.getSpan(otelContext.active());
    const spanContext = span?.spanContext();
    const sampled =
      spanContext !== undefined &&
      (spanContext.traceFlags & TraceFlags.SAMPLED) === TraceFlags.SAMPLED;

    oTelLogger.emit({
      body: formatMessage(message),
      severityText,
      severityNumber: SEVERITY_NUMBERS[severity],
      context: sampled ? otelContext.active() : undefined,
      attributes: {
        ...(context ? { context } : {}),
        ...(stack
          ? { "exception.message": formatMessage(message), "exception.stacktrace": stack }
          : {}),
      },
    });
  }
}
