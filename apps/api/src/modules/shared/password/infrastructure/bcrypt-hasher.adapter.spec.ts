import { describe, expect, it } from "vitest";
import { BCRYPT_COST } from "./bcrypt-hasher.adapter";
import { BcryptHasherAdapter } from "./bcrypt-hasher.adapter";

describe("BcryptHasherAdapter", () => {
  const service = new BcryptHasherAdapter();

  it("hashes a password with bcrypt cost 10", async () => {
    const hash = await service.hash("correct horse battery staple");
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  it("verifies the correct password as true", async () => {
    const hash = await service.hash("secret-password");
    await expect(service.verify("secret-password", hash)).resolves.toBe(true);
  });

  it("verifies the wrong password as false", async () => {
    const hash = await service.hash("secret-password");
    await expect(service.verify("wrong-password", hash)).resolves.toBe(false);
  });

  it("uses the documented bcrypt cost of 10", () => {
    expect(BCRYPT_COST).toBe(10);
  });
});
