import { Link } from "react-router-dom";
import { BrainCircuit, Home as HomeIcon } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 z-50 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg"
      >
        Skip to main content
      </a>
      <main
        id="main-content"
        className="flex w-full max-w-md flex-col items-center gap-6 text-center"
      >
        <p
          translate="no"
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-ink"
        >
          <BrainCircuit className="size-5 text-ink-soft" aria-hidden="true" />
          Coders University
        </p>
        <div className="font-display text-7xl font-bold text-powder-blue">404</div>
        <div>
          <h1 className="font-display text-3xl font-semibold text-balance text-foreground">
            Page not found
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/">
            <HomeIcon aria-hidden="true" />
            Go home
          </Link>
        </Button>
      </main>
    </div>
  );
}
