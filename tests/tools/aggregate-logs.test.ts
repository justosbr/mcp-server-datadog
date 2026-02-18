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
    mockAggregateLogs.mockResolvedValue({
      data: {
        buckets: [
          {
            by: { service: "payments" },
            computes: { "c0": { value: 1234 } },
          },
          {
            by: { service: "auth" },
            computes: { "c0": { value: 567 } },
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
