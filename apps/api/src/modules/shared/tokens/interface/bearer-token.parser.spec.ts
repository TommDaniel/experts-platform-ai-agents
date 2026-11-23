import { describe, expect, it } from "vitest";
import { parseBearerToken } from "./bearer-token.parser";

describe("parseBearerToken", () => {
  it("extracts a bearer token (case-insensitive scheme)", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
    expect(parseBearerToken("bearer abc123")).toBe("abc123");
    expect(parseBearerToken("  Bearer abc123  ")).toBe("abc123");
  });

  it("returns null when the header is missing or empty", () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("   ")).toBeNull();
  });

  it("returns null for malformed headers", () => {
    expect(parseBearerToken("abc123")).toBeNull();
    expect(parseBearerToken("Basic abc123")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer a b")).toBeNull();
  });
});
