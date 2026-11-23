import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import type { EmailMessage, EmailTransport } from "../domain/email.types";
import { EmailService } from "./email.service";

class InMemoryTransport implements EmailTransport {
  sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

function fakeConfig(values: Record<string, unknown>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe("EmailService", () => {
  it("sends a confirmation email with a link to confirm-account", async () => {
    const transport = new InMemoryTransport();
    const service = new EmailService(transport, fakeConfig({ APP_URL: "http://localhost:5173" }));

    await service.sendConfirmationEmail({ to: "user@example.com", token: "tok-123" });

    expect(transport.sent).toHaveLength(1);
    const message = transport.sent[0]!;
    expect(message.to).toBe("user@example.com");
    expect(message.subject).toContain("Confirm");
    expect(message.html).toContain("http://localhost:5173/auth/confirm-account?token=tok-123");
  });

  it("sends a new session email", async () => {
    const transport = new InMemoryTransport();
    const service = new EmailService(transport, fakeConfig({}));

    await service.sendNewSessionEmail({ to: "user@example.com" });

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.subject).toContain("New session");
  });

  it("sends a password reset email with a link to reset-password", async () => {
    const transport = new InMemoryTransport();
    const service = new EmailService(transport, fakeConfig({ APP_URL: "http://localhost:5173" }));

    await service.sendPasswordResetEmail({ to: "user@example.com", token: "tok-456" });

    expect(transport.sent).toHaveLength(1);
    const message = transport.sent[0]!;
    expect(message.subject).toContain("Reset");
    expect(message.html).toContain("http://localhost:5173/auth/reset-password?token=tok-456");
  });

  it("sends a password reset success email", async () => {
    const transport = new InMemoryTransport();
    const service = new EmailService(transport, fakeConfig({}));

    await service.sendPasswordResetSuccessEmail({ to: "user@example.com" });

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.subject).toContain("reset");
  });

  it("falls back to the default APP_URL when not configured", async () => {
    const transport = new InMemoryTransport();
    const service = new EmailService(transport, fakeConfig({}));

    await service.sendConfirmationEmail({ to: "user@example.com", token: "tok" });

    expect(transport.sent[0]?.html).toContain("http://localhost:5173/auth/confirm-account");
  });
});
