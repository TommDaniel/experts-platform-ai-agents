import { Module } from "@nestjs/common";
import { TOKEN_SERVICE } from "./domain/token.port";
import { CryptoTokenAdapter } from "./infrastructure/token.adapter";

@Module({
  providers: [{ provide: TOKEN_SERVICE, useClass: CryptoTokenAdapter }],
  exports: [TOKEN_SERVICE],
})
export class TokensModule {}
