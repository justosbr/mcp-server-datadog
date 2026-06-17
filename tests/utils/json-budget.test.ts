import { describe, it, expect } from "vitest";
import { budgetedJson } from "../../src/utils/json-budget.js";

describe("budgetedJson", () => {
  it("returns valid JSON with all items and no truncated field when under budget", () => {
    const items = [{ a: 1 }, { a: 2 }];
    const text = budgetedJson(items, (kept, truncated) => ({ data: kept, ...(truncated ? { truncated } : {}) }));
    const parsed = JSON.parse(text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.truncated).toBeUndefined();
  });

  it("keeps at least one item even when it alone exceeds the budget", () => {
    const huge = { blob: "x".repeat(10_000) };
    const text = budgetedJson(
      [huge, { a: 1 }],
      (kept, truncated) => ({ data: kept, ...(truncated ? { truncated } : {}) }),
      1_000
    );
    const parsed = JSON.parse(text);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.truncated.shown).toBe(1);
    expect(parsed.truncated.total).toBe(2);
  });

  it("caps to whole items and embeds a parseable truncated summary when over budget", () => {
    const big = "x".repeat(2000);
    const items = Array.from({ length: 50 }, (_, i) => ({ i, big }));
    const text = budgetedJson(
      items,
      (kept, truncated) => ({ data: kept, ...(truncated ? { truncated } : {}) }),
      5_000
    );
    const parsed = JSON.parse(text); // must be valid JSON despite truncation
    expect(parsed.truncated.total).toBe(50);
    expect(parsed.truncated.shown).toBe(parsed.data.length);
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.data.length).toBeLessThan(50);
  });
});
