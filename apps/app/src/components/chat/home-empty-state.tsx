import { ArrowUpRight, Check } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import type { Expert } from "../../lib/chat-api";
import { ExpertAvatar } from "./expert-avatar";
import { expertAccent, getGreeting } from "./chat-utils";

interface HomeEmptyStateProps {
  experts: Expert[];
  selectedExpert: Expert | null;
  firstName: string;
  onSelectExpert: (slug: string) => void;
  onSend: (content: string) => void;
  onOpenConnections: () => void;
}

export function HomeEmptyState({
  experts,
  selectedExpert,
  firstName,
  onSelectExpert,
  onSend,
  onOpenConnections,
}: HomeEmptyStateProps) {
  const suggestions = selectedExpert?.suggestedQuestions ?? [];

  return (
    <section className="chat-scroll min-h-0 flex-1 overflow-y-auto px-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 py-2 sm:gap-8 sm:py-4">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] md:items-end md:gap-10">
          <div className="animate-rise">
            <p className="eyebrow">
              Workspace · {experts.length > 0 ? `${experts.length} experts` : "Getting started"}
            </p>
            <h1 className="mt-3 font-display text-4xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl lg:whitespace-nowrap xl:text-[3.25rem]">
              {firstName ? (
                <>
                  {getGreeting()}, <span className="marker-highlight">{firstName}</span>.
                </>
              ) : (
                "Welcome back."
              )}
            </h1>
            <p className="mt-5 font-display text-xl font-medium text-ink-soft sm:text-2xl">
              How can I help you today?
            </p>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground">
              Pick an expert, connect your company&apos;s data, and turn a question into a decision.
            </p>
          </div>

          <aside className="animate-rise-late rounded-2xl border border-app-rule/70 bg-card/60 p-4 md:rounded-none md:border-y-0 md:border-r-0 md:border-l-2 md:border-l-soft-blush md:bg-transparent md:p-0 md:pl-5">
            <p className="eyebrow">Grounded in your data</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Your experts answer from the files and pages you connect — and say when the data does
              not cover it.
            </p>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={onOpenConnections}
              className="mt-2 h-auto gap-1 p-0 text-xs font-semibold text-ink underline decoration-soft-blush decoration-2 underline-offset-4 hover:decoration-petal-frost"
            >
              Connect data
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Button>
          </aside>
        </div>

        <section aria-labelledby="experts-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 id="experts-heading" className="eyebrow">
                Your leadership team
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose who answers. You can switch at any time.
              </p>
            </div>
            {experts.length > 0 && (
              <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:block">
                {experts.length} experts
              </span>
            )}
          </div>

          {experts.length > 0 ? (
            <ul
              aria-label="Choose an expert"
              className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3"
            >
              {experts.map((expert) => {
                const accent = expertAccent(expert.slug);
                const isSelected = expert.slug === selectedExpert?.slug;
                return (
                  <li key={expert.slug} className="snap-start">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onSelectExpert(expert.slug)}
                      className={`group flex h-full w-[210px] shrink-0 flex-col justify-between gap-4 rounded-2xl border p-4 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-app-canvas focus-visible:outline-none sm:w-[232px] ${
                        isSelected
                          ? `${accent.surface} ${accent.border} shadow-lift`
                          : "border-app-rule/80 bg-card/70 hover:-translate-y-0.5 hover:border-app-rule hover:bg-card hover:shadow-lift"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <ExpertAvatar expert={expert} size="md" />
                        {isSelected ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-ink text-white">
                            <Check className="size-3" aria-hidden="true" />
                          </span>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            Select
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-display text-sm font-semibold text-ink">{expert.name}</p>
                        <p className="mt-1 text-xs leading-snug text-muted-foreground">
                          {expert.role}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl border border-dashed border-app-rule bg-card/50 px-4 py-5 text-sm text-muted-foreground">
              No experts are available yet. Connect your data and check back soon.
            </p>
          )}
        </section>

        {suggestions.length > 0 && (
          <section aria-labelledby="suggestions-heading" className="animate-rise-late">
            <h2 id="suggestions-heading" className="eyebrow">
              Try asking {selectedExpert?.name}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onSend(question)}
                  className="group flex max-w-full items-start gap-2 rounded-2xl border border-app-rule/80 bg-card/70 px-4 py-3 text-left text-sm leading-snug text-foreground transition-colors hover:border-app-rule hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="line-clamp-2">{question}</span>
                  <ArrowUpRight
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-ink"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
