import { expect, test } from "@playwright/test";

test("redirects the root path to sign-in without a session", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});
