import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListLogs } = vi.hoisted(() => {
  const mockListLogs = vi.fn();
  return { mockListLogs };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      LogsApi: vi.fn().mockImplementation(function () {
        return { listLogs: mockListLogs };
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
import { searchLogs } from "../../src/tools/search-logs.js";

const fakeConfig = new client.Configuration();

const sampleLogs = {
  data: [
    {
      attributes: {
        timestamp: "2026-02-18T00:05:00.000Z",
        service: "payments",
        status: "error",
        message: "Payment processing failed for order #12345",
        tags: ["env:prod", "region:us-east"],
      },
    },
    {
      attributes: {
        timestamp: "2026-02-18T00:10:00.000Z",
        service: "auth",
        status: "warn",
        message: "Rate limit approaching for user abc-123",
        tags: ["env:prod"],
      },
    },
  ],
  meta: {
    page: {},
  },
};

describe("search_logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns logs in summary format", async () => {
    mockListLogs.mockResolvedValue(sampleLogs);

    const result = await searchLogs.handler(
      { query: "service:payments AND status:error", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 logs found");
    expect(text).toContain("service:payments AND status:error");
    expect(text).toContain("2026-02-18T00:05:00.000Z");
    expect(text).toContain("payments");
    expect(text).toContain("error");
    expect(text).toContain("Payment processing failed");
    expect(text).toContain("2026-02-18T00:10:00.000Z");
    expect(text).toContain("auth");
    expect(text).toContain("warn");
    expect(text).toContain("Rate limit approaching");
  });

  it("returns logs in JSON format", async () => {
    mockListLogs.mockResolvedValue(sampleLogs);

    const result = await searchLogs.handler(
      { query: "service:payments", format: "json" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].attributes.service).toBe("payments");
    expect(parsed.data[1].attributes.service).toBe("auth");
  });

  it("caps oversized JSON output and notes truncation", async () => {
    const bigMessage = "x".repeat(3000);
    const manyLogs = {
      data: Array.from({ length: 20 }, (_, i) => ({
        attributes: {
          timestamp: "2026-02-18T00:05:00.000Z",
          service: "verbose-service",
          status: "info",
          message: bigMessage,
          attributes: { index: i, payload: bigMessage },
        },
      })),
      meta: { page: { after: "next-cursor-token" } },
    };
    mockListLogs.mockResolvedValue(manyLogs);

    const result = await searchLogs.handler(
      { query: "*", format: "json" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("Output truncated");
    expect(text).toContain("of 20 logs");
    expect(text).toContain("meta.page.after");
    expect(text.length).toBeLessThan(30_000);
  });

  it("returns friendly message when no logs found", async () => {
    mockListLogs.mockResolvedValue({ data: [], meta: {} });

    const result = await searchLogs.handler(
      { query: "service:nonexistent" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No logs found matching query");
    expect(text).toContain("service:nonexistent");
  });

  it("includes next page cursor when available", async () => {
    const logsWithCursor = {
      ...sampleLogs,
      meta: {
        page: {
          after: "eyJhZnRlciI6IjEyMzQ1Njc4OTAifQ==",
        },
      },
    };
    mockListLogs.mockResolvedValue(logsWithCursor);

    const result = await searchLogs.handler(
      { query: "*", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("Next page cursor:");
    expect(text).toContain("eyJhZnRlciI6IjEyMzQ1Njc4OTAifQ==");
  });
});
