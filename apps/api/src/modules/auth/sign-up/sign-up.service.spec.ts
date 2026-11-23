import "reflect-metadata";
import { InternalServerErrorException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { and, eq, gt, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { emailConfirmationTokens, users } from "../../../db/schema";
import { EMAIL_TRANSPORT } from "../../shared/email/domain/email.constants";
import { EmailModule } from "../../shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../../shared/email/domain/email.types";
import { PasswordModule } from "../../shared/password/password.module";
import { PASSWORD_HASHER } from "../../shared/password/domain/password.port";
import type { PasswordHasher } from "../../shared/password/domain/password.port";
import { hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import { SignUpModule } from "./sign-up.module";
import { SignUpService } from "./sign-up.service";

const CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function tokenFromLink(message: EmailMessage): string {
  const match = /token=([^&"']+)/.exec(message.html);
  if (!match) {
    throw new Error("Email does not contain a confirmation link with a token");
  }
  return match[1]!;
}

function validDto(email: string): Record<string, string> {
  return {
    first_name: "Ada",
    last_name: "Lovelace",
    email,
    password: "password123",
    confirm_password: "password123",
  };
}

describe("SignUpService", () => {
  let db: DrizzleDatabase;
  let service: SignUpService;
  let passwordHasher: PasswordHasher;
  let existingUserId: number;
  let sentEmails: EmailMessage[];

  const existingEmail = `sign-up-existing-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const freshEmail = `sign-up-fresh-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  const fakeTransport: EmailTransport = {
    send: vi.fn<EmailTransport["send"]>(async (message) => {
      sentEmails.push(message);
    }),
  };

  function buildModule(transport: EmailTransport) {
    return Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        PasswordModule,
        EmailModule,
        SignUpModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(transport)
      .compile();
  }

  beforeAll(async () => {
    const moduleRef = await buildModule(fakeTransport);
    db = moduleRef.get(DRIZZLE);
    service = moduleRef.get(SignUpService);
    passwordHasher = moduleRef.get(PASSWORD_HASHER);
    sentEmails = [];

    const [existingUser] = await db
      .insert(users)
      .values({
        email: existingEmail,
        passwordHash: "not-a-real-hash",
        firstName: "Grace",
        lastName: "Hopper",
      })
      .returning({ id: users.id });
    existingUserId = existingUser!.id;
  });

  afterEach(async () => {
    sentEmails.length = 0;
    vi.mocked(fakeTransport.send).mockClear();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, existingUserId));
  });

  it("creates the user with a bcrypt hash, persists a 24h token and sends the confirmation email", async () => {
    await service.signUp(validDto(freshEmail) as unknown as never);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(freshEmail);

    const token = tokenFromLink(sentEmails[0]!);
    expect(token).toHaveLength(43);
    expect(sentEmails[0]!.html).toContain("http://localhost:5173/auth/confirm-account?token=");

    const [user] = await db.select().from(users).where(eq(users.email, freshEmail));
    expect(user).toBeDefined();
    expect(user!.firstName).toBe("Ada");
    expect(user!.lastName).toBe("Lovelace");
    expect(user!.emailVerifiedAt).toBeNull();
    expect(await passwordHasher.verify("password123", user!.passwordHash)).toBe(true);

    const rows = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, user!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.usedAt).toBeNull();
    const ttl = rows[0]!.expiresAt.getTime() - rows[0]!.createdAt.getTime();
    expect(ttl).toBeGreaterThan(CONFIRMATION_TOKEN_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(CONFIRMATION_TOKEN_TTL_MS + 5_000);

    await db.delete(users).where(eq(users.id, user!.id));
  });

  it("returns the generic path for an existing email with no user, token or email", async () => {
    const countBefore = await db.select({ id: users.id }).from(users);

    await service.signUp(validDto(existingEmail) as unknown as never);

    expect(sentEmails).toHaveLength(0);

    const countAfter = await db.select({ id: users.id }).from(users);
    expect(countAfter).toHaveLength(countBefore.length);

    const rows = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, existingUserId));
    expect(rows).toHaveLength(0);
  });

  it("normalizes the email to lowercase before saving and before the duplicate check", async () => {
    const uppercase = `SIGN-UP-CASE-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await service.signUp(validDto(uppercase) as unknown as never);

    const [user] = await db.select().from(users).where(eq(users.email, uppercase.toLowerCase()));
    expect(user).toBeDefined();
    expect(user!.email).toBe(uppercase.toLowerCase());
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(uppercase.toLowerCase());

    await db.delete(users).where(eq(users.id, user!.id));
  });

  it("treats an existing email in a different case as a duplicate", async () => {
    const countBefore = await db.select({ id: users.id }).from(users);

    await service.signUp(validDto(existingEmail.toUpperCase()) as unknown as never);

    expect(sentEmails).toHaveLength(0);
    const countAfter = await db.select({ id: users.id }).from(users);
    expect(countAfter).toHaveLength(countBefore.length);
  });

  it("fails fast and rolls the user back when the email transport fails", async () => {
    const failingTransport: EmailTransport = {
      send: vi.fn<EmailTransport["send"]>(async () => {
        throw new Error("SMTP unavailable");
      }),
    };
    const moduleRef = await buildModule(failingTransport);
    const failingService = moduleRef.get(SignUpService);

    const doomedEmail = `sign-up-fail-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    await expect(failingService.signUp(validDto(doomedEmail) as unknown as never)).rejects.toThrow(
      new InternalServerErrorException("Failed to send confirmation email"),
    );

    const [user] = await db.select().from(users).where(eq(users.email, doomedEmail));
    expect(user).toBeUndefined();

    // The rollback removes the user, which cascades to its confirmation token:
    // the active-token count must be unchanged by the failed attempt.
    const activeTokens = () =>
      db
        .select()
        .from(emailConfirmationTokens)
        .where(
          and(
            isNull(emailConfirmationTokens.usedAt),
            gt(emailConfirmationTokens.expiresAt, new Date()),
          ),
        );
    const tokensBefore = await activeTokens();
    expect((await activeTokens()).length).toBe(tokensBefore.length);
  });
});
