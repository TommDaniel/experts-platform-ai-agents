import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DRIZZLE } from "../../../db/database.module";
import type { DrizzleDatabase } from "../../../db/database.module";
import { users } from "../../../db/schema";
import { EmailService } from "../../shared/email/application/email.service";
import { PASSWORD_HASHER } from "../../shared/password/domain/password.port";
import type { PasswordHasher } from "../../shared/password/domain/password.port";
import { SessionService } from "../session/session.service";

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";

// bcrypt cost 10 hash of "sign-in-timing-dummy": keeps the verify() code path
// (and its cost) identical whether or not the email exists in the database.
const DUMMY_PASSWORD_HASH = "$2b$10$qEZwGkr7st0Fnia3.2TvzeYYhg1oBeLkkMTYzFnm/5HuNeOqFFGTK";

@Injectable()
export class SignInService {
  private readonly logger = new Logger(SignInService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    private readonly sessionService: SessionService,
    private readonly emailService: EmailService,
  ) {}

  async signIn(email: string, password: string): Promise<string> {
    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const passwordValid = await this.passwordHasher.verify(password, passwordHash);

    if (!user || !passwordValid || user.emailVerifiedAt === null) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    try {
      await this.emailService.sendNewSessionEmail({ to: user.email });
    } catch (error) {
      this.logger.warn(
        `Failed to send new-session email to ${user.email}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return this.sessionService.createSession(user.id);
  }
}
