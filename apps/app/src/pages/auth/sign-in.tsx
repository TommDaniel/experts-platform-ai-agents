import { useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { AuthLink, AuthShell } from "../../components/auth/auth-shell";
import { useAuth } from "../../contexts/auth-context";
import { apiClient, setStoredToken } from "../../lib/api-client";

interface SignInResponse {
  token: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) {
      if (errors.email) {
        emailRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.post<SignInResponse>("/auth/sign-in", {
        email: email.trim(),
        password,
      });
      setStoredToken(response.token);
      setPassword("");
      await refresh();
      navigate("/app", { replace: true });
    } catch {
      setFormError("Invalid email or password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Sign in to access your dashboard.">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              ref={emailRef}
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              aria-required="true"
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? emailErrorId : undefined}
              placeholder="you@example.com"
              className="h-10 rounded-lg bg-white"
            />
            {fieldErrors.email ? (
              <p id={emailErrorId} className="text-sm text-destructive" role="alert">
                {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={passwordId}>Password</Label>
            <Input
              id={passwordId}
              ref={passwordRef}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              aria-required="true"
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? passwordErrorId : undefined}
              placeholder="••••••••"
              className="h-10 rounded-lg bg-white"
            />
            {fieldErrors.password ? (
              <p id={passwordErrorId} className="text-sm text-destructive" role="alert">
                {fieldErrors.password}
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
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>

      <AuthLink to="/auth/sign-up" label="Create one">
        Don&rsquo;t have an account?
      </AuthLink>
      <AuthLink to="/auth/forgot-password" label="Reset it">
        Forgot your password?
      </AuthLink>
    </AuthShell>
  );
}
