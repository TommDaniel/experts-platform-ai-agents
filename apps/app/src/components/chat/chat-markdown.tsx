import { Fragment, memo, type ReactNode } from "react";

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^>\s?(.*)$/;
const UNORDERED_ITEM_PATTERN = /^\s*[-*]\s+(.+)$/;
const ORDERED_ITEM_PATTERN = /^\s*(\d+)\.\s+(.+)$/;

function renderInlineText(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("__") && part.endsWith("__") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${index}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-${index}`}
          className="rounded bg-app-canvas-deep px-1 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("[") && part.endsWith(")")) {
      const close = part.lastIndexOf("](");
      if (close > 0) {
        const label = part.slice(1, close);
        const href = part.slice(close + 2, -1);
        return (
          <a
            key={`${keyPrefix}-${index}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink underline decoration-powder-blue decoration-2 underline-offset-2 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {label}
          </a>
        );
      }
    }
    if (
      (part.startsWith("*") && part.endsWith("*") && part.length > 2) ||
      (part.startsWith("_") && part.endsWith("_") && part.length > 2)
    ) {
      return <em key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={`${keyPrefix}-${index}`}>{part}</Fragment>;
  });
}

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "blank" };

function buildBlocks(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let listItems: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
      paragraph = [];
    }
  };
  const flushList = (): void => {
    if (listItems) {
      blocks.push({ kind: "list", ordered: listItems.ordered, items: listItems.items });
      listItems = null;
    }
  };

  for (const line of lines) {
    if (code !== null) {
      if (line.trim().startsWith("```")) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushList();
      code = [];
      continue;
    }
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1]!.length as 1 | 2 | 3,
        text: heading[2]!.trim(),
      });
      continue;
    }
    const quote = line.match(BLOCKQUOTE_PATTERN);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "quote", text: quote[1]!.trim() });
      continue;
    }
    const unordered = line.match(UNORDERED_ITEM_PATTERN);
    const ordered = line.match(ORDERED_ITEM_PATTERN);
    if (unordered || ordered) {
      flushParagraph();
      if (!listItems || listItems.ordered !== Boolean(ordered)) {
        flushList();
        listItems = { ordered: Boolean(ordered), items: [] };
      }
      listItems.items.push((unordered?.[1] ?? ordered?.[2] ?? "").trim());
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      blocks.push({ kind: "blank" });
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  if (code !== null) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks.filter((block) => block.kind !== "blank");
}

function renderInline(text: string, keyPrefix: string): ReactNode {
  return <>{renderInlineText(text, keyPrefix)}</>;
}

const ChatMarkdown = memo(function ChatMarkdown({ children }: { children: string }) {
  const blocks = buildBlocks(children).filter(
    (block): block is Exclude<typeof block, { kind: "blank" }> => block.kind !== "blank",
  );
  return (
    <div className="space-y-3 text-[15px] leading-7 text-foreground [overflow-wrap:anywhere]">
      {blocks.map((block, index) => {
        const key = `block-${index}`;
        if (block.kind === "heading") {
          const Tag = `h${block.level}` as const;
          const headingClasses = {
            1: "font-display text-xl font-semibold tracking-tight text-ink",
            2: "font-display text-lg font-semibold tracking-tight text-ink",
            3: "font-display text-base font-semibold text-ink",
          }[block.level];
          return (
            <Tag key={key} className={headingClasses}>
              {renderInline(block.text, key)}
            </Tag>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={key}>
              {block.text.split("\n").map((line, lineIndex) => (
                <Fragment key={`${key}-line-${lineIndex}`}>
                  {lineIndex > 0 && <br />}
                  {renderInline(line, `${key}-line-${lineIndex}`)}
                </Fragment>
              ))}
            </p>
          );
        }
        if (block.kind === "code") {
          return (
            <pre
              key={key}
              className="overflow-x-auto rounded-xl border border-app-rule bg-app-canvas-deep/70 p-3 font-mono text-xs leading-relaxed text-ink"
            >
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-powder-blue/70 bg-alice-blue/20 py-1 pl-3 text-muted-foreground"
            >
              {renderInline(block.text, key)}
            </blockquote>
          );
        }
        const ListTag = block.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={key}
            className={
              block.ordered
                ? "list-decimal space-y-1 pl-5 marker:text-muted-foreground"
                : "list-disc space-y-1 pl-5 marker:text-muted-foreground"
            }
          >
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-item-${itemIndex}`}>
                {renderInline(item, `${key}-item-${itemIndex}`)}
              </li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
});

export { ChatMarkdown };
