import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListTagsByMetricName } = vi.hoisted(() => {
  const mockListTagsByMetricName = vi.fn();
  return { mockListTagsByMetricName };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      MetricsApi: vi.fn().mockImplementation(function () {
        return { listTagsByMetricName: mockListTagsByMetricName };
      }),
    },
  };
});

import { client } from "@datadog/datadog-api-client";
import { getMetricTags } from "../../src/tools/get-metric-tags.js";

const fakeConfig = new client.Configuration();

describe("get_metric_tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns tags in summary format", async () => {
    mockListTagsByMetricName.mockResolvedValue({
      data: {
        id: "system.cpu.user",
        type: "manage_tags",
        attributes: {
          tags: ["env", "host", "service"],
        },
      },
    });

    const result = await getMetricTags.handler(
      { metricName: "system.cpu.user", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("Tags for system.cpu.user");
    expect(text).toContain("env");
    expect(text).toContain("host");
    expect(text).toContain("service");
  });

  it("returns friendly message when no tags found", async () => {
    mockListTagsByMetricName.mockResolvedValue({
      data: {
        id: "custom.metric",
        type: "manage_tags",
        attributes: {
          tags: [],
        },
      },
    });

    const result = await getMetricTags.handler(
      { metricName: "custom.metric", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No tags found for custom.metric");
  });
});
