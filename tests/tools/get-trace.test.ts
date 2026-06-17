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

  it("sorts and renders spans when startTimestamp is a Date (real client shape)", async () => {
    // The deserialized v2 Spans API returns startTimestamp as a Date object.
    // Spans are supplied out of chronological order to exercise the sort.
    const dateShapedSpans = {
      data: [
        {
          attributes: {
            service: "postgres",
            resourceName: "SELECT * FROM users",
            startTimestamp: new Date("2026-02-18T00:05:00.100Z"),
            traceId: "trace-abc-123",
            spanId: "span-003",
            additionalProperties: { operation_name: "db.query", status: "ok" },
            custom: { duration: 160_000 }, // 0.16ms
          },
        },
        {
          attributes: {
            service: "api-gateway",
            resourceName: "GET /api/users",
            startTimestamp: new Date("2026-02-18T00:05:00.000Z"),
            traceId: "trace-abc-123",
            spanId: "span-001",
            additionalProperties: { operation_name: "http.request", status: "ok" },
            custom: { duration: 250_000_000 }, // 250ms
          },
        },
      ],
      meta: { page: {} },
    };
    mockListSpans.mockResolvedValue(dateShapedSpans);

    const result = await getTrace.handler(
      { traceId: "trace-abc-123", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 spans");
    expect(text).toContain("api-gateway/http.request");
    expect(text).toContain("postgres/db.query");
    expect(text).toContain("0.16 ms");
    // Sorted chronologically: api-gateway (earliest) before postgres.
    expect(text.indexOf("api-gateway")).toBeLessThan(text.indexOf("postgres"));
  });

  it("caps json output and notes truncation when spans are large", async () => {
    const blob = "x".repeat(2000);
    const manySpans = {
      data: Array.from({ length: 50 }, (_, i) => ({
        attributes: {
          service: `svc-${i}`,
          resourceName: "resource",
          startTimestamp: new Date(2026, 1, 18, 0, 5, 0, i),
          traceId: "trace-big",
          spanId: `span-${i}`,
          additionalProperties: { operation_name: "op", status: "ok" },
          custom: { duration: 1_000_000, blob },
        },
      })),
      meta: { page: {} },
    };
    mockListSpans.mockResolvedValue(manySpans);

    const result = await getTrace.handler(
      { traceId: "trace-big", format: "json" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text as string;
    const parsed = JSON.parse(text); // valid JSON even when truncated
    expect(parsed.truncated.total).toBe(50);
    expect(parsed.truncated.shown).toBeLessThan(50);
    expect(parsed.data.length).toBe(parsed.truncated.shown);
    expect(parsed.data[0].attributes.service).toBe("svc-0");
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
