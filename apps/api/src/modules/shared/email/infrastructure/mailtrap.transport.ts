import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailTransport } from "../domain/email.types";

export interface MailtrapTransportOptions {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export class MailtrapTransport implements EmailTransport {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(options: MailtrapTransportOptions) {
    if (!options.host || !options.user || !options.pass) {
      throw new Error(
        "Mailtrap SMTP credentials are incomplete. Set MAILTRAP_HOST, MAILTRAP_USER and MAILTRAP_PASS in apps/api/.env.",
      );
    }
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      auth: { user: options.user, pass: options.pass },
    });
    this.from = options.from;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
