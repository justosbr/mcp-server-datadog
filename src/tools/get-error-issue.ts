import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  issueId: z
    .string()
    .describe("The Error Tracking issue ID (from search_error_issues results)."),
  format: FORMAT_SCHEMA,
};

function ts(ms: unknown): string {
  return typeof ms === "number" ? new Date(ms).toISOString() : "?";
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const issueId = params.issueId as string;
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v2.ErrorTrackingApi(config);
    const response = await api.getIssue({ issueId });
    const a: any = (response.data as any)?.attributes ?? {};

    if (format === "json") {
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
    }

    const lines = [
      `Error Tracking issue ${issueId}`,
      `  type:     ${a.errorType ?? "unknown"}`,
      `  message:  ${a.errorMessage ?? ""}`,
      `  service:  ${a.service ?? "?"}`,
      `  state:    ${a.state ?? "?"}${a.isCrash ? " (crash)" : ""}`,
      `  location: ${a.filePath ?? "?"}:${a.functionName ?? "?"}`,
      `  platform: ${a.platform ?? "?"}${a.languages?.length ? ` (${a.languages.join(", ")})` : ""}`,
      `  versions: first ${a.firstSeenVersion ?? "?"} → last ${a.lastSeenVersion ?? "?"}`,
      `  seen:     first ${ts(a.firstSeen)} → last ${ts(a.lastSeen)}`,
    ];
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  } catch (error) {
    return errorContent(formatError(error, "get_error_issue"));
  }
}

export const getErrorIssue: ToolDefinition = {
  name: "get_error_issue",
  description:
    "Get full detail for a single Datadog Error Tracking issue by ID — error type/message, service, state, " +
    "code location (file:function), platform/languages, and first/last-seen timestamps and release versions. " +
    "Issue IDs come from search_error_issues.",
  schema,
  handler,
};
