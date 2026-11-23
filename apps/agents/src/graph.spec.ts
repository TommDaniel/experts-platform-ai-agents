import { describe, expect, it } from "vitest";
import { graph } from "./graph.js";
import { buildSystemPrompt } from "./prompts.js";

describe("experts graph", () => {
  it("compiles into a runnable graph", () => {
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
    expect(typeof graph.stream).toBe("function");
  });

  it("builds a system prompt for any expert slug", () => {
    expect(buildSystemPrompt("cto")).toContain("You are");
    expect(buildSystemPrompt("customer-hero-director")).toContain("You are");
    expect(buildSystemPrompt("unknown-slug")).toContain("You are");
  });
});
