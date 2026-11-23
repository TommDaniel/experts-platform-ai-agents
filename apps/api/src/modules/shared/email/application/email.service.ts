import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { emailTemplates } from "../domain/email-templates";
import { EMAIL_TRANSPORT } from "../domain/email.constants";
import type {
  ConfirmationEmailInput,
  EmailTransport,
  NewSessionEmailInput,
  PasswordResetEmailInput,
  PasswordResetSuccessEmailInput,
} from "../domain/email.types";

const DEFAULT_APP_URL = "http://localhost:5173";

@Injectable()
export class EmailService {
  private readonly appUrl: string;

  constructor(
    @Inject(EMAIL_TRANSPORT) private readonly transport: EmailTransport,
    private readonly config: ConfigService,
  ) {
    this.appUrl = config.get<string>("APP_URL") ?? DEFAULT_APP_URL;
  }

  async sendConfirmationEmail(input: ConfirmationEmailInput): Promise<void> {
    const link = `${this.appUrl}/auth/confirm-account?token=${encodeURIComponent(input.token)}`;
    const { subject, html } = emailTemplates.confirmation({ link });
    await this.transport.send({ to: input.to, subject, html });
  }

  async sendNewSessionEmail(input: NewSessionEmailInput): Promise<void> {
    const { subject, html } = emailTemplates.newSession({});
    await this.transport.send({ to: input.to, subject, html });
  }

  async sendPasswordResetEmail(input: PasswordResetEmailInput): Promise<void> {
    const link = `${this.appUrl}/auth/reset-password?token=${encodeURIComponent(input.token)}`;
    const { subject, html } = emailTemplates.passwordReset({ link });
    await this.transport.send({ to: input.to, subject, html });
  }

  async sendPasswordResetSuccessEmail(input: PasswordResetSuccessEmailInput): Promise<void> {
    const { subject, html } = emailTemplates.passwordResetSuccess({});
    await this.transport.send({ to: input.to, subject, html });
  }
}
