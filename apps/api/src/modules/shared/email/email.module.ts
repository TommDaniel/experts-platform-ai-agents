import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EMAIL_TRANSPORT } from "./domain/email.constants";
import { createEmailTransport } from "./infrastructure/email-transport.factory";
import { EmailService } from "./application/email.service";

@Module({
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createEmailTransport(config),
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
