export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

export type EmailTransportName = "mailtrap" | "resend";

export interface ConfirmationEmailInput {
  to: string;
  token: string;
}

export interface NewSessionEmailInput {
  to: string;
}

export interface PasswordResetEmailInput {
  to: string;
  token: string;
}

export interface PasswordResetSuccessEmailInput {
  to: string;
}
