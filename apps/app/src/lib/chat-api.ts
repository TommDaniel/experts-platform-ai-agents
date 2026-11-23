import { ApiError, apiClient, API_BASE_URL, getStoredToken } from "./api-client";

export interface Expert {
  slug: string;
  name: string;
  role: string;
  persona: string;
  suggestedQuestions: string[];
}

export interface Conversation {
  id: number;
  userId: number;
  expertSlug: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
}

export type ConnectionType = "file" | "url";
export type ConnectionStatus = "processing" | "ready" | "failed";

export interface Connection {
  id: number;
  userId: number;
  type: ConnectionType;
  name: string;
  reference: string;
  mimeType: string | null;
  sizeBytes: number | null;
  filePath: string | null;
  status: ConnectionStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatStreamHandlers {
  onToken?: (delta: string) => void;
  onDone?: (payload: { messageId: number }) => void;
  onError?: (message: string) => void;
}

export function listExperts(): Promise<Expert[]> {
  return apiClient.get("/experts");
}

export function getExpert(slug: string): Promise<Expert> {
  return apiClient.get(`/experts/${slug}`);
}

export function listConversations(): Promise<Conversation[]> {
  return apiClient.get("/chat/conversations");
}

export function createConversation(expertSlug: string): Promise<Conversation> {
  return apiClient.post("/chat/conversations", { expertSlug });
}

export function listMessages(conversationId: number): Promise<ChatMessage[]> {
  return apiClient.get(`/chat/conversations/${conversationId}/messages`);
}

export function listConnections(): Promise<Connection[]> {
  return apiClient.get("/connections");
}

export async function uploadConnection(file: File): Promise<Connection> {
  const form = new FormData();
  form.append("file", file);
  const token = getStoredToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/connections/upload`, {
    method: "POST",
    headers,
    body: form,
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }
  return payload as Connection;
}

export function connectUrl(url: string): Promise<Connection> {
  return apiClient.post("/connections/url", { url });
}

export function removeConnection(id: number): Promise<{ id: number }> {
  return apiClient.delete(`/connections/${id}`);
}

interface SseEvent {
  type: string;
  data: unknown;
}

function parseSseEvent(rawEvent: string): SseEvent | null {
  let type = "message";
  let data = "";
  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) type = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) data += line.slice("data:".length).trim();
  }
  if (!data) return null;
  let parsed: unknown = data;
  try {
    parsed = JSON.parse(data);
  } catch {
    // Keep the raw string when the payload is not JSON.
  }
  return { type, data: parsed };
}

function dispatchSseEvent(rawEvent: string, handlers: ChatStreamHandlers): void {
  const event = parseSseEvent(rawEvent);
  if (!event) return;
  const data = (typeof event.data === "object" && event.data !== null ? event.data : {}) as {
    delta?: string;
    message?: string;
    messageId?: number;
  };
  if (event.type === "token" && data.delta) handlers.onToken?.(data.delta);
  else if (event.type === "done" && typeof data.messageId === "number")
    handlers.onDone?.({ messageId: data.messageId });
  else if (event.type === "error" && data.message) handlers.onError?.(data.message);
}

export async function streamAssistantMessage(
  conversationId: number,
  content: string,
  handlers: ChatStreamHandlers,
): Promise<void> {
  const token = getStoredToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content }),
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => undefined)) as unknown;
    throw new ApiError(response.status, payload);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const rawEvent of events) {
      dispatchSseEvent(rawEvent, handlers);
    }
  }
}
