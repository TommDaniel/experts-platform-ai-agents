import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordPage } from "./forgot-password";

const jsonHeaders = { "Content-Type": "application/json" };

function renderForgotPasswordPage() {
  return render(
    <MemoryRouter initialEntries={["/auth/forgot-password"]}>
      <Routes>
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
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

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the email field, submit button and the link back to sign-in", () => {
    renderForgotPasswordPage();

    expect(screen.getByRole("heading", { level: 1, name: "Forgot password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
  });

  it("blocks the submit and shows a field error when the email is empty", async () => {
    const fetchMock = stubFetch(async () => json(202, { message: "ok" }));
    renderForgotPasswordPage();

    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an invalid email error for a malformed email", async () => {
    const fetchMock = stubFetch(async () => json(202, { message: "ok" }));
    renderForgotPasswordPage();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the generic success message and posts the email on success", async () => {
    const fetchMock = stubFetch(async () =>
      json(202, { message: "If the account exists, we sent a link" }),
    );
    renderForgotPasswordPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("If the account exists, we sent a link.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith("/auth/forgot-password"),
    );
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ email: "ada@example.com" });
  });

  it("shows a generic error without leaking anything when the request fails", async () => {
    stubFetch(async () => json(500, { message: "Internal server error" }));
    renderForgotPasswordPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "ada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
