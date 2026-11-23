import type { Page } from "@playwright/test";

export const USER = {
  id: 1,
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  emailVerifiedAt: null,
};

export const EXPERTS = [
  {
    slug: "ceo",
    name: "CEO",
    role: "Chief Executive Officer",
    persona: "",
    suggestedQuestions: [
      "Summarize the company's current position and top 3 strategic priorities based on my connected data.",
      "What are the biggest strategic risks you see right now, and what should we do about them?",
      "Draft a board update covering last quarter's results and the outlook for next quarter.",
    ],
  },
  {
    slug: "cfo",
    name: "CFO",
    role: "Chief Financial Officer",
    persona: "",
    suggestedQuestions: [
      "Analyze our cash flow and working capital position from the connected financial data.",
      "What are our main cost drivers and where can we cut without hurting growth?",
    ],
  },
  {
    slug: "coo",
    name: "COO",
    role: "Chief Operating Officer",
    persona: "",
    suggestedQuestions: ["Identify operational bottlenecks and inefficiencies in our processes."],
  },
  {
    slug: "cpo",
    name: "CPO",
    role: "Chief Product Officer",
    persona: "",
    suggestedQuestions: ["Summarize our product roadmap and flag gaps against the market."],
  },
  {
    slug: "cmo",
    name: "CMO",
    role: "Chief Marketing Officer",
    persona: "",
    suggestedQuestions: ["Audit our current marketing strategy using the connected data."],
  },
  {
    slug: "cto",
    name: "CTO",
    role: "Chief Technology Officer",
    persona: "",
    suggestedQuestions: ["Assess our technical architecture and flag the technical debt."],
  },
  {
    slug: "sales-director",
    name: "Sales Director",
    role: "Director of Sales",
    persona: "",
    suggestedQuestions: ["Analyze our sales pipeline and win rate from the connected data."],
  },
  {
    slug: "customer-success-director",
    name: "Customer Success Director",
    role: "Director of Customer Success",
    persona: "",
    suggestedQuestions: ["Analyze customer retention and health scores from the connected data."],
  },
  {
    slug: "customer-hero-director",
    name: "Customer Hero Director",
    role: "Director of Customer Hero",
    persona: "",
    suggestedQuestions: ["Summarize the most common customer issues and their impact."],
  },
];

export const CONVERSATION = {
  id: 1,
  userId: 1,
  expertSlug: "ceo",
  title: "Q4 strategy review",
  createdAt: "2026-11-22T12:05:00.000Z",
  updatedAt: "2026-11-22T12:12:00.000Z",
};

export const BASE_MESSAGES = [
  {
    id: 1,
    conversationId: 1,
    role: "user",
    content: "Summarize our current position and top priorities.",
    mediaUrl: null,
    mediaType: null,
    createdAt: "2026-11-22T12:05:10.000Z",
  },
  {
    id: 2,
    conversationId: 1,
    role: "assistant",
    content:
      "## Current position\n\nThe connected data paints a healthy picture.\n\n- Protect the core\n- Fund the expansion",
    mediaUrl: null,
    mediaType: null,
    createdAt: "2026-11-22T12:05:42.000Z",
  },
];

export const LONG_MESSAGES = Array.from({ length: 30 }, (_, index) => {
  const isUser = index % 2 === 0;
  return {
    id: 100 + index,
    conversationId: 1,
    role: isUser ? "user" : "assistant",
    content: isUser
      ? `Question ${index / 2 + 1}: pressure-test the renewal plan with the connected data.`
      : `### Working note ${Math.floor(index / 2) + 1}\n\nThe evidence supports the direction, but each assumption still needs an owner and a date.`,
    mediaUrl: null,
    mediaType: null,
    createdAt: new Date(Date.UTC(2026, 10, 22, 9, index * 2)).toISOString(),
  };
});

export const CONNECTIONS = [
  {
    id: 1,
    userId: 1,
    type: "file",
    name: "Q4-board-deck.pdf",
    reference: "sha256:4f9c2a1b7e3d",
    mimeType: "application/pdf",
    sizeBytes: 2411724,
    filePath: null,
    status: "ready",
    error: null,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:01:00.000Z",
  },
  {
    id: 2,
    userId: 1,
    type: "url",
    name: "Notion — Strategy",
    reference: "https://notion.so/acme/strategy",
    mimeType: null,
    sizeBytes: null,
    filePath: null,
    status: "processing",
    error: null,
    createdAt: "2026-11-21T14:00:00.000Z",
    updatedAt: "2026-11-21T14:00:00.000Z",
  },
];

