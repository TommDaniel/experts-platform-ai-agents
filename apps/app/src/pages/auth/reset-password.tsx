import { useId, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { AuthLink, AuthShell } from "../../components/auth/auth-shell";
import { ApiError, apiClient } from "../../lib/api-client";

const MIN_PASSWORD_LENGTH = 8;

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
}

interface FormError {
  title: string;
  body: string;
}

interface ResetSuccess {
  message: string;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const passwordId = useId();
  const confirmPasswordId = useId();
  const passwordErrorId = useId();
  const confirmPasswordErrorId = useId();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    setFormError(null);
    if (errors.password || errors.confirmPassword) {
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post<ResetSuccess>("/auth/reset-password", {
        token,
        password,
        confirm_password: confirmPassword,
      });
      setPassword("");
      setConfirmPassword("");
      navigate("/auth/sign-in", { replace: true });
    } catch (error) {
      const payload =
        error instanceof ApiError ? (error.payload as { message?: string }) : undefined;
      const message = payload?.message ?? "";
      if (message.includes("expired")) {
        setFormError({
          title: "This link has expired",
          body: "Please request a new password reset link.",
        });
      } else if (message.includes("already been used")) {
        setFormError({
          title: "This link has already been used",
          body: "Please request a new password reset link.",
        });
      } else {
        setFormError({
          title: "Something went wrong",
          body: "Please try again or request a new reset link.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="Reset password"
        subtitle="Choose a new password using the link sent to your email."
      >
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Invalid reset link</AlertTitle>
          <AlertDescription>
            This link is missing the required token. Please request a new one.
          </AlertDescription>
        </Alert>
        <AuthLink to="/auth/forgot-password" label="Request a new link">
          Need a new link?
        </AuthLink>
        <AuthLink to="/auth/sign-in" label="Sign in">
          Already reset your password?
        </AuthLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset password" subtitle="Choose a new password for your account.">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <Label htmlFor={passwordId}>New password</Label>
            <Input
              id={passwordId}
              name="password"
              type="password"
              autoComplete="new-password"
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
              placeholder="At least 8 characters"
              className="h-10 rounded-lg bg-white"
            />
            {fieldErrors.password ? (
              <p id={passwordErrorId} className="text-sm text-destructive" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={confirmPasswordId}>Confirm new password</Label>
            <Input
              id={confirmPasswordId}
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (fieldErrors.confirmPassword) {
                  setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }
              }}
              aria-required="true"
              aria-invalid={fieldErrors.confirmPassword ? true : undefined}
              aria-describedby={fieldErrors.confirmPassword ? confirmPasswordErrorId : undefined}
              placeholder="Re-enter your password"
              className="h-10 rounded-lg bg-white"
            />
            {fieldErrors.confirmPassword ? (
              <p id={confirmPasswordErrorId} className="text-sm text-destructive" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          {formError ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>{formError.title}</AlertTitle>
              <AlertDescription>{formError.body}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="w-full touch-manipulation"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Resetting…" : "Reset password"}
          </Button>
        </div>
      </form>

      <AuthLink to="/auth/sign-in" label="Sign in">
        Already reset your password?
      </AuthLink>
    </AuthShell>
  );
}
