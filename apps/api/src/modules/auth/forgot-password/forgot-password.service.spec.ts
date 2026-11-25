import "reflect-metadata";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { passwordResetTokens, users } from "../../../db/schema";
import { EMAIL_TRANSPORT } from "../../shared/email/domain/email.constants";
import { EmailModule } from "../../shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../../shared/email/domain/email.types";
import { PasswordModule } from "../../shared/password/password.module";
import { hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import { ForgotPasswordModule } from "./forgot-password.module";
import { ForgotPasswordService } from "./forgot-password.service";

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function tokenFromLink(message: EmailMessage): string {
  const match = /token=([^&"']+)/.exec(message.html);
  if (!match) {
    throw new Error("Email does not contain a reset link with a token");
  }
  return match[1]!;
}

describe("ForgotPasswordService", () => {
  let db: DrizzleDatabase;
  let service: ForgotPasswordService;
  let existingUserId: number;
  let sentEmails: EmailMessage[];

  const existingEmail = `forgot-existing-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const unknownEmail = `forgot-unknown-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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
        ForgotPasswordModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(fakeTransport)
      .compile();

    db = moduleRef.get(DRIZZLE);
    service = moduleRef.get(ForgotPasswordService);
    sentEmails = [];

    const [existingUser] = await db
      .insert(users)
      .values({
        email: existingEmail,
        passwordHash: "not-a-real-hash",
        firstName: "Ada",
        lastName: "Lovelace",
      })
      .returning({ id: users.id });
    existingUserId = existingUser!.id;
  });

  afterEach(async () => {
    sentEmails.length = 0;
    vi.mocked(fakeTransport.send).mockClear();
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, existingUserId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, existingUserId));
  });

  it("creates a single-use 24h token and sends the reset email with the correct link", async () => {
    await service.requestPasswordReset(existingEmail);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(existingEmail);

    const token = tokenFromLink(sentEmails[0]!);
    expect(token).toHaveLength(43);

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, existingUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.usedAt).toBeNull();
    const ttl = rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime();
    expect(ttl).toBeGreaterThan(RESET_TOKEN_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(RESET_TOKEN_TTL_MS + 5_000);
  });

  it("revokes previous active tokens before issuing a new one", async () => {
    await service.requestPasswordReset(existingEmail);
    const firstToken = tokenFromLink(sentEmails[0]!);

    sentEmails.length = 0;
    await service.requestPasswordReset(existingEmail);
    const secondToken = tokenFromLink(sentEmails[0]!);
    expect(secondToken).not.toBe(firstToken);

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, existingUserId));
    expect(rows).toHaveLength(2);

    const [first, second] = rows.sort((a, b) => a.id - b.id);
    expect(first!.usedAt).not.toBeNull();
    expect(second!.usedAt).toBeNull();
    expect(second!.tokenHash).toBe(hashToken(secondToken));
  });

  it("does nothing observable for an unknown email", async () => {
    await service.requestPasswordReset(unknownEmail);

    expect(sentEmails).toHaveLength(0);

    const rows = await db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .innerJoin(users, eq(passwordResetTokens.userId, users.id))
      .where(eq(users.email, unknownEmail));
    expect(rows).toHaveLength(0);
  });

  it("normalizes the email to lowercase before the lookup", async () => {
    await service.requestPasswordReset(existingEmail.toUpperCase());

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(existingEmail);

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, existingUserId));
    expect(rows).toHaveLength(1);
  });

  it("keeps the token persisted and does not throw when the email transport fails", async () => {
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
        ForgotPasswordModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(failingTransport)
      .compile();

    const failingService = moduleRef.get(ForgotPasswordService);
    await expect(failingService.requestPasswordReset(existingEmail)).resolves.toBeUndefined();

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(eq(passwordResetTokens.userId, existingUserId), isNull(passwordResetTokens.usedAt)),
      );
    expect(rows).toHaveLength(1);
  });
});
