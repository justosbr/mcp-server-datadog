import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListMonitors } = vi.hoisted(() => {
  const mockListMonitors = vi.fn();
  return { mockListMonitors };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v1: {
      MonitorsApi: vi.fn().mockImplementation(function () {
        return { listMonitors: mockListMonitors };
      }),
    },
  };
});

import { client } from "@datadog/datadog-api-client";
import { listMonitors } from "../../src/tools/list-monitors.js";

const fakeConfig = new client.Configuration();

const sampleMonitors = [
  {
    id: 12345,
    name: "High CPU Usage",
    type: "metric alert",
    overallState: "OK",
    tags: ["env:prod", "service:web"],
    query: "avg(last_5m):avg:system.cpu.user{*} > 90",
    message: "CPU is too high!",
    created: "2025-01-01T00:00:00Z",
    modified: "2025-06-01T00:00:00Z",
  },
  {
    id: 67890,
    name: "Low Disk Space",
    type: "metric alert",
    overallState: "Alert",
    tags: ["env:staging"],
    query: "avg(last_10m):avg:system.disk.free{*} < 10",
    message: "Disk space is low!",
    created: "2025-02-01T00:00:00Z",
    modified: "2025-07-01T00:00:00Z",
  },
];

describe("list_monitors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns monitors in summary format", async () => {
    mockListMonitors.mockResolvedValue(sampleMonitors);

    const result = await listMonitors.handler(
      { format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 monitors found");
    expect(text).toContain("High CPU Usage");
    expect(text).toContain("Low Disk Space");
    expect(text).toContain("OK");
    expect(text).toContain("Alert");
    expect(text).toContain("12345");
    expect(text).toContain("67890");
  });

  it("returns monitors in json format", async () => {
    mockListMonitors.mockResolvedValue(sampleMonitors);

    const result = await listMonitors.handler({ format: "json" }, fakeConfig);

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe("High CPU Usage");
    expect(parsed[1].name).toBe("Low Disk Space");
  });

  it("passes filters to the Datadog API", async () => {
    mockListMonitors.mockResolvedValue([]);

    await listMonitors.handler(
      {
        name: "CPU",
        tags: "env:prod,service:web",
        monitorTags: "team:backend",
      },
      fakeConfig
    );

    expect(mockListMonitors).toHaveBeenCalledWith({
      name: "CPU",
      tags: "env:prod,service:web",
      monitorTags: "team:backend",
    });
  });

  it("returns friendly message when no monitors found", async () => {
    mockListMonitors.mockResolvedValue([]);

    const result = await listMonitors.handler({}, fakeConfig);

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No monitors found matching the given filters");
  });
});
