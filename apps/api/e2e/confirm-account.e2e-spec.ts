import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseModule, DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { emailConfirmationTokens, sessions, users } from "../src/db/schema";
import { EMAIL_TRANSPORT } from "../src/modules/shared/email/domain/email.constants";
import { EmailModule } from "../src/modules/shared/email/email.module";
import type { EmailTransport } from "../src/modules/shared/email/domain/email.types";
import { PasswordModule } from "../src/modules/shared/password/password.module";
import { AuthModule } from "../src/modules/auth/auth.module";
import { ConfirmAccountModule } from "../src/modules/auth/confirm-account/confirm-account.module";
import {
  generateSessionToken,
  hashToken,
} from "../src/modules/shared/tokens/infrastructure/token.adapter";
import { SessionService } from "../src/modules/auth/session/session.service";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

describe("POST /api/v1/auth/confirm-account (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let sessionService: SessionService;
  let userId: number;

  const email = `e2e-confirm-account-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    db = moduleRef.get(DRIZZLE);
    sessionService = moduleRef.get(SessionService);

    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: "not-a-real-hash",
        firstName: "Ada",
        lastName: "Lovelace",
        emailVerifiedAt: null,
      })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterEach(async () => {
    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(emailConfirmationTokens).where(eq(emailConfirmationTokens.userId, userId));
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, userId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await app.close();
  });

  async function insertToken(options: { expiresAt?: Date; usedAt?: Date } = {}): Promise<string> {
    const token = generateSessionToken();
    await db.insert(emailConfirmationTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: options.expiresAt ?? new Date(Date.now() + TOKEN_TTL_MS),
      usedAt: options.usedAt ?? null,
    });
    return token;
  }

  function postConfirmAccount(body: unknown) {
    return request(app.getHttpServer())
      .post("/api/v1/auth/confirm-account")
      .send(body as object);
  }

  it("confirms a valid token, returns a session token and accepts it on GET /auth/me", async () => {
    const token = await insertToken();

    const res = await postConfirmAccount({ token }).expect(200);
    expect(res.body).toMatchObject({ token: expect.any(String) });
    expect(res.body.token).toHaveLength(43);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.emailVerifiedAt).not.toBeNull();

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, userId));
    expect(tokenRow!.usedAt).not.toBeNull();

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${res.body.token}`)
      .expect(200);
    expect(me.body).toEqual({
      id: userId,
      email,
      firstName: "Ada",
      lastName: "Lovelace",
      emailVerifiedAt: expect.any(String),
    });
  });

  it("revokes any previous session of the user when confirming", async () => {
    const previousSession = await sessionService.createSession(userId);
    const token = await insertToken();

    const res = await postConfirmAccount({ token }).expect(200);
    expect(res.body.token).not.toBe(previousSession);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${previousSession}`)
      .expect(401);

    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${res.body.token}`)
      .expect(200);
  });

  it("rejects an expired token without activating the account or creating a session", async () => {
    const token = await insertToken({ expiresAt: new Date(Date.now() - 1000) });

    const res = await postConfirmAccount({ token }).expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      message: "This confirmation link has expired.",
    });

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user!.emailVerifiedAt).toBeNull();

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, userId));
    expect(tokenRow!.usedAt).toBeNull();

    const sessionRows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(sessionRows).toHaveLength(0);
  });

  it("rejects an already used token with no changes", async () => {
    const usedAt = new Date(Date.now() - 60 * 1000);
    const token = await insertToken({ usedAt });

    const res = await postConfirmAccount({ token }).expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      message: "This confirmation link has already been used.",
    });

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, userId));
    expect(tokenRow!.usedAt).toEqual(usedAt);

    const sessionRows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(sessionRows).toHaveLength(0);
  });

  it("rejects an unknown token with the invalid-link message", async () => {
    const res = await postConfirmAccount({ token: generateSessionToken() }).expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      message: "Invalid confirmation link.",
    });
  });

  it("treats an already active account with a valid token as a success", async () => {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(users.id, userId));
    const token = await insertToken();

    const res = await postConfirmAccount({ token }).expect(200);
    expect(res.body.token).toHaveLength(43);

    const [tokenRow] = await db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.userId, userId));
    expect(tokenRow!.usedAt).not.toBeNull();
  });

  it("returns 400 when the token is missing or empty", async () => {
    const missing = await postConfirmAccount({}).expect(400);
    expect(missing.body.message).toEqual(expect.arrayContaining(["token should not be empty"]));

    const empty = await postConfirmAccount({ token: "" }).expect(400);
    expect(empty.body.message).toEqual(expect.arrayContaining(["token should not be empty"]));
  });
});
