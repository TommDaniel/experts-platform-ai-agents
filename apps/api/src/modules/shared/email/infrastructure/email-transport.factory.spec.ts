import { describe, expect, it } from "vitest";
import { createEmailTransport } from "./email-transport.factory";
import { MailtrapTransport } from "./mailtrap.transport";
import { ResendTransport } from "./resend.transport";

function fakeConfig(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  };
}

const mailtrapEnv = {
  MAILTRAP_HOST: "sandbox.smtp.mailtrap.io",
  MAILTRAP_PORT: "587",
  MAILTRAP_USER: "user",
  MAILTRAP_PASS: "pass",
  MAILTRAP_FROM: "no-reply@example.com",
};

const resendEnv = {
  RESEND_API_KEY: "re_test_key",
  RESEND_FROM: "Acme <onboarding@resend.dev>",
};

describe("createEmailTransport", () => {
  it("resolves Resend transport in production", () => {
    const transport = createEmailTransport(fakeConfig(resendEnv), "production");
    expect(transport).toBeInstanceOf(ResendTransport);
  });

  it.each(["development", "test", "staging", "local"])(
    "resolves Mailtrap transport for NODE_ENV=%s",
    (nodeEnv) => {
      const transport = createEmailTransport(fakeConfig(mailtrapEnv), nodeEnv);
      expect(transport).toBeInstanceOf(MailtrapTransport);
    },
  );

  it("defaults to development (Mailtrap) when NODE_ENV is not set", () => {
    const transport = createEmailTransport(fakeConfig(mailtrapEnv), undefined);
    expect(transport).toBeInstanceOf(MailtrapTransport);
  });

  it("fails fast when resend credentials are missing in production", () => {
    expect(() => createEmailTransport(fakeConfig({}), "production")).toThrow(
      /RESEND_API_KEY is missing/,
    );
  });

  it("fails fast when mailtrap credentials are missing in non-prod", () => {
    expect(() => createEmailTransport(fakeConfig({}), "development")).toThrow(
      /Mailtrap SMTP credentials are incomplete/,
    );
  });
});
