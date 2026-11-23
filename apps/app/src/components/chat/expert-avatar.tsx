import type { Expert } from "../../lib/chat-api";
import { expertAccent, expertInitials } from "./chat-utils";

const SIZES = {
  xs: "size-6 text-[9px]",
  sm: "size-8 text-[10px]",
  md: "size-10 text-[11px]",
  lg: "size-12 text-xs",
} as const;

interface ExpertAvatarProps {
  expert: Expert | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export function ExpertAvatar({ expert, size = "md", className = "" }: ExpertAvatarProps) {
  const accent = expertAccent(expert?.slug);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold tracking-[0.04em] ring-1 ring-ink/5 ring-inset ${SIZES[size]} ${accent.avatar} ${className}`}
    >
      {expert ? expertInitials(expert.name) : "?"}
    </span>
  );
}
