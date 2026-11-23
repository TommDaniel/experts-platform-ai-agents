import { Module } from "@nestjs/common";
import { PASSWORD_HASHER } from "./domain/password.port";
import { BcryptHasherAdapter } from "./infrastructure/bcrypt-hasher.adapter";

@Module({
  providers: [{ provide: PASSWORD_HASHER, useClass: BcryptHasherAdapter }],
  exports: [PASSWORD_HASHER],
})
export class PasswordModule {}
