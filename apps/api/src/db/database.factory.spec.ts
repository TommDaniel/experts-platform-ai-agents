import { describe, expect, it } from "vitest";
import { createDrizzleDatabase } from "./database.factory";
import { authSchema } from "./schema";

function fakeConfig(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  };
}

describe("createDrizzleDatabase", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => createDrizzleDatabase(fakeConfig({}))).toThrow("DATABASE_URL is missing");
  });

  it("creates a Drizzle database with the auth schema when DATABASE_URL is set", () => {
    const db = createDrizzleDatabase(
      fakeConfig({ DATABASE_URL: "postgresql://localhost:5432/test" }),
    );
    expect(db.select).toBeTypeOf("function");
    expect(Object.keys(authSchema)).toEqual([
      "users",
      "sessions",
      "emailConfirmationTokens",
      "passwordResetTokens",
    ]);
  });
});
