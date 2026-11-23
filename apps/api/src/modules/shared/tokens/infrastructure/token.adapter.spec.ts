import { describe, expect, it } from "vitest";
import { generateSessionToken, hashToken } from "./token.adapter";

describe("generateSessionToken", () => {
  it("returns a 32-byte base64url string (43 chars)", () => {
    const token = generateSessionToken();
    expect(token).toHaveLength(43);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
  });

  it("is unique across calls", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });
});

describe("hashToken", () => {
  it("returns a 64-char sha256 hex digest", () => {
    expect(hashToken("abc")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic and differs across tokens", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});
