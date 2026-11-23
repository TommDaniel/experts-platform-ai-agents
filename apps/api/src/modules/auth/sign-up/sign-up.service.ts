import { Inject, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { metrics } from "@opentelemetry/api";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { emailConfirmationTokens, users } from "../../../db/schema";
import { EmailService } from "../../shared/email/application/email.service";
import { PASSWORD_HASHER } from "../../shared/password/domain/password.port";
import type { PasswordHasher } from "../../shared/password/domain/password.port";
import { generateSessionToken, hashToken } from "../../shared/tokens/infrastructure/token.adapter";
import type { SignUpDto } from "./sign-up.dto";

const CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SignUpService {
  private readonly logger = new Logger(SignUpService.name);
  private readonly signUpCounter = metrics.getMeter("api.auth").createCounter("auth.signup.count", {
    description: "Number of sign-up attempts by result",
  });

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly emailService: EmailService,
  ) {}

  async signUp(dto: SignUpDto): Promise<void> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const [existingUser] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    // Anti-enumeration: an already-registered email must produce the exact
    // same response with no side effects (no user, no token, no email).
    if (existingUser) {
      this.signUpCounter.add(1, { result: "duplicate" });
      return;
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const now = new Date();
    const token = generateSessionToken();

    const userId = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
          firstName: dto.first_name.trim(),
          lastName: dto.last_name.trim(),
          emailVerifiedAt: null,
        })
        .returning({ id: users.id });
      await tx.insert(emailConfirmationTokens).values({
        userId: user!.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + CONFIRMATION_TOKEN_TTL_MS),
      });
      return user!.id;
    });

    try {
      await this.emailService.sendConfirmationEmail({ to: normalizedEmail, token });
      this.signUpCounter.add(1, { result: "success" });
    } catch (error) {
      this.signUpCounter.add(1, { result: "email_failure" });
      // Fail-fast: the confirmation email is the point of the sign-up. If the
      // transport fails, roll the account back (cascade removes the token) so
      // re-submitting the form retries the whole flow, and surface a generic
      // 500 with the real cause logged for observability.
      this.logger.error(
        `Failed to send confirmation email to ${normalizedEmail}: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.db.delete(users).where(eq(users.id, userId));
      throw new InternalServerErrorException("Failed to send confirmation email");
    }
  }
}
