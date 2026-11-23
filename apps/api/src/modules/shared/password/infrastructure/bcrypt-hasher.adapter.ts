import bcrypt from "bcrypt";
import type { PasswordHasher } from "../domain/password.port";

export const BCRYPT_COST = 10;

export class BcryptHasherAdapter implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, BCRYPT_COST);
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
