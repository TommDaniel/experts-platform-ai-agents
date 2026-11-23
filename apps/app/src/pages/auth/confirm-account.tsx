import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@repo/ui/components/ui/alert";
import { AuthLink, AuthShell } from "../../components/auth/auth-shell";
import { useAuth } from "../../contexts/auth-context";
import { ApiError, apiClient, setStoredToken } from "../../lib/api-client";

type ErrorKind = "invalid" | "expired" | "used" | "generic";
type Status = "checking" | "error";

interface ConfirmAccountResponse {
  token: string;
}

interface ErrorView {
  title: string;
  subtitle: string;
  message: string;
  prompt: string;
  linkLabel: string;
  linkTo: string;
}

const EXPIRED_MESSAGE = "This confirmation link has expired.";
const USED_MESSAGE = "This confirmation link has already been used.";
const INVALID_MESSAGE = "Invalid confirmation link.";

function errorView(kind: ErrorKind): ErrorView {
  switch (kind) {
    case "expired":
      return {
        title: "Link expired",
        subtitle: "This confirmation link is no longer valid.",
        message: "This link has expired. Sign up again to receive a new confirmation link.",
        prompt: "Need a new confirmation link?",
        linkLabel: "Sign up",
        linkTo: "/auth/sign-up",
      };
    case "used":
      return {
        title: "Link already used",
        subtitle: "This confirmation link has already been consumed.",
        message: "This link has already been used. Sign in to continue.",
        prompt: "Already confirmed your account?",
        linkLabel: "Sign in",
        linkTo: "/auth/sign-in",
      };
    case "invalid":
      return {
        title: "Link not valid",
        subtitle: "We couldn’t confirm your account with this link.",
        message: "This link is invalid. Sign up again to receive a new confirmation link.",
        prompt: "Need a new confirmation link?",
        linkLabel: "Sign up",
        linkTo: "/auth/sign-up",
      };
    case "generic":
      return {
        title: "Something went wrong",
        subtitle: "We couldn’t confirm your account.",
        message:
          "We couldn’t confirm your account right now. Sign up again to receive a new confirmation link.",
        prompt: "Need a new confirmation link?",
        linkLabel: "Sign up",
        linkTo: "/auth/sign-up",
      };
  }
}

function errorKindFromPayload(error: unknown): ErrorKind {
  if (error instanceof ApiError) {
    const message = (error.payload as { message?: unknown } | null)?.message;
    if (message === EXPIRED_MESSAGE) return "expired";
    if (message === USED_MESSAGE) return "used";
    if (message === INVALID_MESSAGE) return "invalid";
  }
  return "generic";
}

export function ConfirmAccountPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // The confirmation link is single-use: this guard keeps React StrictMode
  // (dev double-invoke of effects) from consuming the token twice.
  const hasRun = useRef(false);

  const [status, setStatus] = useState<Status>("checking");
  const [errorKind, setErrorKind] = useState<ErrorKind>("invalid");

  useEffect(() => {
    if (hasRun.current) {
      return;
    }
    if (!token) {
      setStatus("error");
      setErrorKind("invalid");
      return;
    }
    hasRun.current = true;
    void (async () => {
      try {
        const response = await apiClient.post<ConfirmAccountResponse>("/auth/confirm-account", {
          token,
        });
        setStoredToken(response.token);
        await refresh();
        navigate("/app", { replace: true });
      } catch (error) {
        setErrorKind(errorKindFromPayload(error));
        setStatus("error");
      }
    })();
  }, [token, navigate, refresh]);

  if (status === "checking") {
    return (
      <AuthShell
        title="Confirming your account"
        subtitle="We’re activating your account and signing you in."
      >
        <output
          className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <span
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-ring border-t-transparent motion-reduce:animate-none"
            aria-hidden="true"
          />
          Confirming your account…
        </output>
      </AuthShell>
    );
  }

  const error = errorView(errorKind);

  return (
    <AuthShell title={error.title} subtitle={error.subtitle}>
      <Alert variant="destructive">
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
      <AuthLink to={error.linkTo} label={error.linkLabel}>
        {error.prompt}
      </AuthLink>
    </AuthShell>
  );
}
