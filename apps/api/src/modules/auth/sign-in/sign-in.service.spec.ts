import "reflect-metadata";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { sessions, users } from "../../../db/schema";
import { EMAIL_TRANSPORT } from "../../shared/email/domain/email.constants";
import { EmailModule } from "../../shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../../shared/email/domain/email.types";
import { PasswordModule } from "../../shared/password/password.module";
import { PASSWORD_HASHER } from "../../shared/password/domain/password.port";
import type { PasswordHasher } from "../../shared/password/domain/password.port";
import { AuthModule } from "../auth.module";
import { SignInModule } from "./sign-in.module";
import { SignInService } from "./sign-in.service";

function buildModule(transport: EmailTransport) {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      PasswordModule,
      EmailModule,
      AuthModule,
      SignInModule,
    ],
  })
    .overrideProvider(EMAIL_TRANSPORT)
    .useValue(transport)
    .compile();
}

describe("SignInService", () => {
  let db: DrizzleDatabase;
  let service: SignInService;
  let passwordHasher: PasswordHasher;
  let verifiedUserId: number;
  let unverifiedUserId: number;
  const password = "correct-horse-battery";

  const verifiedEmail = `sign-in-verified-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const unverifiedEmail = `sign-in-unverified-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const unknownEmail = `sign-in-unknown-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  let sentEmails: EmailMessage[];
  const fakeTransport: EmailTransport = {
    send: vi.fn<EmailTransport["send"]>(async (message) => {
      sentEmails.push(message);
    }),
  };

  beforeAll(async () => {
    const moduleRef = await buildModule(fakeTransport);
    db = moduleRef.get(DRIZZLE);
    service = moduleRef.get(SignInService);
    passwordHasher = moduleRef.get(PASSWORD_HASHER);
    sentEmails = [];

    const passwordHash = await passwordHasher.hash(password);
    const [verifiedUser] = await db
      .insert(users)
      .values({
        email: verifiedEmail,
        passwordHash,
        firstName: "Ada",
        lastName: "Lovelace",
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    verifiedUserId = verifiedUser!.id;

    const [unverifiedUser] = await db
      .insert(users)
      .values({
        email: unverifiedEmail,
        passwordHash,
        firstName: "Grace",
        lastName: "Hopper",
        emailVerifiedAt: null,
      })
      .returning({ id: users.id });
    unverifiedUserId = unverifiedUser!.id;
  });

  afterEach(async () => {
    sentEmails.length = 0;
    vi.mocked(fakeTransport.send).mockClear();
    await db.delete(sessions).where(eq(sessions.userId, verifiedUserId));
    await db.delete(sessions).where(eq(sessions.userId, unverifiedUserId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, verifiedUserId));
    await db.delete(users).where(eq(users.id, unverifiedUserId));
  });

  it("signs in a verified user, sends the new-session email and creates an active session", async () => {
    const token = await service.signIn(verifiedEmail, password);

    expect(token).toHaveLength(43);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(verifiedEmail);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, verifiedUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.revokedAt).toBeNull();
  });

  it("normalizes the email to lowercase before the lookup", async () => {
    const token = await service.signIn(verifiedEmail.toUpperCase(), password);
    expect(token).toHaveLength(43);
  });

  it("rejects a wrong password with the generic message", async () => {
    await expect(service.signIn(verifiedEmail, "wrong-password")).rejects.toThrow(
      new UnauthorizedException("Invalid email or password"),
    );
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an unknown email with the same generic message", async () => {
    await expect(service.signIn(unknownEmail, password)).rejects.toThrow(
      new UnauthorizedException("Invalid email or password"),
    );
    expect(sentEmails).toHaveLength(0);
  });

  it("blocks an unconfirmed account without email or session", async () => {
    await expect(service.signIn(unverifiedEmail, password)).rejects.toThrow(
      new UnauthorizedException("Invalid email or password"),
    );
    expect(sentEmails).toHaveLength(0);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, unverifiedUserId));
    expect(rows).toHaveLength(0);
  });

  it("keeps only the last session valid (last wins)", async () => {
    const first = await service.signIn(verifiedEmail, password);
    const second = await service.signIn(verifiedEmail, password);

    expect(first).not.toBe(second);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, verifiedUserId));
    expect(rows).toHaveLength(2);

    const active = rows.filter((row) => row.revokedAt === null);
    const revoked = rows.filter((row) => row.revokedAt !== null);
    expect(active).toHaveLength(1);
    expect(revoked).toHaveLength(1);
    expect(active[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(revoked[0]!.createdAt.getTime());
  });

  it("does not fail the login when sending the new-session email fails", async () => {
    const failingTransport: EmailTransport = {
      send: vi.fn<EmailTransport["send"]>(async () => {
        throw new Error("SMTP unavailable");
      }),
    };
    const moduleRef = await buildModule(failingTransport);
    const failingService = moduleRef.get(SignInService);

    const token = await failingService.signIn(verifiedEmail, password);
    expect(token).toHaveLength(43);

    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, verifiedUserId), isNull(sessions.revokedAt)));
    expect(rows).toHaveLength(1);
  });
});
