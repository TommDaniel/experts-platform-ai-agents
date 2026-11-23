import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrainCircuit, PlugZap, ShieldCheck, Sparkles } from "lucide-react";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    title: "Expert agents",
    description: "Custom AI agents built from your team's knowledge.",
  },
  {
    icon: PlugZap,
    title: "Connectors",
    description: "Plug into the tools you already use every day.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description: "Your data stays yours — secure and controlled.",
  },
];

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 z-50 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg"
      >
        Skip to main content
      </a>

      <aside
        aria-hidden="true"
        className="relative hidden w-[45%] max-w-2xl overflow-hidden border-r border-border lg:flex"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-linen via-petal-frost to-light-cyan" />
        <div className="absolute -top-24 -left-24 size-72 rounded-full bg-powder-blue/40 blur-3xl" />
        <div className="absolute -right-16 -bottom-32 size-80 rounded-full bg-soft-blush/60 blur-3xl" />
        <div className="relative flex w-full flex-col justify-between gap-16 p-12">
          <p
            translate="no"
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-ink"
          >
            <BrainCircuit className="size-5 text-ink-soft" aria-hidden="true" />
            Coders University
          </p>
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="font-display text-4xl leading-tight font-semibold text-balance text-ink">
                Turn your expertise into a team of AI agents.
              </h2>
              <p className="text-base leading-relaxed text-ink-soft">
                Coders University brings your experts and connectors together in one place.
              </p>
            </div>
            <ul className="space-y-4">
              {HIGHLIGHTS.map((highlight) => (
                <li key={highlight.title} className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/70 text-ink">
                    <highlight.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-medium text-ink">{highlight.title}</p>
                    <p className="text-sm leading-relaxed text-ink-soft">{highlight.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-6 py-16 sm:px-12"
      >
        <div className="w-full max-w-md">
          <p
            translate="no"
            className="mb-6 flex items-center gap-2 font-semibold text-ink lg:hidden"
          >
            <BrainCircuit className="size-5 text-ink-soft" aria-hidden="true" />
            Coders University
          </p>
          <div className="rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <h1 className="font-display text-3xl font-semibold text-balance text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function PlaceholderNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

interface AuthLinkProps {
  to: string;
  label: string;
  children: ReactNode;
}

export function AuthLink({ to, label, children }: AuthLinkProps) {
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      {children}{" "}
      <Link
        to={to}
        className="rounded font-medium text-foreground underline underline-offset-4 hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {label}
      </Link>
    </p>
  );
}
