import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchIssues } = vi.hoisted(() => ({ mockSearchIssues: vi.fn() }));

vi.mock("@datadog/datadog-api-client", () => ({
  client: { Configuration: vi.fn() },
  v2: {
    ErrorTrackingApi: vi.fn().mockImplementation(function () {
      return { searchIssues: mockSearchIssues };
    }),
  },
}));

import { searchErrorIssues } from "../../src/tools/search-error-issues.js";

const config = {} as any;

describe("search_error_issues", () => {
  beforeEach(() => vi.clearAllMocks());

  it("joins result metrics with the included issue details and sends an ms-epoch window", async () => {
    mockSearchIssues.mockResolvedValue({
      data: [
        {
          attributes: { totalCount: 42, impactedUsers: 7 },
          relationships: { issue: { data: { id: "i1" } } },
        },
      ],
      included: [
        {
          type: "issue",
          id: "i1",
          attributes: {
            errorType: "TimeoutError",
            errorMessage: "timed out",
            service: "payments",
            state: "OPEN",
            firstSeenVersion: "1.0",
            lastSeenVersion: "1.2",
          },
        },
      ],
    });

    const res = await searchErrorIssues.handler(
      { query: "service:payments", track: "trace" },
      config
    );
    const text = res.content[0].text as string;
    expect(text).toContain("TimeoutError: timed out");
    expect(text).toContain("(payments) count=42 users=7");
    expect(text).toContain("ver 1.0→1.2");

    const attrs = mockSearchIssues.mock.calls[0][0].body.data.attributes;
    expect(typeof attrs.from).toBe("number"); // ms epoch, not ISO
    expect(attrs.track).toBe("trace");
  });

  it("reports a friendly message when nothing matches", async () => {
    mockSearchIssues.mockResolvedValue({ data: [], included: [] });
    const res = await searchErrorIssues.handler({}, config);
    expect(res.content[0].text).toContain("No Error Tracking issues found");
  });
});
