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

import { searchLlmobsSpans } from "../../src/tools/search-llmobs-spans.js";

const env = { apiKey: "k", appKey: "a", site: "datadoghq.com" };
const fakeConfig = {} as any;

const sample = {
  data: [
    {
      id: "s1",
      attributes: {
        span_id: "s1",
        trace_id: "t1",
        name: "llm_call",
        status: "ok",
        start_ns: 1705314600000000000,
        duration: 1500000000,
        ml_app: "my-app",
        span_kind: "llm",
        model_name: "gpt-4o",
        metrics: { input_tokens: 15, output_tokens: 9 },
      },
    },
  ],
  meta: { page: { after: "CURSOR2" } },
};

describe("search_llmobs_spans", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a summary and surfaces the next-page cursor", async () => {
    mockSearch.mockResolvedValue(sample);
    const res = await searchLlmobsSpans.handler(
      { ml_app: "my-app", span_kind: "llm", format: "summary" },
      fakeConfig,
      env
    );
    expect(res.content[0].text).toContain("1 LLM Observability spans found");
    expect(res.content[0].text).toContain("my-app llm_call (llm)");
    expect(res.content[0].text).toContain("Next page cursor: CURSOR2");
  });

  it("builds the filter from structured params and a descending sort", async () => {
    mockSearch.mockResolvedValue(sample);
    await searchLlmobsSpans.handler(
      { ml_app: "my-app", span_kind: "llm", tags: { env: "prod" }, limit: 25 },
      fakeConfig,
      env
    );
    const [passedEnv, attrs] = mockSearch.mock.calls[0];
    expect(passedEnv).toBe(env);
    expect(attrs.filter).toMatchObject({
      ml_app: "my-app",
      span_kind: "llm",
      tags: { env: "prod" },
      from: "2026-06-09T00:00:00.000Z",
      to: "2026-06-16T00:00:00.000Z",
    });
    expect(attrs.page.limit).toBe(25);
    expect(attrs.sort).toBe("-start_ns");
  });

  it("caps limit at the client-side maximum", async () => {
    mockSearch.mockResolvedValue(sample);
    await searchLlmobsSpans.handler({ limit: 99999 }, fakeConfig, env);
    expect(mockSearch.mock.calls[0][1].page.limit).toBe(200);
  });

  it("passes a free-text query through", async () => {
    mockSearch.mockResolvedValue(sample);
    await searchLlmobsSpans.handler({ query: "@session_id:abc" }, fakeConfig, env);
    expect(mockSearch.mock.calls[0][1].filter.query).toBe("@session_id:abc");
  });

  it("reports a friendly message when no spans match", async () => {
    mockSearch.mockResolvedValue({ data: [], meta: {} });
    const res = await searchLlmobsSpans.handler({}, fakeConfig, env);
    expect(res.content[0].text).toContain("No LLM Observability spans found");
    expect(res.isError).toBeUndefined();
  });

  it("formats a 403 via formatError (proves error shape integrates)", async () => {
    const err: any = new Error("nope");
    err.httpStatusCode = 403;
    mockSearch.mockRejectedValue(err);
    const res = await searchLlmobsSpans.handler({}, fakeConfig, env);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Permission denied for search_llmobs_spans");
  });

  it("errors clearly when no env is provided", async () => {
    const res = await searchLlmobsSpans.handler({}, fakeConfig, undefined);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("no Datadog credentials");
  });
});
