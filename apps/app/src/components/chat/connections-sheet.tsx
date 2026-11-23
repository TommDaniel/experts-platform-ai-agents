import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Database, FileText, FileUp, Globe, Link2, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@repo/ui/components/ui/badge";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  connectUrl,
  listConnections,
  removeConnection,
  uploadConnection,
  type Connection,
} from "../../lib/chat-api";

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ConnectionStatusBadge({ status }: { status: Connection["status"] }) {
  if (status === "ready") {
    return (
      <Badge variant="outline" className="border-mint-cream bg-mint-cream/60 text-ink">
        Ready
      </Badge>
    );
  }
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return (
    <Badge variant="secondary" className="bg-alice-blue/60 text-ink">
      Processing
    </Badge>
  );
}

interface ConnectionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectionsSheet({ open, onOpenChange }: ConnectionsSheetProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await listConnections();
      setConnections(items);
    } catch {
      setError("Failed to load connections.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await uploadConnection(file);
      setConnections((prev) => [created, ...prev]);
    } catch {
      setError("Upload failed. Check the file type and size (max 50 MB).");
    } finally {
      setIsSubmitting(false);
      event.target.value = "";
    }
  };

  const handleUrl = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await connectUrl(trimmed);
      setConnections((prev) => [created, ...prev]);
      setUrl("");
    } catch {
      setError("Could not connect that URL. Check the address and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (id: number): Promise<void> => {
    setError(null);
    try {
      await removeConnection(id);
      setConnections((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setError("Could not remove the connection.");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 border-app-rule bg-app-canvas sm:max-w-md">
        <SheetHeader className="border-b border-app-rule/80 px-5 pt-5 pb-4">
          <div className="flex items-start gap-3 pr-8">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-alice-blue/60 text-ink">
              <Database className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="font-display text-lg font-semibold text-ink">
                Connections
              </SheetTitle>
              <SheetDescription className="mt-1 text-sm leading-relaxed">
                Connect files or URLs so your experts can answer from your data.
              </SheetDescription>
            </div>
          </div>
          <p className="eyebrow mt-4">
            {connections.length} {connections.length === 1 ? "source" : "sources"} connected
          </p>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5">
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Add a file</h2>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              tabIndex={-1}
              accept=".pdf,.txt,.md,.jpg,.jpeg,.png,.mp4,.mp3"
              onChange={(event) => void handleFile(event)}
            />
            <Button
              variant="outline"
              className="h-auto w-full justify-start gap-3 rounded-xl border-dashed border-app-rule bg-card/60 px-3 py-3 text-left hover:bg-card"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-soft-blush/60 text-ink">
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileUp className="size-4" aria-hidden="true" />
                )}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-medium text-ink">Choose a file</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  PDF, TXT, Markdown, images, audio or video · up to 50 MB
                </span>
              </span>
            </Button>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="eyebrow">Add a URL</h2>
            <form onSubmit={(event) => void handleUrl(event)} className="flex items-center gap-2">
              <Input
                type="url"
                placeholder="https://example.com/page"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={isSubmitting}
                aria-label="External URL to connect"
                className="h-10 rounded-xl border-app-rule bg-card/70"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSubmitting || !url.trim()}
                aria-label="Connect URL"
                className="size-10 shrink-0 rounded-xl"
              >
                {isSubmitting ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Globe aria-hidden="true" />
                )}
              </Button>
            </form>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="eyebrow">Your data</h2>
              {connections.length > 0 && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {connections.length}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-2" aria-label="Loading connections">
                <Skeleton className="h-16 w-full rounded-xl bg-app-canvas-deep" />
                <Skeleton className="h-16 w-full rounded-xl bg-app-canvas-deep" />
              </div>
            ) : connections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-app-rule bg-card/50 px-4 py-6 text-center">
                <span className="mx-auto flex size-10 items-center justify-center rounded-2xl bg-app-canvas-deep text-muted-foreground">
                  <Database className="size-4" aria-hidden="true" />
                </span>
                <p className="mt-3 text-sm font-medium text-ink">No data connected yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Add a file or a URL above to give your experts context.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {connections.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl border border-app-rule/80 bg-card/70 p-3"
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-app-canvas-deep text-ink">
                      {item.type === "file" ? (
                        <FileText className="size-4" aria-hidden="true" />
                      ) : (
                        <Link2 className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {item.reference}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <ConnectionStatusBadge status={item.status} />
                        {formatBytes(item.sizeBytes) && (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            {formatBytes(item.sizeBytes)}
                          </span>
                        )}
                        <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          {item.type}
                        </span>
                      </div>
                      {item.status === "failed" && item.error && (
                        <p className="mt-1.5 text-xs text-destructive">{item.error}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleRemove(item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
