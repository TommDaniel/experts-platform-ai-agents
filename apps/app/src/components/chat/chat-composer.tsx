import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Loader2, Paperclip } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Textarea } from "@repo/ui/components/ui/textarea";
import type { Expert } from "../../lib/chat-api";
import { ExpertAvatar } from "./expert-avatar";

const MAX_DRAFT_LENGTH = 4000;
const MAX_TEXTAREA_HEIGHT = 160;

interface ChatComposerProps {
  experts: Expert[];
  selectedExpert: Expert | null;
  isStreaming: boolean;
  isLoading: boolean;
  onSelectExpert: (slug: string) => void;
  onSend: (content: string) => void;
  onOpenConnections: () => void;
}

export function ChatComposer({
  experts,
  selectedExpert,
  isStreaming,
  isLoading,
  onSelectExpert,
  onSend,
  onOpenConnections,
}: ChatComposerProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const previousStreamingRef = useRef(isStreaming);

  const resizeTextarea = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  const scheduleResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      resizeTextarea();
    });
  }, [resizeTextarea]);

  useEffect(
    () => () => {
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
    },
    [],
  );

  useEffect(() => {
    if (isStreaming && !previousStreamingRef.current) {
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }
    previousStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const handleSend = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || isStreaming || isLoading) return;
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      onSend(trimmed);
    },
    [isLoading, isStreaming, onSend],
  );

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(event.target.value);
    scheduleResize();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    handleSend(draft);
  };

  const isBusy = isStreaming || isLoading;
  const isNearLimit = draft.length >= MAX_DRAFT_LENGTH * 0.9;

  return (
    <div className="shrink-0">
      <div className="rounded-3xl border border-app-rule bg-card/95 p-3 shadow-composer backdrop-blur transition-[border-color,box-shadow] duration-200 focus-within:border-ring/60 focus-within:ring-4 focus-within:ring-ring/10">
        <div className="flex items-center gap-2">
          <Select
            value={selectedExpert?.slug ?? ""}
            onValueChange={onSelectExpert}
            disabled={isBusy || experts.length === 0}
          >
            <SelectTrigger
              aria-label="Select expert"
              className="h-9 w-auto max-w-[17rem] gap-2 rounded-full border-transparent bg-app-canvas-deep/80 px-2.5 text-left shadow-none hover:bg-app-canvas-deep focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {selectedExpert ? (
                <span className="flex min-w-0 items-center gap-2">
                  <ExpertAvatar expert={selectedExpert} size="xs" />
                  <span className="truncate text-xs font-medium text-ink">
                    {selectedExpert.name}
                  </span>
                  <span className="hidden truncate text-[11px] text-muted-foreground md:inline">
                    {selectedExpert.role}
                  </span>
                </span>
              ) : (
                <SelectValue placeholder="Select expert" />
              )}
            </SelectTrigger>
            <SelectContent className="min-w-[16rem]">
              {experts.map((expert) => (
                <SelectItem key={expert.slug} value={expert.slug}>
                  <span className="flex items-center gap-2">
                    <ExpertAvatar expert={expert} size="xs" />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium">{expert.name}</span>
                      <span className="text-[11px] text-muted-foreground">{expert.role}</span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenConnections}
            aria-label="Open connections"
            className="ml-auto h-8 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground hover:text-ink"
          >
            <Paperclip className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Connections</span>
          </Button>
        </div>

        <Textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          maxLength={MAX_DRAFT_LENGTH}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={selectedExpert ? `Ask ${selectedExpert.name}…` : "Ask an expert…"}
          aria-label="Message"
          aria-describedby="composer-hint composer-count"
          className="mt-1 max-h-40 min-h-12 resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-relaxed shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0 md:text-[15px]"
        />

        <div className="flex items-center gap-3 px-1 pt-1">
          <p id="composer-hint" className="hidden text-[11px] text-muted-foreground sm:block">
            Enter to send · Shift + Enter for a new line
          </p>
          <p
            id="composer-count"
            className={`ml-auto text-[11px] tabular-nums ${
              isNearLimit ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {draft.length.toLocaleString("en-US")} / {MAX_DRAFT_LENGTH.toLocaleString("en-US")}
          </p>
          <Button
            type="button"
            size="icon"
            onClick={() => handleSend(draft)}
            disabled={!draft.trim() || isBusy}
            aria-label="Send message"
            className="size-10 rounded-full bg-ink text-white shadow-lift hover:bg-ink/90 disabled:bg-ink/20"
          >
            {isStreaming ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
