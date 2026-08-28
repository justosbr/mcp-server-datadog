import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUpdateIssueState } = vi.hoisted(() => ({ mockUpdateIssueState: vi.fn() }));

vi.mock("@datadog/datadog-api-client", () => ({
  client: { Configuration: vi.fn() },
  v2: {
    ErrorTrackingApi: vi.fn().mockImplementation(function () {
      return { updateIssueState: mockUpdateIssueState };
    }),
  },
}));

import { updateErrorIssueState } from "../../src/tools/update-error-issue-state.js";

const config = {} as any;

describe("update_error_issue_state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the exact request body for the issue and state", async () => {
    mockUpdateIssueState.mockResolvedValue({});
    await updateErrorIssueState.handler({ issueIds: ["i1"], state: "RESOLVED" }, config);
    expect(mockUpdateIssueState.mock.calls[0][0]).toEqual({
      issueId: "i1",
      body: { data: { type: "error_tracking_issue", id: "i1", attributes: { state: "RESOLVED" } } },
    });
  });

  it("isolates a failure on one issue so the remaining issue is still attempted and reported", async () => {
    mockUpdateIssueState.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const res = await updateErrorIssueState.handler({ issueIds: ["i1", "i2"], state: "IGNORED" }, config);
    expect(mockUpdateIssueState).toHaveBeenCalledTimes(2);
    const text = res.content[0].text as string;
    expect(text).toContain("i1 -> IGNORED:");
    expect(text).toContain("i2 -> IGNORED: ok");
  });
});
