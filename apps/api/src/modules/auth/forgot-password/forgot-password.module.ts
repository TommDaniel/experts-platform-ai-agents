import { Module } from "@nestjs/common";
import { EmailModule } from "../../shared/email/email.module";
import { ForgotPasswordController } from "./forgot-password.controller";
import { ForgotPasswordService } from "./forgot-password.service";

@Module({
  imports: [EmailModule],
  controllers: [ForgotPasswordController],
  providers: [ForgotPasswordService],
})
export class ForgotPasswordModule {}
