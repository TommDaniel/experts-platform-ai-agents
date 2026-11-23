import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { passwordResetTokens, users } from "../../../db/schema";
import { EmailService } from "../../shared/email/application/email.service";
import { generateSessionToken, hashToken } from "../../shared/tokens/infrastructure/token.adapter";

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ForgotPasswordService {
  private readonly logger = new Logger(ForgotPasswordService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly emailService: EmailService,
  ) {}

  async requestPasswordReset(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // The token is generated on every path so the observable timing cost of
    // this endpoint stays as close as possible whether or not the account
    // exists (anti-enumeration). The only remaining difference is the DB
    // insert + email send, which only happen for existing accounts.
    const token = generateSessionToken();
    const tokenHash = hashToken(token);

    if (!user) {
      return;
    }

    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now),
          ),
        );
      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      });
    });

    try {
      await this.emailService.sendPasswordResetEmail({ to: user.email, token });
    } catch (error) {
      // Anti-enumeration wins: a failure here must not surface as a different
      // HTTP status (that would leak the account existence). The token stays
      // persisted so the reset flow (spec 008) can still consume it, and the
      // user can simply request again.
      this.logger.warn(
        `Failed to send password-reset email to ${user.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
