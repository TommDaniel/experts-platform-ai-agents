import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { emailConfirmationTokens, users } from "../../../db/schema";
import { hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import { SessionService } from "../session/session.service";

export const INVALID_LINK_MESSAGE = "Invalid confirmation link.";
export const EXPIRED_LINK_MESSAGE = "This confirmation link has expired.";
export const USED_LINK_MESSAGE = "This confirmation link has already been used.";

@Injectable()
export class ConfirmAccountService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly sessionService: SessionService,
  ) {}

  async confirmAccount(token: string): Promise<string> {
    const tokenHash = hashToken(token);

    const [tokenRow] = await this.db
      .select()
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRow) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }
    if (tokenRow.usedAt !== null) {
      throw new BadRequestException(USED_LINK_MESSAGE);
    }
    if (tokenRow.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(EXPIRED_LINK_MESSAGE);
    }

    // Activate the account and consume the token atomically. Setting
    // email_verified_at is idempotent, so an already-active account that
    // clicks a still-valid link is treated as success (see ADR 005).
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, tokenRow.userId));
      await tx
        .update(emailConfirmationTokens)
        .set({ usedAt: now })
        .where(eq(emailConfirmationTokens.id, tokenRow.id));
    });

    // Reuses the 002 SessionService: revokes any previous session of the user
    // ("last wins") and creates the new one. This is the link the email points
    // to, so the session token is returned to the page, which stores it.
    return this.sessionService.createSession(tokenRow.userId);
  }
}
