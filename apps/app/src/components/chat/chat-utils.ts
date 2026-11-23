import type { ChatMessage, Expert } from "../../lib/chat-api";

export interface ExpertAccent {
  avatar: string;
  surface: string;
  border: string;
}

const DEFAULT_ACCENT: ExpertAccent = {
  avatar: "bg-muted text-ink",
  surface: "bg-app-canvas-deep",
  border: "border-app-rule",
};

const EXPERT_ACCENTS: Record<string, ExpertAccent> = {
  ceo: {
    avatar: "bg-petal-frost/70 text-ink",
    surface: "bg-petal-frost/20",
    border: "border-petal-frost/70",
  },
  cfo: {
    avatar: "bg-pale-sky/70 text-ink",
    surface: "bg-pale-sky/20",
    border: "border-pale-sky/70",
  },
  coo: {
    avatar: "bg-mint-cream text-ink",
    surface: "bg-mint-cream/50",
    border: "border-mint-cream",
  },
  cpo: {
    avatar: "bg-soft-blush/80 text-ink",
    surface: "bg-soft-blush/30",
    border: "border-soft-blush",
  },
  cmo: {
    avatar: "bg-powder-petal/80 text-ink",
    surface: "bg-powder-petal/30",
    border: "border-powder-petal",
  },
  cto: {
    avatar: "bg-alice-blue/80 text-ink",
    surface: "bg-alice-blue/30",
    border: "border-alice-blue",
  },
  "sales-director": {
    avatar: "bg-linen text-ink",
    surface: "bg-linen/70",
    border: "border-linen",
  },
  "customer-success-director": {
    avatar: "bg-light-cyan/80 text-ink",
    surface: "bg-light-cyan/30",
    border: "border-light-cyan",
  },
  "customer-hero-director": {
    avatar: "bg-powder-blue/70 text-ink",
    surface: "bg-powder-blue/20",
    border: "border-powder-blue/60",
  },
};

export function expertAccent(slug: string | undefined): ExpertAccent {
  if (!slug) return DEFAULT_ACCENT;
  return EXPERT_ACCENTS[slug] ?? DEFAULT_ACCENT;
}

export function getGreeting(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return "Hello";
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function expertInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`.toUpperCase();
}

function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMessageTime(iso: string): string {
  const date = toDate(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function dayKey(iso: string): string {
  const date = toDate(iso);
  return date ? localDayKey(date) : "";
}

export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = toDate(iso);
  if (!date) return "";

  const key = localDayKey(date);
  if (key === localDayKey(now)) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday)) return "Yesterday";

  const options: Intl.DateTimeFormatOptions = {
    month: "long",
    day: "numeric",
  };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";

  return new Intl.DateTimeFormat("en-US", options).format(date);
}

export type TimelineItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "user"; message: ChatMessage }
  | {
      kind: "assistant";
      key: string;
      expert: Expert | null;
      messages: ChatMessage[];
    };

export function buildMessageTimeline(
  messages: ChatMessage[],
  expert: Expert | null,
  now: Date = new Date(),
): TimelineItem[] {
  const items: TimelineItem[] = [];
  let currentDay = "";
  let assistantGroup: Extract<TimelineItem, { kind: "assistant" }> | null = null;

  for (const message of messages) {
    const key = dayKey(message.createdAt);
    if (key && key !== currentDay) {
      currentDay = key;
      assistantGroup = null;
      items.push({
        kind: "day",
        key: `day-${key}`,
        label: dayLabel(message.createdAt, now),
      });
    }

    if (message.role === "assistant") {
      if (!assistantGroup) {
        assistantGroup = {
          kind: "assistant",
          key: `assistant-${message.id}`,
          expert,
          messages: [],
        };
        items.push(assistantGroup);
      }
      assistantGroup.messages.push(message);
      continue;
    }

    assistantGroup = null;
    items.push({ kind: "user", message });
  }

  return items;
}
