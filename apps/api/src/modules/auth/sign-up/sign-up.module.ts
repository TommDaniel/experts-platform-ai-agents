import { Module } from "@nestjs/common";
import { EmailModule } from "../../shared/email/email.module";
import { PasswordModule } from "../../shared/password/password.module";
import { SignUpController } from "./sign-up.controller";
import { SignUpService } from "./sign-up.service";

@Module({
  imports: [PasswordModule, EmailModule],
  controllers: [SignUpController],
  providers: [SignUpService],
  exports: [SignUpService],
})
export class SignUpModule {}
