import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAggregateLogs } = vi.hoisted(() => {
  const mockAggregateLogs = vi.fn();
  return { mockAggregateLogs };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      LogsApi: vi.fn().mockImplementation(function () {
        return { aggregateLogs: mockAggregateLogs };
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
import { aggregateLogs } from "../../src/tools/aggregate-logs.js";

const fakeConfig = new client.Configuration();

describe("aggregate_logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns grouped aggregation in summary format", async () => {
    // Real API returns the compute value as a scalar keyed by "c0", not { value }.
    mockAggregateLogs.mockResolvedValue({
      data: {
        buckets: [
          {
            by: { service: "payments" },
            computes: { "c0": 1234 },
          },
          {
            by: { service: "auth" },
            computes: { "c0": 567 },
          },
        ],
      },
    });

    const result = await aggregateLogs.handler(
      {
        query: "status:error",
        aggregation: "count",
        groupBy: "service",
        groupLimit: 10,
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("count");
    expect(text).toContain("service");
    expect(text).toContain("payments");
    expect(text).toContain("1234");
    expect(text).toContain("auth");
    expect(text).toContain("567");
  });

  it("returns ungrouped scalar result instead of silently zero", async () => {
    mockAggregateLogs.mockResolvedValue({
      data: { buckets: [{ by: {}, computes: { "c0": 1151436 } }] },
    });

    const result = await aggregateLogs.handler(
      { query: "*", aggregation: "count", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("1151436");
  });

  it("omits the invalid sort field from group_by requests", async () => {
    mockAggregateLogs.mockResolvedValue({
      data: { buckets: [{ by: { service: "payments" }, computes: { "c0": 1 } }] },
    });

    await aggregateLogs.handler(
      { query: "*", aggregation: "count", groupBy: "service", format: "summary" },
      fakeConfig
    );

    const sentBody = mockAggregateLogs.mock.calls[0][0].body;
    expect(sentBody.groupBy[0]).toEqual({ facet: "service", limit: 10 });
    expect(sentBody.groupBy[0].sort).toBeUndefined();
  });

  it("returns friendly message when no data", async () => {
    mockAggregateLogs.mockResolvedValue({
      data: {
        buckets: [],
      },
    });

    const result = await aggregateLogs.handler(
      {
        query: "service:nonexistent",
        aggregation: "count",
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No data found for the given query and time range");
  });
});
