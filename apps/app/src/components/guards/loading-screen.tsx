import { Skeleton } from "@repo/ui/components/ui/skeleton";

interface LoadingScreenProps {
  label?: string;
}

export function LoadingScreen({ label = "Loading…" }: LoadingScreenProps) {
  return (
    <output className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background">
      <Skeleton className="size-12 rounded-full motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </output>
  );
}
