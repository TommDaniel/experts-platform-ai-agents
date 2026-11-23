import { Module } from "@nestjs/common";
import { EmailModule } from "../../shared/email/email.module";
import { PasswordModule } from "../../shared/password/password.module";
import { AuthModule } from "../auth.module";
import { SignInController } from "./sign-in.controller";
import { SignInService } from "./sign-in.service";

@Module({
  imports: [AuthModule, PasswordModule, EmailModule],
  controllers: [SignInController],
  providers: [SignInService],
})
export class SignInModule {}
