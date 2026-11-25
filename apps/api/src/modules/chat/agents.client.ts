import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { context, propagation } from "@opentelemetry/api";

export interface ChatHistoryMessage {
  role: string;
  content: string;
}

interface SseEvent {
  type: "chunk" | "end" | "error";
  content?: string;
  message?: string;
}

function parseSseBody(body: string, onEvent: (event: SseEvent) => void) {
  const lines = body.split("\n");
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw) continue;
    const event = JSON.parse(raw) as SseEvent;
    onEvent(event);
  }
}

@Injectable()
export class AgentsClient {
  private readonly apiUrl: string;

  constructor(config: ConfigService) {
    this.apiUrl = config.get<string>("AGENTS_URL") ?? "http://localhost:2024";
  }

  async *stream(
    threadId: string,
    expertSlug: string,
    messages: ChatHistoryMessage[],
    userId: number,
  ): AsyncGenerator<{ event: string; data: unknown }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    propagation.inject(context.active(), headers);

    const response = await fetch(`${this.apiUrl}/runs/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: { messages, expertSlug },
        config: { configurable: { userId } },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Agent request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const events: SseEvent[] = [];
          parseSseBody(part, (event) => events.push(event));
          for (const event of events) {
            if (event.type === "chunk") {
              yield {
                event: "messages",
                data: [{ message: { type: "ai", content: event.content } }],
              };
            } else if (event.type === "error") {
              yield { event: "error", data: { message: event.message } };
            } else if (event.type === "end") {
              return;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export function threadIdFor(conversationId: number): string {
  return `00000000-0000-4000-8000-${String(conversationId).padStart(12, "0")}`;
}
