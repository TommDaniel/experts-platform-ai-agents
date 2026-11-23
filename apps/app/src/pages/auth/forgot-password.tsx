import { useId, useState, type FormEvent } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { AuthLink, AuthShell } from "../../components/auth/auth-shell";
import { apiClient } from "../../lib/api-client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUCCESS_MESSAGE = "If the account exists, we sent a link.";

export function ForgotPasswordPage() {
  const emailId = useId();
  const emailErrorId = useId();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): string | null {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      return "Email is required.";
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return "Enter a valid email address.";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validate();
    setEmailError(error);
    setFormError(null);
    if (error) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/forgot-password", { email: email.trim() });
      setEmail("");
      setSubmitted(true);
    } catch {
      // Anti-enumeration also applies here: never reveal whether the account
      // exists, so any failure shows the same generic error.
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We sent a link to your inbox if the email is registered."
      >
        <Alert>
          <MailCheck className="size-4" aria-hidden="true" />
          <AlertDescription>{SUCCESS_MESSAGE}</AlertDescription>
        </Alert>
        <AuthLink to="/auth/sign-in" label="Sign in">
          Remembered your password?
        </AuthLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email to receive a link to reset your password."
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              aria-required="true"
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? emailErrorId : undefined}
              placeholder="you@example.com"
              className="h-10 rounded-lg bg-white"
            />
            {emailError ? (
              <p id={emailErrorId} className="text-sm text-destructive" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>

          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full touch-manipulation"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </div>
      </form>

      <AuthLink to="/auth/sign-in" label="Sign in">
        Remembered your password?
      </AuthLink>
    </AuthShell>
  );
}
