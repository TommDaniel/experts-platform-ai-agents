import type { ConfigService } from "@nestjs/config";
import type { EmailTransport } from "../domain/email.types";
import { MailtrapTransport } from "./mailtrap.transport";
import { ResendTransport } from "./resend.transport";

type Env = Pick<ConfigService, "get">;

export function createEmailTransport(
  env: Env,
  nodeEnv = process.env.NODE_ENV ?? "development",
): EmailTransport {
  if (nodeEnv === "production") {
    return new ResendTransport({
      apiKey: env.get("RESEND_API_KEY") ?? "",
      from: env.get("RESEND_FROM") ?? "",
    });
  }

  return new MailtrapTransport({
    host: env.get("MAILTRAP_HOST") ?? "",
    port: Number(env.get("MAILTRAP_PORT") ?? 587),
    user: env.get("MAILTRAP_USER") ?? "",
    pass: env.get("MAILTRAP_PASS") ?? "",
    from: env.get("MAILTRAP_FROM") ?? "",
  });
}
