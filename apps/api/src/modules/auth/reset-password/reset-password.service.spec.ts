import "reflect-metadata";
import { BadRequestException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { passwordResetTokens, users } from "../../../db/schema";
import { EMAIL_TRANSPORT } from "../../shared/email/domain/email.constants";
import { EmailModule } from "../../shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../../shared/email/domain/email.types";
import { PasswordModule } from "../../shared/password/password.module";
import { PASSWORD_HASHER } from "../../shared/password/domain/password.port";
import type { PasswordHasher } from "../../shared/password/domain/password.port";
import { hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import { ResetPasswordModule } from "./reset-password.module";
import {
  EXPIRED_TOKEN_MESSAGE,
  INVALID_TOKEN_MESSAGE,
  ResetPasswordService,
  USED_TOKEN_MESSAGE,
} from "./reset-password.service";

describe("ResetPasswordService", () => {
  let db: DrizzleDatabase;
  let service: ResetPasswordService;
  let passwordHasher: PasswordHasher;
  let userId: number;
  let sentEmails: EmailMessage[];

  const email = `reset-service-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const oldPassword = "old-password-123";
  const newPassword = "new-password-456";
  const token = "test-raw-token-for-reset";

  const fakeTransport: EmailTransport = {
    send: vi.fn<EmailTransport["send"]>(async (message) => {
      sentEmails.push(message);
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        PasswordModule,
        EmailModule,
        ResetPasswordModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(fakeTransport)
      .compile();

    db = moduleRef.get(DRIZZLE);
    service = moduleRef.get(ResetPasswordService);
    passwordHasher = moduleRef.get(PASSWORD_HASHER);
    sentEmails = [];

    const oldPasswordHash = await passwordHasher.hash(oldPassword);
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: oldPasswordHash,
        firstName: "Ada",
        lastName: "Lovelace",
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterEach(async () => {
    sentEmails.length = 0;
    vi.mocked(fakeTransport.send).mockClear();
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    await db
      .update(users)
      .set({ passwordHash: await passwordHasher.hash(oldPassword) })
      .where(eq(users.id, userId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  async function insertToken(overrides: { used?: boolean; expired?: boolean } = {}) {
    const expiresAt = overrides.expired
      ? new Date(Date.now() - 60_000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);
    const usedAt = overrides.used ? new Date() : null;
    const [row] = await db
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash: hashToken(token),
        expiresAt,
        usedAt,
      })
      .returning({ id: passwordResetTokens.id });
    return row!.id;
  }

  async function userRow() {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    return row!;
  }

  it("updates the password hash, marks the token as used and sends the success email", async () => {
    await insertToken();

    await expect(service.resetPassword(token, newPassword)).resolves.toBeUndefined();

    const user = await userRow();
    expect(await passwordHasher.verify(newPassword, user.passwordHash)).toBe(true);
    expect(await passwordHasher.verify(oldPassword, user.passwordHash)).toBe(false);

    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(tokenRow!.usedAt).not.toBeNull();

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(email);
    expect(sentEmails[0]!.subject).toBe("Your password has been reset");
  });

  it("rejects an expired token without changing anything", async () => {
    await insertToken({ expired: true });
    const before = (await userRow()).passwordHash;

    await expect(service.resetPassword(token, newPassword)).rejects.toThrow(
      new BadRequestException(EXPIRED_TOKEN_MESSAGE),
    );

    const after = await userRow();
    expect(after.passwordHash).toBe(before);

    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(tokenRow!.usedAt).toBeNull();
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an already-used token without changing anything", async () => {
    await insertToken({ used: true });
    const before = (await userRow()).passwordHash;

    await expect(service.resetPassword(token, newPassword)).rejects.toThrow(
      new BadRequestException(USED_TOKEN_MESSAGE),
    );

    expect((await userRow()).passwordHash).toBe(before);
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an unknown token without changing anything", async () => {
    const before = (await userRow()).passwordHash;

    await expect(service.resetPassword("unknown-token", newPassword)).rejects.toThrow(
      new BadRequestException(INVALID_TOKEN_MESSAGE),
    );

    expect((await userRow()).passwordHash).toBe(before);
    expect(sentEmails).toHaveLength(0);
  });

  it("applies the reset and does not throw when the success email transport fails", async () => {
    const failingTransport: EmailTransport = {
      send: vi.fn<EmailTransport["send"]>(async () => {
        throw new Error("SMTP unavailable");
      }),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        PasswordModule,
        EmailModule,
        ResetPasswordModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(failingTransport)
      .compile();

    const failingService = moduleRef.get(ResetPasswordService);
    await insertToken();

    await expect(failingService.resetPassword(token, newPassword)).resolves.toBeUndefined();

    const user = await userRow();
    expect(await passwordHasher.verify(newPassword, user.passwordHash)).toBe(true);

    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    expect(tokenRow!.usedAt).not.toBeNull();
  });
});
