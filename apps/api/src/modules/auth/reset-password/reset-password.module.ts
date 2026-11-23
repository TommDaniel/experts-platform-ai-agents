import { Module } from "@nestjs/common";
import { EmailModule } from "../../shared/email/email.module";
import { PasswordModule } from "../../shared/password/password.module";
import { ResetPasswordController } from "./reset-password.controller";
import { ResetPasswordService } from "./reset-password.service";

@Module({
  imports: [PasswordModule, EmailModule],
  controllers: [ResetPasswordController],
  providers: [ResetPasswordService],
})
export class ResetPasswordModule {}
