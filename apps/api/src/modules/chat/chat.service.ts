import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { context, metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { and, asc, desc, eq } from "drizzle-orm";
import { Observable } from "rxjs";
import { DRIZZLE } from "../../db/database.module";
import type { DrizzleDatabase } from "../../db/database.module";
import { conversations, messages } from "../../db/schema";
import { AgentsClient, threadIdFor } from "./agents.client";

const tracer = trace.getTracer("api.chat");
const meter = metrics.getMeter("api.chat");

const messageCounter = meter.createCounter("chat.message.count", {
  description: "Number of chat messages processed by result",
});

const streamDuration = meter.createHistogram("chat.stream.duration", {
  description: "Time taken to stream a chat response",
  unit: "ms",
});

type ChatOutcome = "success" | "error";

function classifyChatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/credential|api.?key|unauthorized|\b401\b/i.test(message)) return "provider_auth";
  if (/econnrefused|enotfound|fetch failed|network/i.test(message)) return "agents_unavailable";
  if (/timeout|timed out/i.test(message)) return "timeout";
  return "unknown";
}

const GENERATED_MEDIA_PATTERN =
  /(https?:\/\/[^\s"')]+?\/api\/v1\/uploads\/generated\/(image|video)-[^\s"')]+)/;

function extractEventContent(event: { event?: string; data?: unknown }): string {
  const data = event?.data;
  if (!Array.isArray(data) || data.length === 0) return "";
  const first = data[0] as
    | { message?: { content?: unknown; type?: string } }
    | { content?: unknown; type?: string }
    | undefined;
  if (!first || typeof first !== "object") return "";
  const message =
    "message" in first && first.message
      ? first.message
      : (first as { content?: unknown; type?: string });
  const type = (message as { type?: string }).type;
  if (type && type !== "ai") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : ((part as { text?: string }).text ?? "")))
      .join("");
  }
  return "";
}

function matchGeneratedMedia(content: string): { url: string; type: string } | undefined {
  const match = content.match(GENERATED_MEDIA_PATTERN);
  if (!match) return undefined;
  return { url: match[1]!, type: match[2] === "image" ? "image" : "video" };
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDatabase,
    private readonly agentsClient: AgentsClient,
  ) {}

  async createConversation(userId: number, expertSlug: string) {
    const [row] = await this.db.insert(conversations).values({ userId, expertSlug }).returning();
    return row;
  }

  async listConversations(userId: number) {
    return this.db.query.conversations.findMany({
      where: eq(conversations.userId, userId),
      orderBy: [desc(conversations.updatedAt)],
    });
  }

  async getMessages(userId: number, conversationId: number) {
    await this.ensureOwned(userId, conversationId);
    return this.db.query.messages.findMany({
      where: eq(messages.conversationId, conversationId),
      orderBy: [asc(messages.createdAt)],
    });
  }

  streamMessage(userId: number, conversationId: number, content: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const startedAt = performance.now();
      const span = tracer.startSpan("chat.stream", {
        attributes: {
          "chat.conversation.id": conversationId,
          "user.id": userId,
        },
      });

      void context.with(trace.setSpan(context.active(), span), async () => {
        let outcome: ChatOutcome = "error";
        let reason = "unknown";

        try {
          const conversation = await this.ensureOwned(userId, conversationId);
          await this.db.insert(messages).values({ conversationId, role: "user", content });

          if (!conversation.title) {
            await this.db
              .update(conversations)
              .set({ title: content.slice(0, 60), updatedAt: new Date() })
              .where(eq(conversations.id, conversationId));
          }

          const history = await this.db.query.messages.findMany({
            where: eq(messages.conversationId, conversationId),
            orderBy: [asc(messages.createdAt)],
          });
          const input = history.map((message) => ({
            role: message.role,
            content: message.content,
          }));

          let assistantContent = "";
          let prevLength = 0;
          const stream = await this.agentsClient.stream(
            threadIdFor(conversationId),
            conversation.expertSlug,
            input,
            userId,
          );
          for await (const event of stream) {
            if (event.event === "error") {
              const errorData = event.data as { error?: string; message?: string } | undefined;
              throw new Error(errorData?.message ?? errorData?.error ?? "Agent run failed");
            }
            const nextContent = extractEventContent(event);
            if (nextContent.length > prevLength) {
              const delta = nextContent.slice(prevLength);
              assistantContent += delta;
              prevLength = nextContent.length;
              subscriber.next({ type: "token", data: { delta } });
            }
          }

          const media = matchGeneratedMedia(assistantContent);
          const [assistantRow] = await this.db
            .insert(messages)
            .values({
              conversationId,
              role: "assistant",
              content: assistantContent || "(no response)",
              mediaUrl: media?.url ?? null,
              mediaType: media?.type ?? null,
            })
            .returning();
          if (!assistantRow) {
            reason = "persist_failed";
            subscriber.next({
              type: "error",
              data: { message: "Failed to persist assistant message" },
            });
            return;
          }

          await this.db
            .update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, conversationId));

          outcome = "success";
          subscriber.next({ type: "done", data: { messageId: assistantRow.id } });
        } catch (err) {
          reason = classifyChatError(err);
          span.recordException(err instanceof Error ? err : new Error(String(err)));
          span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
          this.logger.error(
            `Chat stream failed for conversation ${conversationId} (user ${userId}): ${reason}`,
          );
          subscriber.next({
            type: "error",
            data: { message: err instanceof Error ? err.message : String(err) },
          });
        } finally {
          const attributes =
            outcome === "success" ? { result: outcome } : { result: outcome, reason };
          messageCounter.add(1, attributes);
          streamDuration.record(performance.now() - startedAt, attributes);
          span.end();
          subscriber.complete();
        }
      });
    });
  }

  private async ensureOwned(userId: number, conversationId: number) {
    const conversation = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.id, conversationId), eq(conversations.userId, userId)),
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }
}
