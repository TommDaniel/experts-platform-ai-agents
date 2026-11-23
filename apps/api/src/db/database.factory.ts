import type { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { instrumentPostgresClient } from "../observability/postgres.instrumentation";
import { databaseSchema } from "./schema";

export type DrizzleDatabase = PostgresJsDatabase<typeof databaseSchema>;

export function createDrizzleDatabase(config: Pick<ConfigService, "get">): DrizzleDatabase {
  const url = config.get<string>("DATABASE_URL");
  if (!url) {
    throw new Error("DATABASE_URL is missing. Add it to apps/api/.env (see .env.example).");
  }
  const client = instrumentPostgresClient(postgres(url, { max: 10 }));
  return drizzle(client, { schema: databaseSchema });
}
