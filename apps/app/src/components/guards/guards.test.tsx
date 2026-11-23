import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RedirectIfAuthenticated } from "./redirect-if-authenticated";
import { RequireAuth } from "./require-auth";
import { RootRedirect } from "./root-redirect";

const { mockAuthState } = vi.hoisted(() => ({
  mockAuthState: {
    isAuthenticated: false,
    isLoading: false,
  },
}));

vi.mock("../../contexts/auth-context", () => ({
  useAuth: () => mockAuthState,
}));

function renderRequireAuth() {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <Routes>
        <Route path="/app" element={<RequireAuth />}>
          <Route index element={<div>Protected content</div>} />
        </Route>
        <Route path="/auth/sign-in" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderRedirectIfAuthenticated() {
  return render(
    <MemoryRouter initialEntries={["/auth/sign-in"]}>
      <Routes>
        <Route path="/auth/sign-in" element={<RedirectIfAuthenticated />}>
          <Route index element={<div>Sign in content</div>} />
        </Route>
        <Route path="/app" element={<div>App home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderRootRedirect() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth/sign-in" element={<div>Sign in page</div>} />
        <Route path="/app" element={<div>App home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;
  });

  it("renders a loading screen while validating the session", () => {
    mockAuthState.isLoading = true;

    renderRequireAuth();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("redirects to sign-in when the user is not authenticated", () => {
    renderRequireAuth();

    expect(screen.getByText("Sign in page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders protected content when the user is authenticated", () => {
    mockAuthState.isAuthenticated = true;

    renderRequireAuth();

    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });
});

describe("RedirectIfAuthenticated", () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;
  });

  it("renders a loading screen while validating the session", () => {
    mockAuthState.isLoading = true;

    renderRedirectIfAuthenticated();

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Sign in content")).not.toBeInTheDocument();
  });

  it("renders the auth page when the user is not authenticated", () => {
    renderRedirectIfAuthenticated();

    expect(screen.getByText("Sign in content")).toBeInTheDocument();
  });

  it("redirects to the app when the user is authenticated", () => {
    mockAuthState.isAuthenticated = true;

    renderRedirectIfAuthenticated();

    expect(screen.getByText("App home")).toBeInTheDocument();
    expect(screen.queryByText("Sign in content")).not.toBeInTheDocument();
  });
});

describe("RootRedirect", () => {
  beforeEach(() => {
    mockAuthState.isAuthenticated = false;
    mockAuthState.isLoading = false;
  });

  it("redirects to sign-in when the user is not authenticated", () => {
    renderRootRedirect();

    expect(screen.getByText("Sign in page")).toBeInTheDocument();
  });

  it("redirects to the app when the user is authenticated", () => {
    mockAuthState.isAuthenticated = true;

    renderRootRedirect();

    expect(screen.getByText("App home")).toBeInTheDocument();
  });
});
