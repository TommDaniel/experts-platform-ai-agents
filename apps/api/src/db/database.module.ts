import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createDrizzleDatabase } from "./database.factory";
import type { DrizzleDatabase } from "./database.factory";

export const DRIZZLE = Symbol("DRIZZLE");
export type { DrizzleDatabase };

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DrizzleDatabase => createDrizzleDatabase(config),
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
