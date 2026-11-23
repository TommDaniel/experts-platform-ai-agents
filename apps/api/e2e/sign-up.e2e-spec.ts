import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { emailConfirmationTokens, users } from "../src/db/schema";
import { EMAIL_TRANSPORT } from "../src/modules/shared/email/domain/email.constants";
import { EmailModule } from "../src/modules/shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../src/modules/shared/email/domain/email.types";
import { PasswordModule } from "../src/modules/shared/password/password.module";
import { SignUpModule } from "../src/modules/auth/sign-up/sign-up.module";
import { hashToken } from "../src/modules/shared/tokens/infrastructure/token.adapter";

const GENERIC_BODY = { message: "Check your email to confirm your account" };

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

describe("POST /api/v1/auth/sign-up (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let existingUserId: number;
  let sentEmails: EmailMessage[];

  const existingEmail = `e2e-sign-up-existing-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const freshEmail = `e2e-sign-up-fresh-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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
        SignUpModule,
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
    await app.close();
  });

  function postSignUp(body: unknown) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/sign-up")
      .send(body as object);
  }

  it("returns 201 with the generic body, creates the user and sends the confirmation email", async () => {
    const res = await postSignUp(validDto(freshEmail)).expect(201);

    expect(res.body).toEqual(GENERIC_BODY);
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

    const rows = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, user!.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(rows[0]!.usedAt).toBeNull();

    await db.delete(users).where(eq(users.id, user!.id));
  });

  it("returns the identical 201 response for an existing email with no side effects", async () => {
    const fresh = await postSignUp(validDto(freshEmail)).expect(201);
    const [createdUser] = await db.select().from(users).where(eq(users.email, freshEmail));
    await db.delete(users).where(eq(users.id, createdUser!.id));
    sentEmails.length = 0;

    const existing = await postSignUp(validDto(existingEmail)).expect(201);

    expect(existing.body).toEqual(fresh.body);
    expect(sentEmails).toHaveLength(0);

    const rows = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, existingUserId));
    expect(rows).toHaveLength(0);
  });

  it("stores the email in lowercase and treats case variants as duplicates", async () => {
    const uppercased = `E2E-SIGN-UP-CASE-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    const created = await postSignUp(validDto(uppercased)).expect(201);
    const [user] = await db.select().from(users).where(eq(users.email, uppercased.toLowerCase()));
    expect(user).toBeDefined();
    expect(user!.email).toBe(uppercased.toLowerCase());
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(uppercased.toLowerCase());

    sentEmails.length = 0;
    const duplicate = await postSignUp(validDto(uppercased)).expect(201);
    expect(duplicate.body).toEqual(created.body);
    expect(sentEmails).toHaveLength(0);

    await db.delete(users).where(eq(users.id, user!.id));
  });

  it("returns 400 with per-field messages when validation fails", async () => {
    const missing = await postSignUp({}).expect(400);
    expect(missing.body.message).toEqual(
      expect.arrayContaining([
        "first_name should not be empty",
        "last_name should not be empty",
        "email must be an email",
        "password should not be empty",
        "confirm_password should not be empty",
      ]),
    );

    const invalidEmail = await postSignUp({
      ...validDto(existingEmail),
      email: "not-an-email",
    }).expect(400);
    expect(invalidEmail.body.message).toEqual(expect.arrayContaining(["email must be an email"]));

    const shortPassword = await postSignUp({
      ...validDto(existingEmail),
      password: "short",
      confirm_password: "short",
    }).expect(400);
    expect(shortPassword.body.message).toEqual(
      expect.arrayContaining(["password must be longer than or equal to 8 characters"]),
    );

    const mismatched = await postSignUp({
      ...validDto(existingEmail),
      password: "password123",
      confirm_password: "different123",
    }).expect(400);
    expect(mismatched.body.message).toEqual(
      expect.arrayContaining(["confirm_password must match password"]),
    );

    expect(sentEmails).toHaveLength(0);
  });
});
