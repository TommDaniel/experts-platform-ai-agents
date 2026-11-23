import { expect, test, type Page } from "@playwright/test";

const USER = {
  id: 1,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  emailVerifiedAt: null,
};

async function seedSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("auth_token", "test-session-token");
  });
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(USER),
    }),
  );
  await page.route("**/api/v1/auth/logout", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    }),
  );
  await page.route("**/api/v1/experts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
  await page.route("**/api/v1/chat/conversations", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    }),
  );
}

test.describe("redirects without a session", () => {
  test("redirects /app to sign-in", async ({ page }) => {
    await page.goto("/app");

    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });

  test("redirects / to sign-in", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
});

test.describe("auth placeholder pages", () => {
  const cases: Array<[string, string]> = [
    ["/auth/sign-in", "Sign in"],
    ["/auth/sign-up", "Create your account"],
    ["/auth/forgot-password", "Forgot password"],
    ["/auth/reset-password", "Reset password"],
    ["/auth/confirm-account", "Link not valid"],
  ];

  for (const [path, heading] of cases) {
    test(`renders ${path}`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    });
  }
});

test.describe("with a valid session", () => {
  test("redirects /auth/* to the app", async ({ page }) => {
    await seedSession(page);
    await page.goto("/auth/sign-in");

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  });

  test("renders the protected chat home", async ({ page }) => {
    await seedSession(page);
    await page.goto("/app");

    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(page.getByText("How can I help you today?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open connections" })).toBeVisible();
  });

  test("sign out clears the session and returns to sign-in", async ({ page }) => {
    await seedSession(page);
    await page.goto("/app");

    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    expect(await page.evaluate(() => window.localStorage.getItem("auth_token"))).toBeNull();
  });
});
