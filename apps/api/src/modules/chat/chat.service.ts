import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { Observable } from "rxjs";
import { DRIZZLE } from "../../db/database.module";
import type { DrizzleDatabase } from "../../db/database.module";
import { conversations, messages } from "../../db/schema";
import { AgentsClient, threadIdFor } from "./agents.client";

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
      void (async () => {
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
            const content = extractEventContent(event);
            if (content.length > prevLength) {
              const delta = content.slice(prevLength);
              assistantContent += delta;
              prevLength = content.length;
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

          subscriber.next({ type: "done", data: { messageId: assistantRow.id } });
        } catch (err) {
          subscriber.next({
            type: "error",
            data: { message: err instanceof Error ? err.message : String(err) },
          });
        } finally {
          subscriber.complete();
        }
      })();
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
