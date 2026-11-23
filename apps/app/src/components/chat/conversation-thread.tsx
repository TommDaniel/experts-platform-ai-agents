import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import type { ChatMessage, Expert } from "../../lib/chat-api";
import type { StreamingStore } from "../../lib/streaming-store";
import { buildMessageTimeline } from "./chat-utils";
import { AssistantMessageGroup, UserMessage } from "./message-bubble";
import { StreamingMessage } from "./streaming-message";

const PIN_THRESHOLD_PX = 96;

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <hr className="h-px flex-1 border-0 bg-app-rule/80" />
      <span className="eyebrow">{label}</span>
      <hr className="h-px flex-1 border-0 bg-app-rule/80" />
    </div>
  );
}

interface ConversationThreadProps {
  messages: ChatMessage[];
  expert: Expert | null;
  isStreaming: boolean;
  streamingStore: StreamingStore;
}

export function ConversationThread({
  messages,
  expert,
  isStreaming,
  streamingStore,
}: ConversationThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pinnedRef = useRef(true);
  const ignoreScrollRef = useRef(false);
  const [isPinned, setIsPinned] = useState(true);

  const timeline = useMemo(() => buildMessageTimeline(messages, expert), [messages, expert]);
  const expertName = expert?.name ?? "Expert";

  const stickToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    ignoreScrollRef.current = true;
    element.scrollTop = element.scrollHeight;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ignoreScrollRef.current = false;
      });
    });
  }, []);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || ignoreScrollRef.current) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nextPinned = distance <= PIN_THRESHOLD_PX;
    pinnedRef.current = nextPinned;
    setIsPinned(nextPinned);
  }, []);

  const scrollToLatest = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    pinnedRef.current = true;
    setIsPinned(true);
  }, []);

  useEffect(() => {
    const viewport = scrollRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;

    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current || frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        if (pinnedRef.current) stickToBottom();
      });
    });

    observer.observe(content);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [stickToBottom]);

  useEffect(() => {
    stickToBottom();
  }, [stickToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="chat-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-4"
      >
        <div
          ref={contentRef}
          className={`mx-auto flex w-full max-w-3xl flex-col gap-5 pt-2 ${
            messages.length > 24 ? "chat-thread--long" : ""
          }`}
        >
          <h1 className="sr-only">Conversation with {expertName}</h1>
          <div
            role="log"
            aria-live="polite"
            aria-label={`Conversation with ${expertName}`}
            className="flex flex-col gap-5"
          >
            {timeline.map((item) => {
              if (item.kind === "day") return <DayDivider key={item.key} label={item.label} />;
              if (item.kind === "user") {
                return <UserMessage key={item.message.id} message={item.message} />;
              }
              return (
                <AssistantMessageGroup
                  key={item.key}
                  expert={item.expert}
                  messages={item.messages}
                />
              );
            })}
            {isStreaming && <StreamingMessage expert={expert} store={streamingStore} />}
          </div>
        </div>
      </div>

      {!isPinned && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={scrollToLatest}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-app-rule bg-card/95 px-3.5 py-2 text-xs font-medium text-ink shadow-lift backdrop-blur transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowDown className="size-3.5" aria-hidden="true" />
            Jump to latest
          </button>
        </div>
      )}
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <output
      aria-label="Loading your workspace"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 px-1 py-6"
    >
      <h1 className="sr-only">Loading your workspace</h1>
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex gap-4">
          <div className="size-10 shrink-0 animate-pulse rounded-full bg-app-canvas-deep motion-reduce:animate-none" />
          <div className="flex-1 space-y-3">
            <div className="h-3 w-36 animate-pulse rounded-full bg-app-canvas-deep motion-reduce:animate-none" />
            <div className="h-3.5 w-full animate-pulse rounded-full bg-app-canvas-deep motion-reduce:animate-none" />
            <div className="h-3.5 w-11/12 animate-pulse rounded-full bg-app-canvas-deep motion-reduce:animate-none" />
            <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-app-canvas-deep motion-reduce:animate-none" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading your workspace…</span>
    </output>
  );
}
