import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryMetrics, mockParseTimeRange } = vi.hoisted(() => {
  const mockQueryMetrics = vi.fn();
  const mockParseTimeRange = vi.fn();
  return { mockQueryMetrics, mockParseTimeRange };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v1: {
      MetricsApi: vi.fn().mockImplementation(function () {
        return { queryMetrics: mockQueryMetrics };
      }),
    },
  };
});

vi.mock("../../src/utils/time.js", () => {
  return {
    parseTimeRange: mockParseTimeRange,
  };
});

import { client } from "@datadog/datadog-api-client";
import { queryMetrics } from "../../src/tools/query-metrics.js";

const fakeConfig = new client.Configuration();

const sampleResponse = {
  series: [
    {
      metric: "system.cpu.user",
      scope: "host:web-01",
      pointlist: [
        [1700000000000, 42.5],
        [1700000060000, 45.2],
        [1700000120000, 38.7],
      ],
      tagSet: ["env:prod", "host:web-01"],
    },
    {
      metric: "system.cpu.user",
      scope: "host:web-02",
      pointlist: [
        [1700000000000, 55.1],
        [1700000060000, 60.3],
        [1700000120000, 52.8],
      ],
      tagSet: ["env:prod", "host:web-02"],
    },
  ],
};

describe("query_metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockParseTimeRange.mockReturnValue({
      from: "2025-11-14T22:00:00.000Z",
      to: "2025-11-14T22:15:00.000Z",
    });
  });

  it("returns metric data in summary format", async () => {
    mockQueryMetrics.mockResolvedValue(sampleResponse);

    const result = await queryMetrics.handler(
      {
        query: "avg:system.cpu.user{env:prod} by {host}",
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("avg:system.cpu.user{env:prod} by {host}");
    expect(text).toContain("2 series returned");
    expect(text).toContain("host:web-01");
    expect(text).toContain("host:web-02");
    expect(text).toContain("38.7");
    expect(text).toContain("52.8");
  });

  it("returns metric data in JSON format", async () => {
    mockQueryMetrics.mockResolvedValue(sampleResponse);

    const result = await queryMetrics.handler(
      {
        query: "avg:system.cpu.user{env:prod} by {host}",
        format: "json",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.series).toHaveLength(2);
    expect(parsed.series[0].metric).toBe("system.cpu.user");
    expect(parsed.series[1].metric).toBe("system.cpu.user");
  });

  it("returns friendly message when no data found", async () => {
    mockQueryMetrics.mockResolvedValue({ series: [] });

    const result = await queryMetrics.handler(
      {
        query: "avg:system.cpu.user{env:staging}",
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No data found for query");
    expect(text).toContain("avg:system.cpu.user{env:staging}");
  });

  it("converts relative time to UNIX seconds", async () => {
    mockQueryMetrics.mockResolvedValue(sampleResponse);

    await queryMetrics.handler(
      {
        query: "avg:system.cpu.user{*}",
        from: "1h",
        to: "now",
      },
      fakeConfig
    );

    expect(mockParseTimeRange).toHaveBeenCalledWith("1h", "now");

    const callArgs = mockQueryMetrics.mock.calls[0][0];
    expect(typeof callArgs.from).toBe("number");
    expect(typeof callArgs.to).toBe("number");
    expect(callArgs.from).toBe(
      Math.floor(new Date("2025-11-14T22:00:00.000Z").getTime() / 1000)
    );
    expect(callArgs.to).toBe(
      Math.floor(new Date("2025-11-14T22:15:00.000Z").getTime() / 1000)
    );
  });
});
