import { createHash, randomBytes } from "node:crypto";
import type { TokenService } from "../domain/token.port";

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class CryptoTokenAdapter implements TokenService {
  generate(): string {
    return generateSessionToken();
  }

  hash(token: string): string {
    return hashToken(token);
  }
}
