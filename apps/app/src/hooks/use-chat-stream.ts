import { useCallback, useEffect, useRef, useState } from "react";
import {
  createConversation,
  listConversations,
  listExperts,
  listMessages,
  streamAssistantMessage,
  type ChatMessage,
  type Conversation,
  type Expert,
} from "../lib/chat-api";
import { createStreamingStore } from "../lib/streaming-store";

const MAX_DRAFT_LENGTH = 4000;

function toChatMessage(conversationId: number, content: string): ChatMessage {
  return {
    id: -Date.now(),
    conversationId,
    role: "user",
    content,
    mediaUrl: null,
    mediaType: null,
    createdAt: new Date().toISOString(),
  };
}

interface LoadMessagesOptions {
  silent?: boolean;
}

export function useChatStream() {
  const [experts, setExperts] = useState<Expert[]>([]);
  const [expertsLoading, setExpertsLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceFailed, setWorkspaceFailed] = useState(false);
  const [streamingStore] = useState(createStreamingStore);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadConversationMessages = useCallback(
    async (conversationId: number, options: LoadMessagesOptions = {}): Promise<void> => {
      if (!options.silent) setMessagesLoading(true);
      try {
        const loaded = await listMessages(conversationId);
        if (mountedRef.current) setMessages(loaded);
      } finally {
        if (!options.silent && mountedRef.current) setMessagesLoading(false);
      }
    },
    [],
  );

  const loadWorkspace = useCallback(async (): Promise<void> => {
    setExpertsLoading(true);
    setWorkspaceFailed(false);
    setError(null);
    try {
      const [loadedExperts, loadedConversations] = await Promise.all([
        listExperts(),
        listConversations(),
      ]);
      if (!mountedRef.current) return;

      setExperts(loadedExperts);
      setConversations(loadedConversations);

      const first = loadedExperts[0];
      const initial =
        loadedConversations.find((item) => item.expertSlug === first?.slug) ??
        loadedConversations[0];

      if (initial) {
        setSelectedSlug(initial.expertSlug);
        setConversation(initial);
        setMessages([]);
        await loadConversationMessages(initial.id);
      } else if (first) {
        setSelectedSlug(first.slug);
        setConversation(null);
        setMessages([]);
      } else {
        setSelectedSlug("");
        setConversation(null);
        setMessages([]);
      }
    } catch {
      if (mountedRef.current) {
        setWorkspaceFailed(true);
        setError("Failed to load your workspace. Please try again.");
      }
    } finally {
      if (mountedRef.current) setExpertsLoading(false);
    }
  }, [loadConversationMessages]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const retryWorkspace = useCallback(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const selectExpert = useCallback(
    (slug: string) => {
      if (busyRef.current || slug === selectedSlug) return;
      setSelectedSlug(slug);
      setError(null);
      streamingStore.reset();
      const existing = conversations.find((item) => item.expertSlug === slug);
      setConversation(existing ?? null);
      setMessages([]);
      if (existing) {
        void loadConversationMessages(existing.id).catch(() => {
          if (mountedRef.current) {
            setError("Could not load this conversation. Please try again.");
          }
        });
      }
    },
    [conversations, loadConversationMessages, selectedSlug, streamingStore],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      const slug = selectedSlug || experts[0]?.slug;
      if (!trimmed || busyRef.current || !slug || trimmed.length > MAX_DRAFT_LENGTH) return;

      busyRef.current = true;
      setIsStreaming(true);
      setError(null);
      streamingStore.reset();

      let activeConversation: Conversation;
      try {
        if (!conversation || conversation.expertSlug !== slug) {
          activeConversation = await createConversation(slug);
          if (!mountedRef.current) return;
          setConversation(activeConversation);
          setConversations((prev) => [...prev, activeConversation]);
        } else {
          activeConversation = conversation;
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not start the conversation. Please try again.",
          );
          setIsStreaming(false);
        }
        busyRef.current = false;
        return;
      }

      const userMessage = toChatMessage(activeConversation.id, trimmed);
      setMessages((prev) => [...prev, userMessage]);

      try {
        await streamAssistantMessage(activeConversation.id, trimmed, {
          onToken: (delta) => streamingStore.append(delta),
          onDone: () => {
            void loadConversationMessages(activeConversation.id, { silent: true }).catch(() => {
              if (mountedRef.current) {
                setError(
                  "The response finished, but the conversation could not be refreshed. Reload the page to see it.",
                );
              }
            });
          },
          onError: (message) => {
            if (mountedRef.current) setError(message);
          },
        });
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : "Request failed. Please try again.");
        }
      } finally {
        streamingStore.reset();
        busyRef.current = false;
        if (mountedRef.current) {
          setIsStreaming(false);
          setConversations((prev) =>
            prev.map((item) =>
              item.id === activeConversation.id
                ? { ...item, updatedAt: new Date().toISOString() }
                : item,
            ),
          );
        }
      }
    },
    [selectedSlug, experts, conversation, loadConversationMessages, streamingStore],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    experts,
    expertsLoading,
    conversations,
    conversation,
    messages,
    messagesLoading,
    selectedSlug,
    streamingStore,
    isStreaming,
    error,
    workspaceFailed,
    selectExpert,
    sendMessage,
    clearError,
    retryWorkspace,
  };
}
