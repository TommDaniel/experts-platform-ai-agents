import { expect, test } from "@playwright/test";
import { CONNECTIONS, LONG_MESSAGES, mockWorkspace } from "./support/workspace";

const GREETING = /Good (morning|afternoon|evening), Ada\./;
const CEO_QUESTION =
  "Summarize the company's current position and top 3 strategic priorities based on my connected data.";
const CFO_QUESTION =
  "Analyze our cash flow and working capital position from the connected financial data.";
const STREAMED_HEADING = "Where to focus next quarter";
const STREAMED_BODY = "Protect the core, fund the expansion, de-risk the plan.";

test.describe("home empty state", () => {
  test("renders the app shell without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await mockWorkspace(page);
    await page.goto("/app");

    await expect(page.getByRole("link", { name: /Coders University/ })).toBeVisible();
    await expect(page.getByText("Leadership, on call.")).toBeVisible();
    await expect(page.getByText("Signed in as Ada")).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open connections" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: GREETING })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  });

  test("renders the greeting, expert strip and suggestions", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await expect(page.getByRole("heading", { level: 1, name: GREETING })).toBeVisible();
    await expect(page.getByText("How can I help you today?")).toBeVisible();
    await expect(page.getByText("Connect data")).toBeVisible();

    const expertList = page.getByRole("list", { name: "Choose an expert" });
    await expect(expertList).toBeVisible();
    await expect(expertList.getByRole("button")).toHaveCount(9);
    await expect(expertList.getByRole("button", { name: /^CEO/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await expect(page.getByRole("heading", { name: "Try asking CEO" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(CEO_QUESTION.slice(0, 40)) }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Ask CEO…",
    );
  });

  test("switching expert updates the selection, suggestions and composer", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    const expertList = page.getByRole("list", { name: "Choose an expert" });
    const ceo = expertList.getByRole("button", { name: /^CEO/ });
    const cfo = expertList.getByRole("button", { name: /^CFO/ });

    await expect(ceo).toHaveAttribute("aria-pressed", "true");
    await cfo.click();

    await expect(cfo).toHaveAttribute("aria-pressed", "true");
    await expect(ceo).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("heading", { name: "Try asking CFO" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(CFO_QUESTION.slice(0, 40)) }),
    ).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Ask CFO…",
    );
  });

  test("selecting an expert from the composer keeps the page in sync", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await page.getByRole("combobox", { name: "Select expert" }).click();
    await page.getByRole("option", { name: /^CTO/ }).click();

    await expect(page.getByRole("textbox", { name: "Message" })).toHaveAttribute(
      "placeholder",
      "Ask CTO…",
    );
    await expect(
      page.getByRole("list", { name: "Choose an expert" }).getByRole("button", { name: /^CTO/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Try asking CTO" })).toBeVisible();
  });

  test("keeps the shell navigation and breadcrumb in sync", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb).toContainText("Workspace");
    await expect(breadcrumb).toContainText("Home");
    await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: "Experts" }).click();

    await expect(page).toHaveURL(/\/app\/experts$/);
    await expect(breadcrumb).toContainText("Experts");
    await expect(page.getByRole("link", { name: "Experts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("signs out from the account menu", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect(page).toHaveURL(/\/auth\/sign-in$/);
    expect(await page.evaluate(() => window.localStorage.getItem("auth_token"))).toBeNull();
  });
});

test.describe("conversation", () => {
  test("sends a message and renders the streamed reply", async ({ page }) => {
    await mockWorkspace(page, { streamDelayMs: 1200 });
    await page.goto("/app");

    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("What should we prioritize next quarter?");
    await composer.press("Enter");

    await expect(page.getByText("What should we prioritize next quarter?")).toBeVisible();
    await expect(page.getByText(/Writing/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();

    const log = page.getByRole("log", { name: "Conversation with CEO" });
    await expect(log).toContainText(STREAMED_HEADING, { timeout: 10_000 });
    await expect(log).toContainText(STREAMED_BODY);
    await expect(composer).toHaveValue("");
    await expect(page.getByText("How can I help you today?")).toBeHidden();
  });

  test("sends a suggested question straight from the empty state", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await page.getByRole("button", { name: new RegExp(CEO_QUESTION.slice(0, 40)) }).click();

    await expect(page.getByText(CEO_QUESTION)).toBeVisible();
    await expect(page.getByRole("log", { name: "Conversation with CEO" })).toContainText(
      STREAMED_HEADING,
      { timeout: 10_000 },
    );
  });

  test("renders an existing conversation instead of the empty state", async ({ page }) => {
    await mockWorkspace(page, { conversations: true });
    await page.goto("/app");

    const log = page.getByRole("log", { name: "Conversation with CEO" });
    await expect(log).toBeVisible();
    await expect(log).toContainText("Summarize our current position and top priorities.");
    await expect(log.getByRole("heading", { name: "Current position" })).toBeVisible();
    await expect(page.getByText("How can I help you today?")).toBeHidden();
  });

  test("jumps back to the latest message in a long conversation", async ({ page }) => {
    await mockWorkspace(page, { conversations: true, messages: LONG_MESSAGES });
    await page.goto("/app");

    const log = page.getByRole("log", { name: "Conversation with CEO" });
    await expect(log).toContainText("Working note 1");

    const scroller = page.locator(".chat-scroll").filter({ has: log });
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });

    const jump = page.getByRole("button", { name: "Jump to latest" });
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(jump).toBeHidden();
  });

  test("surfaces a stream error and lets you dismiss it", async ({ page }) => {
    await mockWorkspace(page, { conversations: true, stream: "error" });
    await page.goto("/app");

    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("Pressure-test the renewal plan");
    await composer.press("Enter");

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("The expert could not finish this response.", {
      timeout: 10_000,
    });
    await expect(page.getByText("Pressure-test the renewal plan")).toBeVisible();

    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(alert).toBeHidden();
  });
});

test.describe("connections", () => {
  test("opens from the composer, connects a URL and removes a source", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await page.getByRole("button", { name: "Open connections" }).click();

    const dialog = page.getByRole("dialog", { name: "Connections" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("2 sources connected")).toBeVisible();
    await expect(dialog.getByText(CONNECTIONS[0]!.name)).toBeVisible();

    const url = "https://example.com/strategy";
    await dialog.getByRole("textbox", { name: "External URL to connect" }).fill(url);
    await dialog.getByRole("button", { name: "Connect URL" }).click();

    await expect(dialog.getByText("3 sources connected")).toBeVisible();
    await expect(dialog.getByText(url).first()).toBeVisible();

    await dialog.getByRole("button", { name: `Remove ${CONNECTIONS[0]!.name}` }).click();
    await expect(dialog.getByText(CONNECTIONS[0]!.name)).toHaveCount(0);
    await expect(dialog.getByText("2 sources connected")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("uploads a file into the connection list", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await page.getByRole("button", { name: "Open connections" }).click();

    const dialog = page.getByRole("dialog", { name: "Connections" });
    await expect(dialog).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "uploaded-document.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 mock upload"),
    });

    await expect(dialog.getByText("uploaded-document.pdf")).toBeVisible();
    await expect(dialog.getByText("3 sources connected")).toBeVisible();
  });
});

test.describe("resilience", () => {
  test("recovers from a workspace failure with retry", async ({ page }) => {
    await mockWorkspace(page, { failExpertsOnce: true });
    await page.goto("/app");

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Failed to load your workspace. Please try again.");
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

    await page.getByRole("button", { name: "Retry" }).click();

    await expect(page.getByRole("list", { name: "Choose an expert" })).toBeVisible();
    await expect(alert).toBeHidden();
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("renders the empty state without horizontal overflow", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    await expect(page.getByRole("heading", { level: 1, name: GREETING })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);
  });

  test("sends a message from the mobile composer", async ({ page }) => {
    await mockWorkspace(page);
    await page.goto("/app");

    const composer = page.getByRole("textbox", { name: "Message" });
    await composer.fill("Give me the one-page plan");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByText("Give me the one-page plan")).toBeVisible();
    await expect(page.getByRole("log", { name: "Conversation with CEO" })).toContainText(
      STREAMED_BODY,
      { timeout: 10_000 },
    );
  });
});
