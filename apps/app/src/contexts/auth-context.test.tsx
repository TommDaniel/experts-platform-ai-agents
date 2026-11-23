import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredToken, setStoredToken } from "../lib/api-client";
import { AuthProvider, useAuth } from "./auth-context";

const USER = {
  id: 1,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  emailVerifiedAt: null,
};

const jsonHeaders = { "Content-Type": "application/json" };

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: jsonHeaders });
}

function Probe() {
  const { isAuthenticated, isLoading, signOut, token, user } = useAuth();

  return (
    <div>
      <span data-testid="is-loading">{String(isLoading)}</span>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user-email">{user ? user.email : "none"}</span>
      <span data-testid="token">{token ?? "none"}</span>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <AuthProvider>
              <Probe />
            </AuthProvider>
          }
        />
        <Route path="/auth/sign-in" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function stubFetch(handler: (url: string) => Promise<Response>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) =>
    handler(String(input)),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts unauthenticated when there is no stored token", () => {
    renderWithRouter();

    expect(screen.getByTestId("is-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
    expect(screen.getByTestId("user-email")).toHaveTextContent("none");
  });

  it("validates the stored token and loads the user", async () => {
    setStoredToken("valid-token");
    stubFetch(async (url) => (url.endsWith("/auth/me") ? okJson(USER) : okJson({})));

    renderWithRouter();

    await waitFor(() =>
      expect(screen.getByTestId("user-email")).toHaveTextContent("ada@example.com"),
    );
    expect(screen.getByTestId("is-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("true");
    expect(screen.getByTestId("token")).toHaveTextContent("valid-token");
  });

  it("clears the session when the stored token is rejected", async () => {
    setStoredToken("revoked-token");
    stubFetch(
      async () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
    );

    renderWithRouter();

    await waitFor(() => expect(screen.getByTestId("user-email")).toHaveTextContent("none"));
    expect(screen.getByTestId("is-loading")).toHaveTextContent("false");
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
    expect(getStoredToken()).toBeNull();
  });

  it("keeps loading and retains the token on network failure", async () => {
    setStoredToken("valid-token");
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    renderWithRouter();

    await waitFor(() => expect(screen.getByTestId("is-loading")).toHaveTextContent("true"));
    expect(screen.getByTestId("is-authenticated")).toHaveTextContent("false");
    expect(getStoredToken()).toBe("valid-token");
  });

  it("signs out, clears the session and navigates to sign-in", async () => {
    setStoredToken("valid-token");
    const fetchMock = stubFetch(async (url) => {
      if (url.endsWith("/auth/me")) return okJson(USER);
      if (url.endsWith("/auth/logout")) return okJson({ success: true });
      return okJson({});
    });

    renderWithRouter();
    await waitFor(() =>
      expect(screen.getByTestId("user-email")).toHaveTextContent("ada@example.com"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("Sign in page")).toBeInTheDocument();
    expect(getStoredToken()).toBeNull();
    const logoutCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/auth/logout"),
    );
    expect(logoutCall).toBeDefined();
  });
});
