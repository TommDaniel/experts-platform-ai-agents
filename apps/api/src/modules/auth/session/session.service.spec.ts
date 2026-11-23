import "reflect-metadata";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DatabaseModule, DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { sessions, users } from "../../../db/schema";
import { hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  let db: DrizzleDatabase;
  let service: SessionService;
  let userId: number;
  const email = `session-service-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
      providers: [SessionService],
    }).compile();
    db = moduleRef.get(DRIZZLE);
    service = moduleRef.get(SessionService);

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: "not-a-real-hash",
        firstName: "Session",
        lastName: "Service",
      })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterEach(async () => {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  it("creates a session storing only the sha256 hash of the token", async () => {
    const token = await service.createSession(userId);
    expect(token).toHaveLength(43);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(rows[0]!.revokedAt).toBeNull();
  });

  it("validates an active token returning the session and the user", async () => {
    const token = await service.createSession(userId);
    const session = await service.validateSession(token);

    expect(session).not.toBeNull();
    expect(session!.userId).toBe(userId);
    expect(session!.tokenHash).toBe(hashToken(token));
    expect(session!.user).toMatchObject({
      id: userId,
      email,
      firstName: "Session",
      lastName: "Service",
    });
  });

  it("returns null for an unknown token", async () => {
    await expect(service.validateSession(generateUnknownToken())).resolves.toBeNull();
  });

  it("returns null once the session is revoked", async () => {
    const token = await service.createSession(userId);
    await service.revokeSession(token);
    await expect(service.validateSession(token)).resolves.toBeNull();
  });

  it("revokes a session and is idempotent", async () => {
    const token = await service.createSession(userId);
    await service.revokeSession(token);
    await expect(service.revokeSession(token)).resolves.toBeUndefined();

    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revokedAt).not.toBeNull();
  });

  it("keeps only the last session valid for a user (last wins)", async () => {
    const first = await service.createSession(userId);
    const second = await service.createSession(userId);

    await expect(service.validateSession(first)).resolves.toBeNull();
    await expect(service.validateSession(second)).resolves.not.toBeNull();
  });

  it("returns null when the user no longer exists", async () => {
    const token = await service.createSession(userId);
    await db.delete(users).where(eq(users.id, userId));
    await expect(service.validateSession(token)).resolves.toBeNull();
  });
});

function generateUnknownToken(): string {
  return "unknown-unknown-unknown-unknown-unknown";
}
