import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAggregateRUMEvents } = vi.hoisted(() => {
  const mockAggregateRUMEvents = vi.fn();
  return { mockAggregateRUMEvents };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      RUMApi: vi.fn().mockImplementation(function () {
        return { aggregateRUMEvents: mockAggregateRUMEvents };
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
import { aggregateRumEvents } from "../../src/tools/aggregate-rum-events.js";

const fakeConfig = new client.Configuration();

describe("aggregate_rum_events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns grouped aggregation in summary format", async () => {
    mockAggregateRUMEvents.mockResolvedValue({
      data: {
        buckets: [
          { by: { "@type": "error" }, computes: { c0: 42 } },
          { by: { "@type": "view" }, computes: { c0: 1337 } },
        ],
      },
    });

    const result = await aggregateRumEvents.handler(
      {
        query: "*",
        aggregation: "count",
        groupBy: "@type",
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("@type");
    expect(text).toContain("error");
    expect(text).toContain("42");
    expect(text).toContain("1337");

    // Outbound request shape — guards against field-name / compute-type drift.
    const sentBody = mockAggregateRUMEvents.mock.calls[0][0].body;
    expect(sentBody.groupBy[0]).toEqual({ facet: "@type", limit: 10 });
    expect(sentBody.compute[0].type).toBe("total");
  });

  it("rejects non-count aggregation when metric is missing", async () => {
    const result = await aggregateRumEvents.handler(
      { query: "*", aggregation: "avg", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("'metric' is required");
    expect(mockAggregateRUMEvents).not.toHaveBeenCalled();
  });

  it("returns friendly message when no data", async () => {
    mockAggregateRUMEvents.mockResolvedValue({ data: { buckets: [] } });

    const result = await aggregateRumEvents.handler(
      { query: "service:nonexistent", aggregation: "count", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "No data found for the given RUM query and time range"
    );
  });
});
