import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { passwordResetTokens, sessions, users } from "../src/db/schema";
import { EMAIL_TRANSPORT } from "../src/modules/shared/email/domain/email.constants";
import { EmailModule } from "../src/modules/shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../src/modules/shared/email/domain/email.types";
import { PasswordModule } from "../src/modules/shared/password/password.module";
import { PASSWORD_HASHER } from "../src/modules/shared/password/domain/password.port";
import type { PasswordHasher } from "../src/modules/shared/password/domain/password.port";
import { hashToken } from "../src/modules/shared/tokens/infrastructure/token.adapter";
import { ResetPasswordModule } from "../src/modules/auth/reset-password/reset-password.module";
import { SignInModule } from "../src/modules/auth/sign-in/sign-in.module";

const SUCCESS_BODY = {
  message: "Your password has been reset. You can now sign in.",
};

describe("POST /api/v1/auth/reset-password (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let passwordHasher: PasswordHasher;
  let userId: number;
  let sentEmails: EmailMessage[];

  const email = `e2e-reset-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const oldPassword = "old-password-123";
  const newPassword = "new-password-456";
  const token = "e2e-raw-reset-token";

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
        SignInModule,
      ],
    })
      .overrideProvider(EMAIL_TRANSPORT)
      .useValue(fakeTransport)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    db = moduleRef.get(DRIZZLE);
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
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db
      .update(users)
      .set({ passwordHash: await passwordHasher.hash(oldPassword) })
      .where(eq(users.id, userId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await app.close();
  });

  async function insertActiveToken() {
    const [row] = await db
      .insert(passwordResetTokens)
      .values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning({ id: passwordResetTokens.id });
    return row!.id;
  }

  async function userRow() {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    return row!;
  }

  async function tokenRow() {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId));
    return row!;
  }

  function postResetPassword(body: unknown) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/reset-password")
      .send(body as object);
  }

  function postSignIn(body: unknown) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(body as object);
  }

  it("resets the password with a valid token, marks it used and sends the success email", async () => {
    await insertActiveToken();

    const res = await postResetPassword({
      token,
      password: newPassword,
      confirm_password: newPassword,
    }).expect(200);
    expect(res.body).toEqual(SUCCESS_BODY);

    const user = await userRow();
    expect(await passwordHasher.verify(newPassword, user.passwordHash)).toBe(true);
    expect(await passwordHasher.verify(oldPassword, user.passwordHash)).toBe(false);

    expect((await tokenRow()).usedAt).not.toBeNull();

    const successEmails = sentEmails.filter((m) => m.subject === "Your password has been reset");
    expect(successEmails).toHaveLength(1);
    expect(successEmails[0]!.to).toBe(email);
  });

  it("rejects mismatched passwords with 400 and no changes", async () => {
    await insertActiveToken();
    const before = (await userRow()).passwordHash;

    const res = await postResetPassword({
      token,
      password: newPassword,
      confirm_password: "different-password",
    }).expect(400);
    expect(res.body.message).toBe("Passwords do not match.");

    expect((await userRow()).passwordHash).toBe(before);
    expect((await tokenRow()).usedAt).toBeNull();
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an expired token with 400 and no changes", async () => {
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() - 60_000),
    });
    const before = (await userRow()).passwordHash;

    const res = await postResetPassword({
      token,
      password: newPassword,
      confirm_password: newPassword,
    }).expect(400);
    expect(res.body.message).toContain("expired");

    expect((await userRow()).passwordHash).toBe(before);
    expect((await tokenRow()).usedAt).toBeNull();
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an already-used token with 400 and no changes", async () => {
    await db.insert(passwordResetTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      usedAt: new Date(),
    });
    const before = (await userRow()).passwordHash;

    const res = await postResetPassword({
      token,
      password: newPassword,
      confirm_password: newPassword,
    }).expect(400);
    expect(res.body.message).toContain("already been used");

    expect((await userRow()).passwordHash).toBe(before);
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an unknown token with 400 and no changes", async () => {
    const before = (await userRow()).passwordHash;

    const res = await postResetPassword({
      token: "unknown-token",
      password: newPassword,
      confirm_password: newPassword,
    }).expect(400);
    expect(res.body.message).toContain("Invalid password reset link");

    expect((await userRow()).passwordHash).toBe(before);
    expect(sentEmails).toHaveLength(0);
  });

  it("after the reset, sign-in works with the new password and fails with the old one", async () => {
    await insertActiveToken();
    await postResetPassword({
      token,
      password: newPassword,
      confirm_password: newPassword,
    }).expect(200);
    sentEmails.length = 0;

    await postSignIn({ email, password: newPassword }).expect(200);

    const res = await postSignIn({ email, password: oldPassword }).expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      message: "Invalid email or password",
    });
  });

  it("returns 400 when validation fails", async () => {
    const missing = await postResetPassword({}).expect(400);
    expect(missing.body.message).toEqual(
      expect.arrayContaining([
        "token should not be empty",
        "password should not be empty",
        "confirm_password should not be empty",
      ]),
    );

    const shortPassword = await postResetPassword({
      token,
      password: "short",
      confirm_password: "short",
    }).expect(400);
    expect(shortPassword.body.message).toEqual(
      expect.arrayContaining(["password must be longer than or equal to 8 characters"]),
    );
  });
});
