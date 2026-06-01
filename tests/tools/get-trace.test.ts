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
      from: "2026-02-11T00:00:00.000Z",
      to: "2026-02-18T00:00:00.000Z",
    }),
  };
});

import { client } from "@datadog/datadog-api-client";
import { getTrace } from "../../src/tools/get-trace.js";

const fakeConfig = new client.Configuration();

// Mirrors the deserialized v2 Spans API shape: operation_name/status under
// additionalProperties, raw duration (ns) under custom, start under startTimestamp.
const sampleTraceSpans = {
  data: [
    {
      attributes: {
        service: "api-gateway",
        resourceName: "GET /api/users",
        startTimestamp: "2026-02-18T00:05:00.000Z",
        traceId: "trace-abc-123",
        spanId: "span-001",
        additionalProperties: { operation_name: "http.request", status: "ok" },
        custom: { duration: 250_000_000 }, // 250ms
      },
    },
    {
      attributes: {
        service: "users-service",
        resourceName: "UsersService.List",
        startTimestamp: "2026-02-18T00:05:00.050Z",
        traceId: "trace-abc-123",
        spanId: "span-002",
        additionalProperties: { operation_name: "grpc.server", status: "ok" },
        custom: { duration: 120_000_000 }, // 120ms
      },
    },
    {
      attributes: {
        service: "postgres",
        resourceName: "SELECT * FROM users",
        startTimestamp: "2026-02-18T00:05:00.100Z",
        traceId: "trace-abc-123",
        spanId: "span-003",
        additionalProperties: { operation_name: "db.query", status: "ok" },
        custom: { duration: 45_000_000 }, // 45ms
      },
    },
  ],
  meta: {
    page: {},
  },
};

describe("get_trace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns trace spans in summary format", async () => {
    mockListSpans.mockResolvedValue(sampleTraceSpans);

    const result = await getTrace.handler(
      { traceId: "trace-abc-123", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("trace-abc-123");
    expect(text).toContain("3 spans");
    expect(text).toContain("api-gateway/http.request");
    expect(text).toContain("users-service/grpc.server");
    expect(text).toContain("postgres/db.query");
    expect(text).toContain("250 ms");
    expect(text).toContain("120 ms");
    expect(text).toContain("45 ms");
  });

  it("returns friendly message when trace not found", async () => {
    mockListSpans.mockResolvedValue({ data: [], meta: {} });

    const result = await getTrace.handler(
      { traceId: "nonexistent-trace-id" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No spans found for trace ID");
    expect(text).toContain("nonexistent-trace-id");
  });
});
