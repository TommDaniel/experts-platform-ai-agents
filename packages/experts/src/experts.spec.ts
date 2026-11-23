import { describe, expect, it } from "vitest";
import { EXPERT_SLUGS, EXPERTS, getExpert, listExperts } from "./index";

describe("experts registry", () => {
  it("exports exactly the 9 expected experts with unique slugs", () => {
    expect(EXPERTS).toHaveLength(9);
    const slugs = EXPERTS.map((expert) => expert.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual([...EXPERT_SLUGS]);
  });

  it("every expert has name, role, persona and at least 3 suggested questions in en-us", () => {
    for (const expert of EXPERTS) {
      expect(expert.name.length).toBeGreaterThan(0);
      expect(expert.role.length).toBeGreaterThan(0);
      expect(expert.persona.length).toBeGreaterThan(50);
      expect(expert.suggestedQuestions.length).toBeGreaterThanOrEqual(3);
      expect(expert.persona.includes("You are")).toBe(true);
    }
  });

  it("getExpert returns the expert by slug and undefined for unknown slugs", () => {
    expect(getExpert("cto")?.name).toBe("CTO");
    expect(getExpert("not-a-real-slug")).toBeUndefined();
  });

  it("listExperts returns all experts in a stable order", () => {
    expect(listExperts().map((expert) => expert.slug)).toEqual([
      "ceo",
      "cfo",
      "coo",
      "cpo",
      "cmo",
      "cto",
      "sales-director",
      "customer-success-director",
      "customer-hero-director",
    ]);
  });
});
