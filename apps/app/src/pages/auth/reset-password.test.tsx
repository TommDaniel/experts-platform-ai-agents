import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordPage } from "./reset-password";

const jsonHeaders = { "Content-Type": "application/json" };

function renderResetPasswordPage(initialEntry = "/auth/reset-password?token=abc-123") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auth/sign-in" element={<div>Sign in page</div>} />
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

function fillForm(password = "new-password-123", confirmPassword = password) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: confirmPassword },
  });
}

describe("ResetPasswordPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renders the password fields and submit button when a token is present", () => {
    renderResetPasswordPage();

    expect(screen.getByRole("heading", { level: 1, name: "Reset password" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("shows an invalid link error and no form when the token is missing", () => {
    renderResetPasswordPage("/auth/reset-password");

    expect(screen.getByRole("heading", { level: 1, name: "Reset password" })).toBeInTheDocument();
    expect(screen.getByText("Invalid reset link")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("blocks the submit and shows field errors when the form is empty", async () => {
    const fetchMock = stubFetch(async () => json(200, { message: "ok" }));
    renderResetPasswordPage();

    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password is required.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm your password.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a length error for a password shorter than 8 characters", async () => {
    const fetchMock = stubFetch(async () => json(200, { message: "ok" }));
    renderResetPasswordPage();

    fillForm("short");
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a mismatch error when the passwords do not match", async () => {
    const fetchMock = stubFetch(async () => json(200, { message: "ok" }));
    renderResetPasswordPage();

    fillForm("new-password-123", "different-password");
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the token and passwords, then navigates to sign-in on success", async () => {
    const fetchMock = stubFetch(async () =>
      json(200, { message: "Your password has been reset. You can now sign in." }),
    );
    renderResetPasswordPage();

    fillForm("new-password-123");
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Sign in page")).toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/auth/reset-password"),
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      token: "abc-123",
      password: "new-password-123",
      confirm_password: "new-password-123",
    });
  });

  it("shows the expired link error when the server reports an expired token", async () => {
    stubFetch(async () =>
      json(400, {
        statusCode: 400,
        message: "This password reset link has expired. Please request a new one.",
      }),
    );
    renderResetPasswordPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("This link has expired")).toBeInTheDocument();
    expect(screen.getByText("Please request a new password reset link.")).toBeInTheDocument();
  });

  it("shows the used link error when the server reports a used token", async () => {
    stubFetch(async () =>
      json(400, {
        statusCode: 400,
        message: "This password reset link has already been used.",
      }),
    );
    renderResetPasswordPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("This link has already been used")).toBeInTheDocument();
    expect(screen.getByText("Please request a new password reset link.")).toBeInTheDocument();
  });

  it("shows a generic error for any other failure", async () => {
    stubFetch(async () => json(500, { message: "Internal server error" }));
    renderResetPasswordPage();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });
});
