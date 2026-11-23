import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { DRIZZLE } from "../src/db/database.module";
import type { DrizzleDatabase } from "../src/db/database.module";
import { users } from "../src/db/schema";
import { SessionService } from "../src/modules/auth/session/session.service";

describe("API under /api/v1 (e2e)", () => {
  let app: INestApplication;
  let db: DrizzleDatabase;
  let sessionService: SessionService;
  let userId: number;
  const email = `e2e-app-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

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
        lastName: "App",
      })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
    await app.close();
  });

  it("GET /api/v1 requires a valid session (401 without token)", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1").expect(401);
    expect(res.status).toBe(401);
  });

  it("GET /api/v1 responds with JSON hello world when authenticated", async () => {
    const token = await sessionService.createSession(userId);
    const res = await request(app.getHttpServer())
      .get("/api/v1")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ message: "hello world" });
  });

  it("GET /api/v1/auth responds with the auth scaffolding health", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth").expect(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
