import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { passwordResetTokens, users } from "../src/db/schema";
import { EMAIL_TRANSPORT } from "../src/modules/shared/email/domain/email.constants";
import { EmailModule } from "../src/modules/shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../src/modules/shared/email/domain/email.types";
import { PasswordModule } from "../src/modules/shared/password/password.module";
import { ForgotPasswordModule } from "../src/modules/auth/forgot-password/forgot-password.module";
import { hashToken } from "../src/modules/shared/tokens/infrastructure/token.adapter";

const GENERIC_BODY = { message: "If the account exists, we sent a link" };

function tokenFromLink(message: EmailMessage): string {
  const match = /token=([^&"']+)/.exec(message.html);
  if (!match) {
    throw new Error("Email does not contain a reset link with a token");
  }
  return match[1]!;
}

describe("POST /api/v1/auth/forgot-password (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let existingUserId: number;
  let sentEmails: EmailMessage[];

  const existingEmail = `e2e-forgot-existing-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const unknownEmail = `e2e-forgot-unknown-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    db = moduleRef.get(DRIZZLE);
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
    await app.close();
  });

  function postForgotPassword(body: unknown) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send(body as object);
  }

  it("returns 202 with the generic body, creates a 24h token and sends the reset email", async () => {
    const res = await postForgotPassword({ email: existingEmail }).expect(202);

    expect(res.body).toEqual(GENERIC_BODY);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(existingEmail);

    const token = tokenFromLink(sentEmails[0]!);
    expect(token).toHaveLength(43);
    expect(sentEmails[0]!.html).toContain("http://localhost:5173/auth/reset-password?token=");

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, existingUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.usedAt).toBeNull();
  });

  it("returns the identical 202 response for an unknown email with no side effects", async () => {
    const existing = await postForgotPassword({ email: existingEmail }).expect(202);
    sentEmails.length = 0;

    const unknown = await postForgotPassword({ email: unknownEmail }).expect(202);

    expect(unknown.body).toEqual(existing.body);
    expect(unknown.status).toBe(existing.status);
    expect(sentEmails).toHaveLength(0);

    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, existingUserId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.usedAt).toBeNull();
  });

  it("revokes the previous active token when a reset is requested again", async () => {
    await postForgotPassword({ email: existingEmail }).expect(202);
    const firstToken = tokenFromLink(sentEmails[0]!);

    sentEmails.length = 0;
    await postForgotPassword({ email: existingEmail }).expect(202);
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

  it("returns 400 for a malformed email", async () => {
    const res = await postForgotPassword({ email: "not-an-email" }).expect(400);
    expect(res.body.message).toEqual(expect.arrayContaining(["email must be an email"]));
    expect(sentEmails).toHaveLength(0);
  });

  it("returns 400 when the email is missing", async () => {
    const res = await postForgotPassword({}).expect(400);
    expect(res.body.message).toEqual(expect.arrayContaining(["email must be an email"]));
  });
});
