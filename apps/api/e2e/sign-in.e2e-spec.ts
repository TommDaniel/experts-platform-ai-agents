import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { sessions, users } from "../src/db/schema";
import { EMAIL_TRANSPORT } from "../src/modules/shared/email/domain/email.constants";
import { EmailModule } from "../src/modules/shared/email/email.module";
import type { EmailMessage, EmailTransport } from "../src/modules/shared/email/domain/email.types";
import { PasswordModule } from "../src/modules/shared/password/password.module";
import { PASSWORD_HASHER } from "../src/modules/shared/password/domain/password.port";
import type { PasswordHasher } from "../src/modules/shared/password/domain/password.port";
import { AuthModule } from "../src/modules/auth/auth.module";
import { SignInModule } from "../src/modules/auth/sign-in/sign-in.module";

describe("POST /api/v1/auth/sign-in (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let passwordHasher: PasswordHasher;
  let sentEmails: EmailMessage[];
  let verifiedUserId: number;
  let unverifiedUserId: number;
  const password = "correct-horse-battery";

  const verifiedEmail = `e2e-sign-in-verified-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const unverifiedEmail = `e2e-sign-in-unverified-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const unknownEmail = `e2e-sign-in-unknown-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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
        AuthModule,
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
    await app.close();
  });

  function postSignIn(body: unknown) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send(body as object);
  }

  it("returns 200 with a session token for valid credentials and sends one email", async () => {
    const res = await postSignIn({ email: verifiedEmail, password }).expect(200);

    expect(res.body).toMatchObject({ token: expect.any(String) });
    expect(res.body.token).toHaveLength(43);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]!.to).toBe(verifiedEmail);
  });

  it("accepts the created session on GET /auth/me", async () => {
    const res = await postSignIn({ email: verifiedEmail, password }).expect(200);

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${res.body.token}`)
      .expect(200);

    expect(me.body).toEqual({
      id: verifiedUserId,
      email: verifiedEmail,
      firstName: "Ada",
      lastName: "Lovelace",
      emailVerifiedAt: expect.any(String),
    });
  });

  it("normalizes the email to lowercase", async () => {
    const res = await postSignIn({ email: verifiedEmail.toUpperCase(), password }).expect(200);
    expect(res.body.token).toHaveLength(43);
  });

  it("rejects a wrong password with the generic message", async () => {
    const res = await postSignIn({ email: verifiedEmail, password: "wrong-password" }).expect(401);
    expect(res.body).toMatchObject({
      statusCode: 401,
      message: "Invalid email or password",
    });
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects an unknown email with the identical generic response", async () => {
    const wrongPassword = await postSignIn({ email: verifiedEmail, password: "nope" }).expect(401);
    const unknown = await postSignIn({ email: unknownEmail, password }).expect(401);

    expect(unknown.body).toEqual(wrongPassword.body);
    expect(sentEmails).toHaveLength(0);
  });

  it("blocks an unconfirmed account with the identical generic response and no email/session", async () => {
    const wrongPassword = await postSignIn({ email: verifiedEmail, password: "nope" }).expect(401);
    const unconfirmed = await postSignIn({ email: unverifiedEmail, password }).expect(401);

    expect(unconfirmed.body).toEqual(wrongPassword.body);
    expect(sentEmails).toHaveLength(0);

    const rows = await db.select().from(sessions).where(eq(sessions.userId, unverifiedUserId));
    expect(rows).toHaveLength(0);
  });

  it("keeps only the last session valid (last wins over HTTP)", async () => {
    const first = await postSignIn({ email: verifiedEmail, password }).expect(200);
    const second = await postSignIn({ email: verifiedEmail, password }).expect(200);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${first.body.token}`)
      .expect(401);

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${second.body.token}`)
      .expect(200);
    expect(me.body.id).toBe(verifiedUserId);
    expect(sentEmails).toHaveLength(2);
  });

  it("returns 400 when validation fails", async () => {
    const missingBoth = await request(app.getHttpServer())
      .post("/api/v1/auth/sign-in")
      .send({})
      .expect(400);
    expect(missingBoth.body.message).toEqual(
      expect.arrayContaining(["email must be an email", "password should not be empty"]),
    );

    const invalidEmail = await postSignIn({ email: "not-an-email", password }).expect(400);
    expect(invalidEmail.body.message).toEqual(expect.arrayContaining(["email must be an email"]));

    const emptyPassword = await postSignIn({ email: verifiedEmail, password: "" }).expect(400);
    expect(emptyPassword.body.message).toEqual(
      expect.arrayContaining(["password should not be empty"]),
    );
  });
});
