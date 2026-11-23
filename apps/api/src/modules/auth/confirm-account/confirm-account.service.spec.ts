import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { emailConfirmationTokens, sessions, users } from "../../../db/schema";
import { EMAIL_TRANSPORT } from "../../shared/email/domain/email.constants";
import { EmailModule } from "../../shared/email/email.module";
import type { EmailTransport } from "../../shared/email/domain/email.types";
import { PasswordModule } from "../../shared/password/password.module";
import { AuthModule } from "../auth.module";
import { generateSessionToken, hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import { SessionService } from "../session/session.service";
import { ConfirmAccountModule } from "./confirm-account.module";
import {
  ConfirmAccountService,
  EXPIRED_LINK_MESSAGE,
  INVALID_LINK_MESSAGE,
  USED_LINK_MESSAGE,
} from "./confirm-account.service";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

describe("ConfirmAccountService", () => {
  let db: DrizzleDatabase;
  let service: ConfirmAccountService;
  let sessionService: SessionService;

  const unverifiedEmail = `confirm-service-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  let unverifiedUserId: number;

  const fakeTransport: EmailTransport = {
    send: vi.fn<EmailTransport["send"]>(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        PasswordModule,
        EmailModule,
        AuthModule,
        ConfirmAccountModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(fakeTransport)
      .compile();

    db = moduleRef.get(DRIZZLE);
    service = moduleRef.get(ConfirmAccountService);
    sessionService = moduleRef.get(SessionService);

    const [unverifiedUser] = await db
      .insert(users)
      .values({
        email: unverifiedEmail,
        passwordHash: "not-a-real-hash",
        firstName: "Ada",
        lastName: "Lovelace",
        emailVerifiedAt: null,
      })
      .returning({ id: users.id });
    unverifiedUserId = unverifiedUser!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, unverifiedUserId));
  });

  async function insertToken(
    userId: number,
    options: { expiresAt?: Date; usedAt?: Date } = {},
  ): Promise<string> {
    const token = generateSessionToken();
    await db.insert(emailConfirmationTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: options.expiresAt ?? new Date(Date.now() + TOKEN_TTL_MS),
      usedAt: options.usedAt ?? null,
    });
    return token;
  }

  async function clearSessionsAndTokens(userId: number): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(emailConfirmationTokens).where(eq(emailConfirmationTokens.userId, userId));
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, userId));
  }

  it("confirms a valid token, activates the account, consumes the token and creates a session", async () => {
    await clearSessionsAndTokens(unverifiedUserId);
    const token = await insertToken(unverifiedUserId);

    const sessionToken = await service.confirmAccount(token);

    expect(sessionToken).toHaveLength(43);

    const [user] = await db.select().from(users).where(eq(users.id, unverifiedUserId));
    expect(user!.emailVerifiedAt).not.toBeNull();

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, unverifiedUserId));
    expect(tokenRow!.usedAt).not.toBeNull();

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, unverifiedUserId));
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]!.revokedAt).toBeNull();
    expect(sessionRows[0]!.tokenHash).toBe(hashToken(sessionToken));
  });

  it("rejects an expired token without activating the account, consuming the token or creating a session", async () => {
    await clearSessionsAndTokens(unverifiedUserId);
    const token = await insertToken(unverifiedUserId, {
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.confirmAccount(token)).rejects.toThrow(
      new BadRequestException(EXPIRED_LINK_MESSAGE),
    );

    const [user] = await db.select().from(users).where(eq(users.id, unverifiedUserId));
    expect(user!.emailVerifiedAt).toBeNull();

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, unverifiedUserId));
    expect(tokenRow!.usedAt).toBeNull();

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, unverifiedUserId));
    expect(sessionRows).toHaveLength(0);
  });

  it("rejects an already used token with no changes", async () => {
    await clearSessionsAndTokens(unverifiedUserId);
    const usedAt = new Date(Date.now() - 60 * 1000);
    const token = await insertToken(unverifiedUserId, { usedAt });

    await expect(service.confirmAccount(token)).rejects.toThrow(
      new BadRequestException(USED_LINK_MESSAGE),
    );

    const [user] = await db.select().from(users).where(eq(users.id, unverifiedUserId));
    expect(user!.emailVerifiedAt).toBeNull();

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, unverifiedUserId));
    expect(tokenRow!.usedAt).toEqual(usedAt);

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, unverifiedUserId));
    expect(sessionRows).toHaveLength(0);
  });

  it("rejects an unknown token with the invalid-link message", async () => {
    await clearSessionsAndTokens(unverifiedUserId);

    await expect(service.confirmAccount(generateSessionToken())).rejects.toThrow(
      new BadRequestException(INVALID_LINK_MESSAGE),
    );
  });

  it("treats an already active account with a valid token as an idempotent success", async () => {
    await clearSessionsAndTokens(unverifiedUserId);
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(users.id, unverifiedUserId));
    const token = await insertToken(unverifiedUserId);

    const sessionToken = await service.confirmAccount(token);

    expect(sessionToken).toHaveLength(43);

    const [user] = await db.select().from(users).where(eq(users.id, unverifiedUserId));
    expect(user!.emailVerifiedAt).not.toBeNull();

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, unverifiedUserId));
    expect(tokenRow!.usedAt).not.toBeNull();

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, unverifiedUserId));
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0]!.revokedAt).toBeNull();
  });

  it("revokes any previous session of the user (last wins)", async () => {
    await clearSessionsAndTokens(unverifiedUserId);
    const previousSession = await sessionService.createSession(unverifiedUserId);
    const token = await insertToken(unverifiedUserId);

    const newSession = await service.confirmAccount(token);

    expect(newSession).not.toBe(previousSession);

    const sessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, unverifiedUserId));
    expect(sessionRows).toHaveLength(2);

    const active = sessionRows.filter((row) => row.revokedAt === null);
    const revoked = sessionRows.filter((row) => row.revokedAt !== null);
    expect(active).toHaveLength(1);
    expect(revoked).toHaveLength(1);
    expect(active[0]!.tokenHash).toBe(hashToken(newSession));
  });
});