export const ASSISTANT_REPLY =
  "## Where to focus next quarter\n\nProtect the core, fund the expansion, de-risk the plan.";

const sse = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const SUCCESS_STREAM = [
  sse("token", { delta: "## Where to focus next quarter\n\n" }),
  sse("token", { delta: "Protect the core, fund the expansion, de-risk the plan." }),
  sse("done", { messageId: 99 }),
].join("");

const ERROR_STREAM = [
  sse("token", { delta: "Partial answer" }),
  sse("error", { message: "The expert could not finish this response. Please try again." }),
].join("");

interface MockWorkspaceOptions {
  conversations?: boolean;
  messages?: typeof BASE_MESSAGES;
  connections?: typeof CONNECTIONS;
  failExpertsOnce?: boolean;
  stream?: "success" | "error";
  streamDelayMs?: number;
}

export async function mockWorkspace(page: Page, options: MockWorkspaceOptions = {}) {
  const seededConversation = options.conversations ?? false;
  const initialMessages = options.messages ?? (seededConversation ? BASE_MESSAGES : []);
  const connections = options.connections ?? CONNECTIONS;
  let expertCalls = 0;
  let sentContent: string | null = null;

  await page.addInitScript(() => {
    window.localStorage.setItem("auth_token", "test-session-token");
  });

  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ status: 200, json: USER }));
  await page.route("**/api/v1/auth/logout", (route) =>
    route.fulfill({ status: 200, json: { success: true } }),
  );

  await page.route("**/api/v1/experts", async (route) => {
    expertCalls += 1;
    if (options.failExpertsOnce && expertCalls === 1) {
      await route.fulfill({ status: 500, json: { message: "Workspace unavailable" } });
      return;
    }
    await route.fulfill({ status: 200, json: EXPERTS });
  });

  await page.route("**/api/v1/chat/conversations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, json: { ...CONVERSATION, title: null } });
      return;
    }
    await route.fulfill({
      status: 200,
      json: seededConversation ? [CONVERSATION] : [],
    });
  });

  await page.route(/\/api\/v1\/chat\/conversations\/\d+\/messages$/, async (route) => {
    if (route.request().method() === "GET") {
      if (!sentContent) {
        await route.fulfill({ status: 200, json: initialMessages });
        return;
      }
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        json: [
          ...initialMessages,
          {
            id: 98,
            conversationId: 1,
            role: "user",
            content: sentContent,
            mediaUrl: null,
            mediaType: null,
            createdAt: now,
          },
          {
            id: 99,
            conversationId: 1,
            role: "assistant",
            content: ASSISTANT_REPLY,
            mediaUrl: null,
            mediaType: null,
            createdAt: now,
          },
        ],
      });
      return;
    }

    const payload = route.request().postDataJSON() as { content?: string } | null;
    sentContent = payload?.content ?? "";
    await new Promise((resolve) => setTimeout(resolve, options.streamDelayMs ?? 350));
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body: options.stream === "error" ? ERROR_STREAM : SUCCESS_STREAM,
    });
  });

  await page.route("**/api/v1/connections", (route) =>
    route.fulfill({ status: 200, json: connections }),
  );

  await page.route("**/api/v1/connections/url", async (route) => {
    const payload = route.request().postDataJSON() as { url?: string } | null;
    await route.fulfill({
      status: 200,
      json: {
        ...CONNECTIONS[1],
        id: 3,
        name: payload?.url ?? "Connected page",
        reference: payload?.url ?? "https://example.com",
      },
    });
  });

  await page.route("**/api/v1/connections/upload", (route) =>
    route.fulfill({
      status: 200,
      json: {
        ...CONNECTIONS[0],
        id: 4,
        name: "uploaded-document.pdf",
        reference: "sha256:mock-upload",
      },
    }),
  );

  await page.route(/\/api\/v1\/connections\/\d+$/, async (route) => {
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, json: { id: 1 } });
      return;
    }
    await route.fulfill({ status: 200, json: {} });
  });

  return {
    getSentContent: () => sentContent,
  };
}
