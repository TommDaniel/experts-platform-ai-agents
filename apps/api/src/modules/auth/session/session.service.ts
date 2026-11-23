import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { sessions, users } from "../../../db/schema";
import { generateSessionToken, hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import type { SessionUser, ValidatedSession } from "./auth.types";

@Injectable()
export class SessionService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDatabase) {}

  async createSession(userId: number): Promise<string> {
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    await this.db.transaction(async (tx) => {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
      await tx.insert(sessions).values({ userId, tokenHash });
    });
    return token;
  }

  async validateSession(token: string): Promise<ValidatedSession | null> {
    const tokenHash = hashToken(token);
    const rows = await this.db
      .select({
        session: sessions,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerifiedAt: users.emailVerifiedAt,
        },
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return { ...row.session, user: row.user };
  }

  async revokeSession(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));
  }
}

export type { SessionUser, ValidatedSession };
