import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { passwordResetTokens, users } from "../../../db/schema";
import { EmailService } from "../../shared/email/application/email.service";
import { maskEmail } from "../../shared/logging/mask-email";
import { PASSWORD_HASHER } from "../../shared/password/domain/password.port";
import type { PasswordHasher } from "../../shared/password/domain/password.port";
import { hashToken } from "../../shared/tokens/infrastructure/token.adapter";

export const INVALID_TOKEN_MESSAGE = "Invalid password reset link.";
export const USED_TOKEN_MESSAGE = "This password reset link has already been used.";
export const EXPIRED_TOKEN_MESSAGE =
  "This password reset link has expired. Please request a new one.";

@Injectable()
export class ResetPasswordService {
  private readonly logger = new Logger(ResetPasswordService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly emailService: EmailService,
  ) {}

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = hashToken(token);

    const [tokenRow] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);

    if (!tokenRow) {
      throw new BadRequestException(INVALID_TOKEN_MESSAGE);
    }

    const now = new Date();
    if (tokenRow.usedAt !== null) {
      throw new BadRequestException(USED_TOKEN_MESSAGE);
    }
    if (tokenRow.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException(EXPIRED_TOKEN_MESSAGE);
    }

    const passwordHash = await this.passwordHasher.hash(password);

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, tokenRow.userId));
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, tokenRow.id));
    });

    const [user] = await this.db.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);

    if (!user) {
      return;
    }

    try {
      await this.emailService.sendPasswordResetSuccessEmail({ to: user.email });
    } catch (error) {
      // The reset is already applied. A failure here must not surface as an
      // HTTP error (the password was changed successfully) nor roll back the
      // change, so it is only logged.
      this.logger.warn(
        `Failed to send password-reset-success email to ${maskEmail(user.email)}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
