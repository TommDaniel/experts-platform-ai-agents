import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredToken } from "../../lib/api-client";
import { SignInPage } from "./sign-in";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: {
    refresh: vi.fn<() => Promise<void>>(async () => undefined),
  },
}));

vi.mock("../../contexts/auth-context", () => ({
  useAuth: () => mockUseAuth,
}));

const jsonHeaders = { "Content-Type": "application/json" };

function renderSignInPage() {
  return render(
    <MemoryRouter initialEntries={["/auth/sign-in"]}>
      <Routes>
        <Route path="/auth/sign-in" element={<SignInPage />} />
        <Route path="/app" element={<div>App home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubFetch(responseFactory: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async (input, init) =>
    responseFactory(String(input), (init ?? {}) as RequestInit),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

describe("SignInPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAuth.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sign-in form fields and submit button", () => {
    renderSignInPage();

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("blocks the submit and shows field errors when the form is empty", async () => {
    const fetchMock = stubFetch(async () => json(200, { token: "token" }));
    renderSignInPage();

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an invalid email error for a malformed email", async () => {
    stubFetch(async () => json(200, { token: "token" }));
    renderSignInPage();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("shows the generic credential error and keeps no token on 401", async () => {
    stubFetch(async () => json(401, { message: "Invalid email or password" }));
    renderSignInPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password.")).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  it("persists the token, refreshes the session and navigates to /app on success", async () => {
    const fetchMock = stubFetch(async () => json(200, { token: "session-token-123" }));
    renderSignInPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(getStoredToken()).toBe("session-token-123");
    expect(mockUseAuth.refresh).toHaveBeenCalledTimes(1);

    const signInCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/auth/sign-in"),
    );
    expect(signInCall).toBeDefined();
    expect(JSON.parse(String(signInCall?.[1]?.body))).toEqual({
      email: "ada@example.com",
      password: "correct-password",
    });
  });
});
