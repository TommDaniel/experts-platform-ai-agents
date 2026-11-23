import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredToken } from "../../lib/api-client";
import { ConfirmAccountPage } from "./confirm-account";

const { mockUseAuth } = vi.hoisted(() => ({
  mockUseAuth: {
    refresh: vi.fn<() => Promise<void>>(async () => undefined),
  },
}));

vi.mock("../../contexts/auth-context", () => ({
  useAuth: () => mockUseAuth,
}));

const jsonHeaders = { "Content-Type": "application/json" };

function renderConfirmAccountPage(query = "") {
  return render(
    <MemoryRouter initialEntries={[`/auth/confirm-account${query}`]}>
      <Routes>
        <Route path="/auth/confirm-account" element={<ConfirmAccountPage />} />
        <Route path="/app" element={<div>App home</div>} />
        <Route path="/auth/sign-in" element={<div>Sign in page</div>} />
        <Route path="/auth/sign-up" element={<div>Sign up page</div>} />
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

describe("ConfirmAccountPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAuth.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an invalid-link error without calling the API when the token is missing", async () => {
    const fetchMock = stubFetch(async () => json(200, { token: "session-token" }));
    renderConfirmAccountPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Link not valid" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This link is invalid. Sign up again to receive a new confirmation link."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getStoredToken()).toBeNull();
  });

  it("shows an invalid-link error without calling the API when the token is empty", async () => {
    const fetchMock = stubFetch(async () => json(200, { token: "session-token" }));
    renderConfirmAccountPage("?token=");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Link not valid" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("persists the session token, refreshes and navigates to /app on success", async () => {
    const fetchMock = stubFetch(async () => json(200, { token: "session-token-123" }));
    renderConfirmAccountPage("?token=confirm-token-abc");

    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(getStoredToken()).toBe("session-token-123");
    expect(mockUseAuth.refresh).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/auth/confirm-account"),
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ token: "confirm-token-abc" });
  });

  it("shows the expired message and a link to sign up", async () => {
    stubFetch(async () => json(400, { message: "This confirmation link has expired." }));
    renderConfirmAccountPage("?token=expired-token");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Link expired" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This link has expired. Sign up again to receive a new confirmation link."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/auth/sign-up");
    expect(getStoredToken()).toBeNull();
  });

  it("shows the already-used message and a link to sign in", async () => {
    stubFetch(async () => json(400, { message: "This confirmation link has already been used." }));
    renderConfirmAccountPage("?token=used-token");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Link already used" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This link has already been used. Sign in to continue."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
    expect(getStoredToken()).toBeNull();
  });

  it("shows the invalid-link message for an unknown token", async () => {
    stubFetch(async () => json(400, { message: "Invalid confirmation link." }));
    renderConfirmAccountPage("?token=unknown-token");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Link not valid" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This link is invalid. Sign up again to receive a new confirmation link."),
    ).toBeInTheDocument();
  });

  it("shows a generic error without persisting anything on unexpected failures", async () => {
    stubFetch(async () => json(500, { message: "Internal server error" }));
    renderConfirmAccountPage("?token=server-error-token");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn’t confirm your account right now. Sign up again to receive a new confirmation link.",
      ),
    ).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  it("shows a generic error when the request fails with a network error", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    renderConfirmAccountPage("?token=network-error-token");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
  });

  it("does not consume the confirmation link twice", async () => {
    let calls = 0;
    const fetchMock = stubFetch(async () => {
      calls += 1;
      return json(200, { token: "session-token-123" });
    });
    renderConfirmAccountPage("?token=single-use-token");

    await screen.findByText("App home");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(calls).toBe(1);
  });
});
