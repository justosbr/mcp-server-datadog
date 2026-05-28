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
import { getLogFieldValues } from "../../src/tools/get-log-field-values.js";

const fakeConfig = new client.Configuration();

describe("get_log_field_values", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns field values in summary format", async () => {
    mockAggregateLogs.mockResolvedValue({
      data: {
        buckets: [
          {
            by: { service: "payments" },
            computes: { "c0": { value: 5000 } },
          },
          {
            by: { service: "auth" },
            computes: { "c0": { value: 3200 } },
          },
          {
            by: { service: "billing" },
            computes: { "c0": { value: 1500 } },
          },
        ],
      },
    });

    const result = await getLogFieldValues.handler(
      {
        field: "service",
        query: "*",
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("Values for field 'service'");
    expect(text).toContain("payments");
    expect(text).toContain("5000");
    expect(text).toContain("auth");
    expect(text).toContain("3200");
    expect(text).toContain("billing");
    expect(text).toContain("1500");
  });

  it("returns friendly message when no values found", async () => {
    mockAggregateLogs.mockResolvedValue({
      data: {
        buckets: [],
      },
    });

    const result = await getLogFieldValues.handler(
      {
        field: "nonexistent_field",
        query: "*",
        format: "summary",
      },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No values found for field 'nonexistent_field'");
  });
});
