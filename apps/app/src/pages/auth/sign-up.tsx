import { useId, useRef, useState, type FormEvent, type Ref } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/components/ui/alert";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { AuthLink, AuthShell } from "../../components/auth/auth-shell";
import { apiClient } from "../../lib/api-client";

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;

const SUCCESS_MESSAGE = "We sent a confirmation link to your inbox.";

interface InputProps {
  id: string;
  name: string;
  errorId: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
}

function Field({
  id,
  name,
  errorId,
  label,
  value,
  error,
  onChange,
  inputRef,
  type = "text",
  autoComplete,
  placeholder,
}: InputProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        ref={inputRef}
        name={name}
        type={type}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder={placeholder}
        className="h-10 rounded-lg bg-white"
      />
      {error ? (
        <p id={errorId} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SignUpPage() {
  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const firstNameErrorId = useId();
  const lastNameErrorId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const confirmPasswordErrorId = useId();
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function clearFieldError(field: keyof FieldErrors) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!firstName.trim()) {
      errors.firstName = "First name is required.";
    }
    if (!lastName.trim()) {
      errors.lastName = "Last name is required.";
    }
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      errors.email = "Email is required.";
    } else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      errors.email = "Enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Confirm your password.";
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
    if (Object.values(errors).some(Boolean)) {
      const firstField = (
        ["firstName", "lastName", "email", "password", "confirmPassword"] as const
      ).find((key) => errors[key]);
      const refs = {
        firstName: firstNameRef,
        lastName: lastNameRef,
        email: emailRef,
        password: passwordRef,
        confirmPassword: confirmPasswordRef,
      };
      refs[firstField ?? "firstName"].current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post("/auth/sign-up", {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setSubmitted(true);
    } catch {
      // Generic error: the API never reveals whether the email already exists.
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="We sent a confirmation link to your inbox to activate your account."
      >
        <Alert>
          <MailCheck className="size-4" aria-hidden="true" />
          <AlertDescription>{SUCCESS_MESSAGE}</AlertDescription>
        </Alert>
        <AuthLink to="/auth/sign-in" label="Sign in">
          Already have an account?
        </AuthLink>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join Coders University to manage your custom AI agents."
    >
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id={firstNameId}
              name="first_name"
              errorId={firstNameErrorId}
              label="First name"
              value={firstName}
              error={fieldErrors.firstName}
              inputRef={firstNameRef}
              onChange={(value) => {
                setFirstName(value);
                clearFieldError("firstName");
              }}
              autoComplete="given-name"
              placeholder="Ada"
            />
            <Field
              id={lastNameId}
              name="last_name"
              errorId={lastNameErrorId}
              label="Last name"
              value={lastName}
              error={fieldErrors.lastName}
              inputRef={lastNameRef}
              onChange={(value) => {
                setLastName(value);
                clearFieldError("lastName");
              }}
              autoComplete="family-name"
              placeholder="Lovelace"
            />
          </div>

          <Field
            id={emailId}
            name="email"
            errorId={emailErrorId}
            label="Email"
            value={email}
            error={fieldErrors.email}
            inputRef={emailRef}
            onChange={(value) => {
              setEmail(value);
              clearFieldError("email");
            }}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id={passwordId}
              name="password"
              errorId={passwordErrorId}
              label="Password"
              value={password}
              error={fieldErrors.password}
              inputRef={passwordRef}
              onChange={(value) => {
                setPassword(value);
                clearFieldError("password");
              }}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
            />
            <Field
              id={confirmPasswordId}
              name="confirm_password"
              errorId={confirmPasswordErrorId}
              label="Confirm password"
              value={confirmPassword}
              error={fieldErrors.confirmPassword}
              inputRef={confirmPasswordRef}
              onChange={(value) => {
                setConfirmPassword(value);
                clearFieldError("confirmPassword");
              }}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
            />
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
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </div>
      </form>

      <AuthLink to="/auth/sign-in" label="Sign in">
        Already have an account?
      </AuthLink>
    </AuthShell>
  );
}
