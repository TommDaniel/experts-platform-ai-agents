import { useCallback, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { ChatComposer } from "../../components/chat/chat-composer";
import { ConnectionsSheet } from "../../components/chat/connections-sheet";
import {
  ConversationSkeleton,
  ConversationThread,
} from "../../components/chat/conversation-thread";
import { HomeEmptyState } from "../../components/chat/home-empty-state";
import { useAuth } from "../../contexts/auth-context";
import { useChatStream } from "../../hooks/use-chat-stream";

export function HomePage() {
  const { user } = useAuth();
  const {
    experts,
    expertsLoading,
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
  } = useChatStream();

  const [isConnectionsOpen, setIsConnectionsOpen] = useState(false);

  const selectedExpert =
    experts.find((expert) => expert.slug === selectedSlug) ?? experts[0] ?? null;
  const firstName = user?.firstName?.trim() ?? "";
  const isLoading = expertsLoading || messagesLoading;
  const hasThread = messages.length > 0 || isStreaming;

  const handleSend = useCallback(
    (content: string) => {
      void sendMessage(content);
    },
    [sendMessage],
  );

  const handleOpenConnections = useCallback(() => setIsConnectionsOpen(true), []);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 leading-relaxed">{error}</p>
          {workspaceFailed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={retryWorkspace}
              className="h-7 shrink-0 border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10"
            >
              Retry
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearError}
            className="h-7 shrink-0 text-destructive hover:bg-destructive/10"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <ConversationSkeleton />
        ) : hasThread ? (
          <ConversationThread
            key={conversation?.id ?? "draft"}
            messages={messages}
            expert={selectedExpert}
            isStreaming={isStreaming}
            streamingStore={streamingStore}
          />
        ) : (
          <HomeEmptyState
            experts={experts}
            selectedExpert={selectedExpert}
            firstName={firstName}
            onSelectExpert={selectExpert}
            onSend={handleSend}
            onOpenConnections={handleOpenConnections}
          />
        )}
      </div>

      <div className="mx-auto w-full max-w-3xl shrink-0">
        <ChatComposer
          experts={experts}
          selectedExpert={selectedExpert}
          isStreaming={isStreaming}
          isLoading={isLoading}
          onSelectExpert={selectExpert}
          onSend={handleSend}
          onOpenConnections={handleOpenConnections}
        />
      </div>

      <ConnectionsSheet open={isConnectionsOpen} onOpenChange={setIsConnectionsOpen} />
    </div>
  );
}
