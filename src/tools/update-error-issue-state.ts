import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const STATES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "IGNORED", "EXCLUDED"] as const;

const schema = {
  issueIds: z
    .array(z.string().min(1))
    .min(1)
    .max(25)
    .describe(
      "Error Tracking issue IDs to update (from search_error_issues results). Each issue gets its own API call. " +
        "Duplicate IDs are collapsed to a single call, first occurrence kept."
    ),
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
  status: "ok" | "mismatch" | "error";
  message?: string;
}

function extractReturnedState(response: unknown): string | undefined {
  const state = (response as any)?.data?.attributes?.state;
  return typeof state === "string" ? state : undefined;
}

function dedupe(ids: string[]): { issueIds: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const issueIds: string[] = [];
  const duplicates: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.push(id);
    } else {
      seen.add(id);
      issueIds.push(id);
    }
  }
  return { issueIds, duplicates };
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const { issueIds, duplicates } = dedupe(params.issueIds as string[]);
  const state = params.state as (typeof STATES)[number];
  const format = (params.format as string) ?? "summary";

  const outcomes: IssueOutcome[] = [];

  try {
    const api = new v2.ErrorTrackingApi(config);

    for (const issueId of issueIds) {
      try {
        const response = await api.updateIssueState({
          issueId,
          body: {
            data: {
              type: "error_tracking_issue",
              id: issueId,
              attributes: { state },
            },
          },
        });
        const returnedState = extractReturnedState(response);
        if (returnedState !== undefined && returnedState !== state) {
          outcomes.push({
            issueId,
            state,
            status: "mismatch",
            message: `mismatch: requested ${state}, Datadog returned ${returnedState}`,
          });
        } else {
          outcomes.push({ issueId, state, status: "ok" });
        }
      } catch (error) {
        outcomes.push({
          issueId,
          state,
          status: "error",
          message: formatError(error, "update_error_issue_state"),
        });
      }
    }
  } catch (error) {
    return errorContent(formatError(error, "update_error_issue_state"));
  }

  const isError = outcomes.some((o) => o.status !== "ok");
  const duplicateNote = duplicates.length
    ? `Dropped ${duplicates.length} duplicate issue id(s), first occurrence kept: ${duplicates.join(", ")}`
    : undefined;

  if (format === "json") {
    const payload = duplicateNote ? { outcomes, duplicatesDropped: duplicates } : { outcomes };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      ...(isError ? { isError: true } : {}),
    };
  }

  const lines = outcomes.map((o) => `${o.issueId} -> ${o.state}: ${o.status === "ok" ? "ok" : o.message}`);
  if (duplicateNote) lines.unshift(duplicateNote);
  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
    ...(isError ? { isError: true } : {}),
  };
}

export const updateErrorIssueState: ToolDefinition = {
  name: "update_error_issue_state",
  description:
    "Set the state of one or more Datadog Error Tracking issues. Issue IDs come from search_error_issues; up to 25 per call, " +
    "duplicate IDs are collapsed to one call each, and each issue is updated with its own API call (sequentially, one " +
    "failure does not block the rest). State values are the Datadog API states, which differ from the UI labels: " +
    "OPEN (UI: 'For Review'), ACKNOWLEDGED (UI: 'Reviewed'), RESOLVED, IGNORED, EXCLUDED. EXCLUDED stops error " +
    "collection for that issue going forward — it is not just a triage label, so only set it when that is actually " +
    "intended. The result lists every issue's outcome (ok, a state mismatch if Datadog echoed back a different state " +
    "than requested, or the failure reason); the call reports an error if any issue did not end up in the requested state.",
  schema,
  handler,
};
