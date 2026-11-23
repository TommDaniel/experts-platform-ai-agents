import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../lib/chat-api";
import {
  buildMessageTimeline,
  dayLabel,
  expertAccent,
  expertInitials,
  formatMessageTime,
  getGreeting,
} from "./chat-utils";

function message(id: number, role: "user" | "assistant", createdAt: string): ChatMessage {
  return {
    id,
    conversationId: 1,
    role,
    content: `m${id}`,
    mediaUrl: null,
    mediaType: null,
    createdAt,
  };
}

describe("getGreeting", () => {
  it("returns a time-of-day greeting", () => {
    expect(getGreeting(new Date(2026, 10, 22, 9))).toBe("Good morning");
    expect(getGreeting(new Date(2026, 10, 22, 14))).toBe("Good afternoon");
    expect(getGreeting(new Date(2026, 10, 22, 20))).toBe("Good evening");
  });
});

describe("expertInitials", () => {
  it("builds initials from one or more words", () => {
    expect(expertInitials("CEO")).toBe("CEO");
    expect(expertInitials("Sales Director")).toBe("SD");
    expect(expertInitials("Customer Success Director")).toBe("CS");
    expect(expertInitials("")).toBe("?");
  });
});

describe("expertAccent", () => {
  it("is stable per slug and falls back for unknown experts", () => {
    expect(expertAccent("ceo")).toBe(expertAccent("ceo"));
    expect(expertAccent("unknown").avatar).toContain("bg-muted");
    expect(expertAccent(undefined).avatar).toContain("bg-muted");
  });
});

describe("date formatting", () => {
  it("returns empty strings for invalid dates", () => {
    expect(formatMessageTime("nope")).toBe("");
    expect(dayLabel("nope")).toBe("");
  });

  it("labels today and yesterday", () => {
    const now = new Date(2026, 10, 22, 12);
    expect(dayLabel(new Date(2026, 10, 22, 8).toISOString(), now)).toBe("Today");
    expect(dayLabel(new Date(2026, 10, 21, 8).toISOString(), now)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 10, 10, 8).toISOString(), now)).toBe("November 10");
  });
});

describe("buildMessageTimeline", () => {
  it("adds day separators and groups consecutive assistant messages", () => {
    const now = new Date(2026, 10, 22, 12);
    const items = buildMessageTimeline(
      [
        message(1, "user", new Date(2026, 10, 22, 9, 0).toISOString()),
        message(2, "assistant", new Date(2026, 10, 22, 9, 1).toISOString()),
        message(3, "assistant", new Date(2026, 10, 22, 9, 2).toISOString()),
        message(4, "user", new Date(2026, 10, 22, 9, 3).toISOString()),
      ],
      null,
      now,
    );

    expect(items.map((item) => item.kind)).toEqual(["day", "user", "assistant", "user"]);
    const group = items[2];
    expect(group?.kind === "assistant" && group.messages).toHaveLength(2);
  });

  it("starts a new group after a day change", () => {
    const now = new Date(2026, 10, 22, 12);
    const items = buildMessageTimeline(
      [
        message(1, "assistant", new Date(2026, 10, 21, 23, 0).toISOString()),
        message(2, "assistant", new Date(2026, 10, 22, 0, 30).toISOString()),
      ],
      null,
      now,
    );

    expect(items.map((item) => item.kind)).toEqual(["day", "assistant", "day", "assistant"]);
  });
});
