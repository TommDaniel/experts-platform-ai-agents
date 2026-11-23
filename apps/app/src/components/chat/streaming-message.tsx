import { useSyncExternalStore } from "react";
import type { Expert } from "../../lib/chat-api";
import type { StreamingStore } from "../../lib/streaming-store";
import { ChatMarkdown } from "./chat-markdown";
import { ExpertAvatar } from "./expert-avatar";

interface StreamingMessageProps {
  expert: Expert | null;
  store: StreamingStore;
}

export function StreamingMessage({ expert, store }: StreamingMessageProps) {
  const content = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const hasContent = content.trim().length > 0;

  return (
    <div className="chat-group flex gap-3 sm:gap-4">
      <ExpertAvatar expert={expert} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-sm font-semibold text-ink">
            {expert?.name ?? "Expert"}
          </span>
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            Writing…
            <span className="ml-1 inline-block h-3 w-0.5 animate-caret rounded-full bg-ink align-middle" />
          </span>
        </div>

        <div className="mt-2 rounded-2xl rounded-tl-sm border border-app-rule/70 bg-card/80 px-4 py-3.5 shadow-xs">
          {hasContent ? (
            <div aria-hidden="true">
              <ChatMarkdown>{content}</ChatMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 py-1.5" aria-hidden="true">
              <span className="size-1.5 animate-typing-dot rounded-full bg-ink/45" />
              <span className="typing-dot-2 size-1.5 animate-typing-dot rounded-full bg-ink/45" />
              <span className="typing-dot-3 size-1.5 animate-typing-dot rounded-full bg-ink/45" />
            </div>
          )}
        </div>

        <output className="sr-only">{expert?.name ?? "The expert"} is writing a response.</output>
      </div>
    </div>
  );
}
