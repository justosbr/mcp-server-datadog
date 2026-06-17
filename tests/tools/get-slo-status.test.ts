import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSLOHistory } = vi.hoisted(() => ({ mockGetSLOHistory: vi.fn() }));

vi.mock("@datadog/datadog-api-client", () => ({
  client: { Configuration: vi.fn() },
  v1: {
    ServiceLevelObjectivesApi: vi.fn().mockImplementation(function () {
      return { getSLOHistory: mockGetSLOHistory };
    }),
  },
}));

import { getSloStatus } from "../../src/tools/get-slo-status.js";

const config = {} as any;

describe("get_slo_status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports SLI, uptime and error budget, and queries with a seconds-epoch window", async () => {
    mockGetSLOHistory.mockResolvedValue({
      data: {
        type: "metric",
        overall: {
          name: "Checkout availability",
          sliValue: 99.95,
          uptime: 99.9,
          errorBudgetRemaining: { "30d": 45.2 },
        },
      },
    });
    const res = await getSloStatus.handler({ sloId: "slo1" }, config);
    const text = res.content[0].text as string;
    expect(text).toContain("SLO Checkout availability (metric)");
    expect(text).toContain("SLI attained:          99.950%");
    expect(text).toContain("error budget remaining: 30d: 45.20%");

    const param = mockGetSLOHistory.mock.calls[0][0];
    expect(typeof param.fromTs).toBe("number");
    expect(param.fromTs).toBeLessThan(1e11); // seconds epoch, not milliseconds
  });
});
