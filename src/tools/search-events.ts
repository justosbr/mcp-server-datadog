import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const JSON_BUDGET = 25_000;

const schema = {
  query: z
    .string()
    .default("*")
    .describe(
      "Datadog Events search query, e.g. 'tags:deploy service:payments' or 'source:datadog status:error'. Default: '*'"
    ),
  from: fromTimeSchema("15m"),
  to: toTimeSchema(),
  limit: z.coerce.number().int().positive().default(50).describe("Max events to return (capped at 200). Default: 50"),
  cursor: z.string().optional().describe("Pagination cursor from a previous search_events response."),
  format: FORMAT_SCHEMA,
};

function eventLine(e: any): string {
  const attrs = e?.attributes ?? {};
  const inner = attrs.attributes ?? {};
  const ts = attrs.timestamp instanceof Date ? attrs.timestamp.toISOString() : attrs.timestamp ?? "?";
  const source = inner.sourceTypeName ? ` (${inner.sourceTypeName})` : "";
  const status = inner.status ? ` [${inner.status}]` : "";
  const service = inner.service ? ` ${inner.service}` : "";
  const title = inner.title || attrs.message || "(no title)";
  return `- [${ts}]${status} ${title}${source}${service}`;
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const query = (params.query as string) ?? "*";
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const limit = Math.min((params.limit as number) ?? 50, 200);
  const cursor = params.cursor as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const api = new v2.EventsApi(config);
    const response = await api.searchEvents({
      body: {
        filter: { query, from: timeRange.from, to: timeRange.to },
        sort: "-timestamp",
        page: { limit, cursor },
      },
    });

    const data: any[] = response.data ?? [];
    if (data.length === 0) {
      return {
        content: [{ type: "text" as const, text: `No events found matching \`${query}\` in the given time range.` }],
      };
    }

    if (format === "json") {
      let text = JSON.stringify(response, null, 2);
      if (text.length > JSON_BUDGET) {
        text = text.slice(0, JSON_BUDGET) + `\n\n[Output truncated at ~${JSON_BUDGET / 1000}KB. Narrow the query or use format:summary.]`;
      }
      return { content: [{ type: "text" as const, text }] };
    }

    let text = `${data.length} events found (query: \`${query}\`):\n\n` + data.map(eventLine).join("\n");
    const after = response.meta?.page?.after;
    if (after) text += `\n\nNext page cursor: ${after}`;
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "search_events"));
  }
}

export const searchEvents: ToolDefinition = {
  name: "search_events",
  description:
    "Search the Datadog Events stream — deploys, monitor alerts, change/config events, and integration events. " +
    "Use this to answer 'what changed/happened around an incident' (e.g. a deploy right before an error spike), " +
    "which logs and metrics alone don't surface. Returns each event's time, title, source, status, and service.",
  schema,
  handler,
};
