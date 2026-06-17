import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetIssue } = vi.hoisted(() => ({ mockGetIssue: vi.fn() }));

vi.mock("@datadog/datadog-api-client", () => ({
  client: { Configuration: vi.fn() },
  v2: {
    ErrorTrackingApi: vi.fn().mockImplementation(function () {
      return { getIssue: mockGetIssue };
    }),
  },
}));

import { getErrorIssue } from "../../src/tools/get-error-issue.js";

const config = {} as any;

describe("get_error_issue", () => {
  beforeEach(() => vi.clearAllMocks());

  it("formats the issue detail", async () => {
    mockGetIssue.mockResolvedValue({
      data: {
        attributes: {
          errorType: "NullPointer",
          errorMessage: "boom",
          service: "checkout",
          state: "RESOLVED",
          filePath: "app/pay.py",
          functionName: "charge",
          firstSeenVersion: "1.0",
          lastSeenVersion: "1.2",
        },
      },
    });
    const res = await getErrorIssue.handler({ issueId: "i1" }, config);
    const text = res.content[0].text as string;
    expect(text).toContain("type:     NullPointer");
    expect(text).toContain("location: app/pay.py:charge");
    expect(mockGetIssue.mock.calls[0][0].issueId).toBe("i1");
  });
});
