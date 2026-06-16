import { describe, it, expect } from "vitest";
import { llmobsSpanFields, formatLlmobsSpanLine } from "../../src/utils/llmobs.js";

const span = {
  id: "span-1",
  type: "span",
  attributes: {
    span_id: "span-1",
    trace_id: "trace-1",
    name: "llm_call",
    status: "ok",
    start_ns: 1705314600000000000,
    duration: 1500000000, // 1500 ms
    ml_app: "my-app",
    span_kind: "llm",
    model_name: "gpt-4o",
    metrics: { input_tokens: 15, output_tokens: 9 },
  },
};

describe("llmobsSpanFields", () => {
  it("normalizes start_ns to ISO and duration ns to ms", () => {
    const f = llmobsSpanFields(span);
    expect(f.start).toBe(new Date(1705314600000).toISOString());
    expect(f.durationMs).toBe(1500);
    expect(f.name).toBe("llm_call");
    expect(f.spanKind).toBe("llm");
    expect(f.mlApp).toBe("my-app");
    expect(f.model).toBe("gpt-4o");
    expect(f.inputTokens).toBe(15);
    expect(f.outputTokens).toBe(9);
  });

  it("returns null token counts when metrics keys are absent", () => {
    const f = llmobsSpanFields({ attributes: { ...span.attributes, metrics: {} } });
    expect(f.inputTokens).toBeNull();
    expect(f.outputTokens).toBeNull();
  });

  it("falls back gracefully on a sparse span", () => {
    const f = llmobsSpanFields({ attributes: {} });
    expect(f.name).toBe("unknown");
    expect(f.start).toBe("unknown");
    expect(f.durationMs).toBeNull();
    expect(f.model).toBeNull();
  });
});

describe("formatLlmobsSpanLine", () => {
  it("renders a one-line summary including model, tokens, duration, status", () => {
    const line = formatLlmobsSpanLine(span);
    expect(line).toContain("my-app llm_call (llm)");
    expect(line).toContain("gpt-4o");
    expect(line).toContain("tok=15/9");
    expect(line).toContain("1500 ms");
    expect(line).toContain("[ok]");
    expect(line).toContain("trace_id=trace-1");
  });

  it("omits the token segment when no counts are present", () => {
    const line = formatLlmobsSpanLine({
      attributes: { ...span.attributes, metrics: {} },
    });
    expect(line).not.toContain("tok=");
  });
});
