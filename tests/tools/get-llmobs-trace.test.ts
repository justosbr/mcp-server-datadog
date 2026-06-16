import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearch } = vi.hoisted(() => ({ mockSearch: vi.fn() }));

vi.mock("../../src/utils/llmobs-http.js", () => ({
  llmobsSearchSpans: mockSearch,
}));

vi.mock("../../src/utils/time.js", () => ({
  parseTimeRange: vi.fn().mockReturnValue({
    from: "2026-06-09T00:00:00.000Z",
    to: "2026-06-16T00:00:00.000Z",
  }),
}));

import { getLlmobsTrace } from "../../src/tools/get-llmobs-trace.js";

const env = { apiKey: "k", appKey: "a", site: "datadoghq.com" };
const fakeConfig = {} as any;

function span(id: string, startNs: number, name: string) {
  return {
    id,
    attributes: {
      span_id: id,
      trace_id: "t1",
      name,
      status: "ok",
      start_ns: startNs,
      duration: 1000000,
      ml_app: "my-app",
      span_kind: "llm",
    },
  };
}

describe("get_llmobs_trace", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by trace_id and orders spans chronologically by start_ns", async () => {
    // Returned out of order; expect chronological rendering.
    mockSearch.mockResolvedValue({
      data: [span("b", 200, "second"), span("a", 100, "first")],
      meta: { page: {} },
    });

    const res = await getLlmobsTrace.handler(
      { traceId: "t1", format: "summary" },
      fakeConfig,
      env
    );

    expect(mockSearch.mock.calls[0][1].filter.trace_id).toBe("t1");
    const text = res.content[0].text as string;
    expect(text).toContain("LLM trace t1: 2 spans");
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
  });

  it("reports a friendly message when the trace has no spans", async () => {
    mockSearch.mockResolvedValue({ data: [], meta: {} });
    const res = await getLlmobsTrace.handler({ traceId: "missing" }, fakeConfig, env);
    expect(res.content[0].text).toContain(
      "No LLM Observability spans found for trace ID missing"
    );
    expect(res.isError).toBeUndefined();
  });

  it("errors clearly when no env is provided", async () => {
    const res = await getLlmobsTrace.handler({ traceId: "t1" }, fakeConfig, undefined);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("no Datadog credentials");
  });
});
