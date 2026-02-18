import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetMonitor } = vi.hoisted(() => {
  const mockGetMonitor = vi.fn();
  return { mockGetMonitor };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v1: {
      MonitorsApi: vi.fn().mockImplementation(function () {
        return { getMonitor: mockGetMonitor };
      }),
    },
  };
});

import { client } from "@datadog/datadog-api-client";
import { getMonitor } from "../../src/tools/get-monitor.js";

const fakeConfig = new client.Configuration();

const sampleMonitor = {
  id: 12345,
  name: "High CPU Usage",
  type: "metric alert",
  overallState: "OK",
  tags: ["env:prod", "service:web"],
  query: "avg(last_5m):avg:system.cpu.user{*} > 90",
  message: "CPU is too high! @slack-alerts",
  created: "2025-01-01T00:00:00Z",
  modified: "2025-06-01T00:00:00Z",
};

describe("get_monitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns monitor details in summary format", async () => {
    mockGetMonitor.mockResolvedValue(sampleMonitor);

    const result = await getMonitor.handler(
      { monitorId: 12345, format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("High CPU Usage");
    expect(text).toContain("12345");
    expect(text).toContain("OK");
    expect(text).toContain("metric alert");
    expect(text).toContain("avg(last_5m):avg:system.cpu.user{*} > 90");
    expect(text).toContain("CPU is too high!");
    expect(text).toContain("env:prod");

    // Verify it called the API with the correct monitorId
    expect(mockGetMonitor).toHaveBeenCalledWith({ monitorId: 12345 });
  });

  it("returns full JSON when format is json", async () => {
    mockGetMonitor.mockResolvedValue(sampleMonitor);

    const result = await getMonitor.handler(
      { monitorId: 12345, format: "json" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(12345);
    expect(parsed.name).toBe("High CPU Usage");
    expect(parsed.query).toBe("avg(last_5m):avg:system.cpu.user{*} > 90");
  });
});
