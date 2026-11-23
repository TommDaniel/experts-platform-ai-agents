import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { sessions, users } from "../src/db/schema";
import { SessionService } from "../src/modules/auth/session/session.service";

describe("Auth session under /api/v1 (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let sessionService: SessionService;
  let userId: number;
  const email = `e2e-auth-session-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
        firstName: "E2E",
        lastName: "Session",
      })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterEach(async () => {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await app.close();
  });

  it("exposes the auth health endpoint without a token", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/v1/auth/me returns the authenticated user", async () => {
    const token = await sessionService.createSession(userId);
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      id: userId,
      email,
      firstName: "E2E",
      lastName: "Session",
      emailVerifiedAt: null,
    });
  });

  it("GET /api/v1/auth/me returns 401 without a token", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/auth/me returns 401 for an unknown token", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer unknown-token")
      .expect(401);
    expect(res.status).toBe(401);
  });

  it("guards private endpoints with 401 when the token is malformed", async () => {
    const responses = [];
    responses.push(await request(app.getHttpServer()).get("/api/v1").expect(401));
    responses.push(
      await request(app.getHttpServer()).get("/api/v1").set("Authorization", "abc").expect(401),
    );
    responses.push(
      await request(app.getHttpServer()).get("/api/v1").set("Authorization", "Bearer").expect(401),
    );
    responses.push(
      await request(app.getHttpServer())
        .get("/api/v1")
        .set("Authorization", "Bearer a b")
        .expect(401),
    );
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });

  it("guards private endpoints with 401 for an unknown token", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1")
      .set("Authorization", "Bearer unknown-token")
      .expect(401);
    expect(res.status).toBe(401);
  });

  it("guards private endpoints with 401 for a revoked token", async () => {
    const token = await sessionService.createSession(userId);
    await sessionService.revokeSession(token);
    const res = await request(app.getHttpServer())
      .get("/api/v1")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    expect(res.status).toBe(401);
  });

  it("allows private endpoints with a valid token", async () => {
    const token = await sessionService.createSession(userId);
    const res = await request(app.getHttpServer())
      .get("/api/v1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ message: "hello world" });
  });

  it("POST /api/v1/auth/logout revokes the session and is idempotent", async () => {
    const token = await sessionService.createSession(userId);

    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(first.body).toEqual({ success: true });

    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(401);
    expect(me.status).toBe(401);

    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(second.body).toEqual({ success: true });
  });

  it("POST /api/v1/auth/logout succeeds without a token", async () => {
    const res = await request(app.getHttpServer()).post("/api/v1/auth/logout").expect(200);
    expect(res.body).toEqual({ success: true });
  });

  it("keeps only the last session valid for a user (last wins, over HTTP)", async () => {
    const first = await sessionService.createSession(userId);
    const second = await sessionService.createSession(userId);

    const firstMe = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${first}`)
      .expect(401);
    expect(firstMe.status).toBe(401);

    const secondMe = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${second}`)
      .expect(200);
    expect(secondMe.body.id).toBe(userId);
  });
});
