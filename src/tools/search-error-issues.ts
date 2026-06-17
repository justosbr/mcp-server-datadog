import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const TRACKS = ["trace", "logs", "rum"] as const;
const JSON_BUDGET = 25_000;

const schema = {
  query: z
    .string()
    .default("*")
    .describe(
      "Error Tracking search query (event search syntax), e.g. 'service:payments @error.kind:TimeoutError'. Default: '*'"
    ),
  track: z
    .enum(TRACKS)
    .default("trace")
    .describe(
      "Telemetry source the issues are derived from: 'trace' (APM errors), 'logs', or 'rum'. Default: trace"
    ),
  from: fromTimeSchema("15m"),
  to: toTimeSchema(),
  format: FORMAT_SCHEMA,
};

function issueLine(result: any, issuesById: Map<string, any>): string {
  const metrics = result?.attributes ?? {};
  const issueId = result?.relationships?.issue?.data?.id;
  const a = (issueId && issuesById.get(issueId)) || {};
  const where = a.filePath || a.functionName ? ` @ ${a.filePath ?? "?"}:${a.functionName ?? "?"}` : "";
  const versions =
    a.firstSeenVersion || a.lastSeenVersion
      ? ` ver ${a.firstSeenVersion ?? "?"}→${a.lastSeenVersion ?? "?"}`
      : "";
  const counts = `count=${metrics.totalCount ?? "?"} users=${metrics.impactedUsers ?? "?"}`;
  return (
    `- [${a.state ?? "?"}] ${a.errorType ?? "unknown"}: ${a.errorMessage ?? ""} ` +
    `(${a.service ?? "?"}) ${counts}${versions}${where} id=${issueId ?? "?"}`
  );
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const query = (params.query as string) ?? "*";
  const track = (params.track as string) ?? "trace";
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const api = new v2.ErrorTrackingApi(config);
    const response = await api.searchIssues({
      body: {
        data: {
          type: "search_request",
          attributes: {
            query,
            track: track as any,
            from: Date.parse(timeRange.from),
            to: Date.parse(timeRange.to),
          },
        },
      },
      include: ["issue"],
    });

    const results: any[] = response.data ?? [];
    if (results.length === 0) {
      return {
        content: [
          { type: "text" as const, text: `No Error Tracking issues found matching \`${query}\` (track: ${track}).` },
        ],
      };
    }

    if (format === "json") {
      let text = JSON.stringify(response, null, 2);
      if (text.length > JSON_BUDGET) {
        text = text.slice(0, JSON_BUDGET) + `\n\n[Output truncated at ~${JSON_BUDGET / 1000}KB. Use format:summary or narrow the query.]`;
      }
      return { content: [{ type: "text" as const, text }] };
    }

    const issuesById = new Map<string, any>();
    for (const inc of (response.included as any[]) ?? []) {
      if (inc?.type === "issue" && inc?.id) issuesById.set(inc.id, inc.attributes ?? {});
    }

    const lines = results.map((r) => issueLine(r, issuesById));
    const text = `${results.length} Error Tracking issues (track: ${track}):\n\n` + lines.join("\n");
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "search_error_issues"));
  }
}

export const searchErrorIssues: ToolDefinition = {
  name: "search_error_issues",
  description:
    "Search Datadog Error Tracking issues — deduplicated error groups (by type + stack), not raw events. " +
    "Returns each issue's error type/message, affected service, occurrence count, impacted users, " +
    "first/last-seen release versions (regression signal), and state. Pick the telemetry source via `track` " +
    "(trace/logs/rum). Use this to triage what is broken; drill into raw events with search_logs or get_trace.",
  schema,
  handler,
};
