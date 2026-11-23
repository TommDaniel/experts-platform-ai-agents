import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpPage } from "./sign-up";

const jsonHeaders = { "Content-Type": "application/json" };

function renderSignUpPage() {
  return render(
    <MemoryRouter initialEntries={["/auth/sign-up"]}>
      <Routes>
        <Route path="/auth/sign-up" element={<SignUpPage />} />
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

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ada" } });
  fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "Lovelace" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ada@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "password123" } });
}

describe("SignUpPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the sign-up form fields and submit button", () => {
    renderSignUpPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Create your account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/sign-in");
  });

  it("blocks the submit and shows field errors when the form is empty", async () => {
    const fetchMock = stubFetch(async () => json(201, { message: "ok" }));
    renderSignUpPage();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("First name is required.")).toBeInTheDocument();
    expect(screen.getByText("Last name is required.")).toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(screen.getByText("Confirm your password.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows an invalid email error for a malformed email", async () => {
    stubFetch(async () => json(201, { message: "ok" }));
    renderSignUpPage();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("rejects a password shorter than 8 characters", async () => {
    stubFetch(async () => json(201, { message: "ok" }));
    renderSignUpPage();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("shows a match error when the passwords differ", async () => {
    stubFetch(async () => json(201, { message: "ok" }));
    renderSignUpPage();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("posts the sign-up payload and shows the check-your-email success screen", async () => {
    const fetchMock = stubFetch(async () =>
      json(201, { message: "Check your email to confirm your account" }),
    );
    renderSignUpPage();

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Check your email" }),
    ).toBeInTheDocument();
    expect(screen.getByText("We sent a confirmation link to your inbox.")).toBeInTheDocument();

    const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/auth/sign-up"));
    expect(call).toBeDefined();
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      password: "password123",
      confirm_password: "password123",
    });
  });

  it("shows a generic error without leaking anything when the request fails", async () => {
    stubFetch(async () => json(500, { message: "Internal server error" }));
    renderSignUpPage();

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});
