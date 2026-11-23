export const TOKEN_SERVICE = Symbol("TOKEN_SERVICE");

export interface TokenService {
  generate(): string;
  hash(token: string): string;
}
