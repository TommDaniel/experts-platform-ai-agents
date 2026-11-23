import { Resend } from "resend";
import type { EmailMessage, EmailTransport } from "../domain/email.types";

export interface ResendTransportOptions {
  apiKey: string;
  from: string;
}

export class ResendTransport implements EmailTransport {
  private readonly resend: Resend;
  private readonly from: string;

  constructor(options: ResendTransportOptions) {
    if (!options.apiKey) {
      throw new Error(
        "RESEND_API_KEY is missing. Set it in apps/api/.env to use the Resend transport in production.",
      );
    }
    if (!options.from) {
      throw new Error("RESEND_FROM is missing. Set a verified sender address in apps/api/.env.");
    }
    this.resend = new Resend(options.apiKey);
    this.from = options.from;
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    if (error) {
      throw error;
    }
  }
}
