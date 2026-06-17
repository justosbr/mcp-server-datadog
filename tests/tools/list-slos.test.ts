import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListSLOs } = vi.hoisted(() => ({ mockListSLOs: vi.fn() }));

vi.mock("@datadog/datadog-api-client", () => ({
  client: { Configuration: vi.fn() },
  v1: {
    ServiceLevelObjectivesApi: vi.fn().mockImplementation(function () {
      return { listSLOs: mockListSLOs };
    }),
  },
}));

import { listSlos } from "../../src/tools/list-slos.js";

const config = {} as any;

describe("list_slos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders name, type, thresholds and forwards query/tags filters", async () => {
    mockListSLOs.mockResolvedValue({
      data: [
        {
          id: "slo1",
          name: "Checkout availability",
          type: "metric",
          tags: ["team:payments"],
          thresholds: [{ target: 99.9, targetDisplay: "99.9", timeframe: "30d" }],
        },
      ],
    });
    const res = await listSlos.handler({ query: "checkout", tags: "team:payments" }, config);
    const text = res.content[0].text as string;
    expect(text).toContain("Checkout availability (metric) [slo1] target 99.9%/30d");
    expect(text).toContain("{team:payments}");
    const param = mockListSLOs.mock.calls[0][0];
    expect(param.query).toBe("checkout");
    expect(param.tagsQuery).toBe("team:payments");
  });
});
