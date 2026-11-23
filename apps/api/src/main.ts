import "./observability/observability";
import "reflect-metadata";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { httpMetricsMiddleware } from "./observability/http-metrics.middleware";
import { ObservabilityLogger } from "./observability/observability.logger";
import { shutdownObservability } from "./observability/observability";
import { uploadsRootDir } from "./modules/connections/uploads.util";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ObservabilityLogger(),
  });
  app.setGlobalPrefix("api/v1");
  app.use(httpMetricsMiddleware);
  app.use("/api/v1/uploads", express.static(uploadsRootDir(), { fallthrough: false }));
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();

process.on("SIGINT", () => void shutdownObservability());
process.on("SIGTERM", () => void shutdownObservability());
