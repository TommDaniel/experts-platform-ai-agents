export interface EmailTemplateContext {
  firstName?: string;
}

const wrap = (title: string, body: string, link?: { href: string; label: string }): string => `
  <!doctype html>
  <html lang="en">
    <body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background-color:#f6f7f9;color:#1a202c;">
      <div style="max-width:520px;margin:0 auto;background-color:#ffffff;border-radius:8px;padding:32px;border:1px solid #e2e8f0;">
        <h1 style="font-size:20px;margin:0 0 16px;">${title}</h1>
        ${body}
        ${link ? `<p style="margin:24px 0 0;"><a href="${link.href}" style="display:inline-block;background-color:#6366f1;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">${link.label}</a></p>` : ""}
        <p style="margin:32px 0 0;font-size:12px;color:#718096;">If you did not request this email, you can safely ignore it.</p>
      </div>
    </body>
  </html>
`;

function greeting(firstName?: string): string {
  return firstName ? `<p>Hi ${firstName},</p>` : "<p>Hi,</p>";
}

export const emailTemplates = {
  confirmation(context: EmailTemplateContext & { link: string }): {
    subject: string;
    html: string;
  } {
    const { link, firstName } = context;
    return {
      subject: "Confirm your account",
      html: wrap(
        "Confirm your account",
        `${greeting(firstName)}<p>Welcome! Please confirm your email address to activate your account.</p>`,
        { href: link, label: "Confirm account" },
      ),
    };
  },

  newSession(context: EmailTemplateContext): { subject: string; html: string } {
    const { firstName } = context;
    return {
      subject: "New session created",
      html: wrap(
        "New session created",
        `${greeting(firstName)}<p>We noticed a new sign-in on your account. If this was you, no action is needed.</p>`,
      ),
    };
  },

  passwordReset(context: EmailTemplateContext & { link: string }): {
    subject: string;
    html: string;
  } {
    const { link, firstName } = context;
    return {
      subject: "Reset your password",
      html: wrap(
        "Reset your password",
        `${greeting(firstName)}<p>Click the button below to choose a new password. This link expires in 24 hours.</p>`,
        { href: link, label: "Reset password" },
      ),
    };
  },

  passwordResetSuccess(context: EmailTemplateContext): { subject: string; html: string } {
    const { firstName } = context;
    return {
      subject: "Your password has been reset",
      html: wrap(
        "Password changed",
        `${greeting(firstName)}<p>Your password was successfully reset. If this was not you, please contact support.</p>`,
      ),
    };
  },
};

export type EmailTemplateName = keyof typeof emailTemplates;
