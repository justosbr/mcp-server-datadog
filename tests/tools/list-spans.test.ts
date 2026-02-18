import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListSpans } = vi.hoisted(() => {
  const mockListSpans = vi.fn();
  return { mockListSpans };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      SpansApi: vi.fn().mockImplementation(function () {
        return { listSpans: mockListSpans };
      }),
    },
  };
});

vi.mock("../../src/utils/time.js", () => {
  return {
    parseTimeRange: vi.fn().mockReturnValue({
      from: "2026-02-18T00:00:00.000Z",
      to: "2026-02-18T00:15:00.000Z",
    }),
  };
});

import { client } from "@datadog/datadog-api-client";
import { listSpans } from "../../src/tools/list-spans.js";

const fakeConfig = new client.Configuration();

const sampleSpans = {
  data: [
    {
      attributes: {
        service: "payments",
        operationName: "http.request",
        resourceName: "POST /api/charge",
        status: "error",
        duration: 125_000_000, // 125ms in nanoseconds
        start: "2026-02-18T00:05:00.000Z",
        traceId: "abc123def456",
        spanId: "span001",
      },
    },
    {
      attributes: {
        service: "auth",
        operationName: "grpc.server",
        resourceName: "AuthService.Validate",
        status: "ok",
        duration: 3_500_000, // 3.5ms → rounds to 4ms
        start: "2026-02-18T00:10:00.000Z",
        traceId: "abc123def456",
        spanId: "span002",
      },
    },
  ],
  meta: {
    page: {},
  },
};

describe("list_spans", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns spans in summary format", async () => {
    mockListSpans.mockResolvedValue(sampleSpans);

    const result = await listSpans.handler(
      { query: "service:payments AND status:error", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 spans found");
    expect(text).toContain("service:payments AND status:error");
    expect(text).toContain("payments/http.request");
    expect(text).toContain("POST /api/charge");
    expect(text).toContain("125 ms");
    expect(text).toContain("error");
    expect(text).toContain("abc123def456");
    expect(text).toContain("auth/grpc.server");
    expect(text).toContain("AuthService.Validate");
    expect(text).toContain("4 ms");
    expect(text).toContain("ok");
  });

  it("returns friendly message when no spans found", async () => {
    mockListSpans.mockResolvedValue({ data: [], meta: {} });

    const result = await listSpans.handler(
      { query: "service:nonexistent" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No spans found matching query");
    expect(text).toContain("service:nonexistent");
  });

  it("includes next page cursor when available", async () => {
    const spansWithCursor = {
      ...sampleSpans,
      meta: {
        page: {
          after: "eyJhZnRlciI6InNwYW4wMDIifQ==",
        },
      },
    };
    mockListSpans.mockResolvedValue(spansWithCursor);

    const result = await listSpans.handler(
      { query: "*", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("Next page cursor:");
    expect(text).toContain("eyJhZnRlciI6InNwYW4wMDIifQ==");
  });
});
