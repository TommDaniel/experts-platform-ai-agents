import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./modules/auth/auth.module";
import { ConfirmAccountModule } from "./modules/auth/confirm-account/confirm-account.module";
import { ForgotPasswordModule } from "./modules/auth/forgot-password/forgot-password.module";
import { ResetPasswordModule } from "./modules/auth/reset-password/reset-password.module";
import { SignInModule } from "./modules/auth/sign-in/sign-in.module";
import { SignUpModule } from "./modules/auth/sign-up/sign-up.module";
import { ChatModule } from "./modules/chat/chat.module";
import { ConnectionsModule } from "./modules/connections/connections.module";
import { ExpertsModule } from "./modules/experts/experts.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    SignUpModule,
    SignInModule,
    ForgotPasswordModule,
    ConfirmAccountModule,
    ResetPasswordModule,
    ExpertsModule,
    ConnectionsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
