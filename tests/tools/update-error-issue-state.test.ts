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

  it("sends the exact request body per issue and reports success as ok", async () => {
    mockUpdateIssueState.mockResolvedValue({});
    const res = await updateErrorIssueState.handler({ issueIds: ["i1"], state: "RESOLVED" }, config);
    expect(mockUpdateIssueState.mock.calls[0][0]).toEqual({
      issueId: "i1",
      body: { data: { type: "error_tracking_issue", id: "i1", attributes: { state: "RESOLVED" } } },
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toBe("i1 -> RESOLVED: ok");
  });

  it("isolates a failing issue from a succeeding one and sets isError on any failure", async () => {
    mockUpdateIssueState.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({});
    const res = await updateErrorIssueState.handler({ issueIds: ["i1", "i2"], state: "IGNORED" }, config);
    expect(mockUpdateIssueState).toHaveBeenCalledTimes(2);
    expect(res.isError).toBe(true);
    const lines = (res.content[0].text as string).split("\n");
    expect(lines).toContain("i1 -> IGNORED: Error in update_error_issue_state: boom");
    expect(lines).toContain("i2 -> IGNORED: ok");
  });

  it("reports a state mismatch and sets isError when the response echoes a different state", async () => {
    mockUpdateIssueState.mockResolvedValue({ data: { attributes: { state: "IGNORED" } } });
    const res = await updateErrorIssueState.handler({ issueIds: ["i1"], state: "RESOLVED" }, config);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toBe("i1 -> RESOLVED: mismatch: requested RESOLVED, Datadog returned IGNORED");
  });
});
