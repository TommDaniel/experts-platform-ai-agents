import { Module } from "@nestjs/common";
import { AuthModule } from "../auth.module";
import { ConfirmAccountController } from "./confirm-account.controller";
import { ConfirmAccountService } from "./confirm-account.service";

@Module({
  imports: [AuthModule],
  controllers: [ConfirmAccountController],
  providers: [ConfirmAccountService],
})
export class ConfirmAccountModule {}
