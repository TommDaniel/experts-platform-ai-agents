import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../../db/database.module";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./session/auth.guard";
import { SessionController } from "./session/session.controller";
import { SessionGuard } from "./session/session.guard";
import { SessionService } from "./session/session.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, SessionController],
  providers: [SessionService, SessionGuard, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [SessionService],
})
export class AuthModule {}
