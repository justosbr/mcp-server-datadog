import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListTagConfigurations } = vi.hoisted(() => {
  const mockListTagConfigurations = vi.fn();
  return { mockListTagConfigurations };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      MetricsApi: vi.fn().mockImplementation(function () {
        return { listTagConfigurations: mockListTagConfigurations };
      }),
    },
  };
});

import { client } from "@datadog/datadog-api-client";
import { listMetrics } from "../../src/tools/list-metrics.js";

const fakeConfig = new client.Configuration();

const sampleMetrics = {
  data: [
    {
      id: "system.cpu.user",
      type: "manage_tags",
      attributes: { metricType: "gauge" },
    },
    {
      id: "system.disk.free",
      type: "manage_tags",
      attributes: { metricType: "gauge" },
    },
  ],
};

describe("list_metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns metrics in summary format", async () => {
    mockListTagConfigurations.mockResolvedValue(sampleMetrics);

    const result = await listMetrics.handler(
      { format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 metrics found");
    expect(text).toContain("system.cpu.user");
    expect(text).toContain("system.disk.free");
  });

  it("returns friendly message when no metrics found", async () => {
    mockListTagConfigurations.mockResolvedValue({ data: [] });

    const result = await listMetrics.handler({}, fakeConfig);

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No metrics found matching the given filters");
  });
});
