import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const STATES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "IGNORED", "EXCLUDED"] as const;

const schema = {
  issueIds: z
    .array(z.string())
    .min(1)
    .max(25)
    .describe("Error Tracking issue IDs to update (from search_error_issues results). Each issue gets its own API call."),
  state: z
    .enum(STATES)
    .describe(
      "New state for every listed issue. Values are the Datadog API states, which differ from the UI labels: " +
        "OPEN (UI: 'For Review'), ACKNOWLEDGED (UI: 'Reviewed'), RESOLVED, IGNORED, EXCLUDED. " +
        "EXCLUDED stops error collection for the issue going forward, not just triage — use it deliberately, not as a default."
    ),
  format: FORMAT_SCHEMA,
};

interface IssueOutcome {
  issueId: string;
  state: string;
  ok: boolean;
  error?: string;
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const issueIds = params.issueIds as string[];
  const state = params.state as (typeof STATES)[number];
  const format = (params.format as string) ?? "summary";

  const api = new v2.ErrorTrackingApi(config);
  const outcomes: IssueOutcome[] = [];

  for (const issueId of issueIds) {
    try {
      await api.updateIssueState({
        issueId,
        body: {
          data: {
            type: "error_tracking_issue",
            id: issueId,
            attributes: { state },
          },
        },
      });
      outcomes.push({ issueId, state, ok: true });
    } catch (error) {
      outcomes.push({ issueId, state, ok: false, error: formatError(error, "update_error_issue_state") });
    }
  }

  const anySucceeded = outcomes.some((o) => o.ok);

  if (format === "json") {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(outcomes, null, 2) }],
      ...(anySucceeded ? {} : { isError: true }),
    };
  }

  const lines = outcomes.map((o) => `${o.issueId} -> ${o.state}: ${o.ok ? "ok" : o.error}`);
  const result = { content: [{ type: "text" as const, text: lines.join("\n") }] };
  return anySucceeded ? result : errorContent(lines.join("\n"));
}

export const updateErrorIssueState: ToolDefinition = {
  name: "update_error_issue_state",
  description:
    "Set the state of one or more Datadog Error Tracking issues. Issue IDs come from search_error_issues; up to 25 per call, " +
    "each issue is updated with its own API call (sequentially, one failure does not block the rest). " +
    "State values are the Datadog API states, which differ from the UI labels: OPEN (UI: 'For Review'), " +
    "ACKNOWLEDGED (UI: 'Reviewed'), RESOLVED, IGNORED, EXCLUDED. EXCLUDED stops error collection for that issue " +
    "going forward — it is not just a triage label, so only set it when that is actually intended. " +
    "The result lists every issue's outcome (ok, or the failure reason); the call only reports an error if every issue failed.",
  schema,
  handler,
};
