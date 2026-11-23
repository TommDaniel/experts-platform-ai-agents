import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "./chat-markdown";

describe("ChatMarkdown", () => {
  it("renders headings, paragraphs and lists", () => {
    render(
      <ChatMarkdown>{`## Strategy

- Focus on cash flow
- Reduce burn

1. Ship
2. Learn`}</ChatMarkdown>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Strategy" })).toBeInTheDocument();
    expect(screen.getByText("Focus on cash flow")).toBeInTheDocument();
    expect(screen.getByText("Reduce burn")).toBeInTheDocument();
    expect(screen.getByText("Ship")).toBeInTheDocument();
  });

  it("renders bold, italic, inline code and links", () => {
    render(
      <ChatMarkdown>{`Use **bold**, *italic* and \`code\` like [docs](https://example.com).`}</ChatMarkdown>,
    );

    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("italic")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
  });

  it("renders fenced code blocks", () => {
    render(<ChatMarkdown>{"```ts\nconst x = 1;\n```"}</ChatMarkdown>);

    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("renders blockquotes", () => {
    render(<ChatMarkdown>{"> Data shows growth."}</ChatMarkdown>);

    expect(screen.getByText("Data shows growth.")).toBeInTheDocument();
  });
});
