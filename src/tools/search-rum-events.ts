import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";
import { budgetedJson } from "../utils/json-budget.js";

const schema = {
  query: z
    .string()
    .default("*")
    .describe(
      "RUM event search query, e.g. 'service:web-app AND @type:error'. Default: '*'"
    ),
  from: fromTimeSchema("15m"),
  to: toTimeSchema(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(50)
    .describe("Max events to return (1-1000). Default: 50"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous search_rum_events response"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const query = (params.query as string) ?? "*";
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const limit = (params.limit as number) ?? 50;
  const cursor = params.cursor as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);

    const api = new v2.RUMApi(config);
    const response = await api.searchRUMEvents({
      body: {
        filter: {
          query,
          from: timeRange.from,
          to: timeRange.to,
        },
        sort: "-timestamp",
        page: {
          limit,
          cursor,
        },
      },
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No RUM events found matching query \`${query}\` in the given time range.`,
          },
        ],
      };
    }

    if (format === "json") {
      // RUM events nest arbitrary attribute payloads; cap total output so a
      // single call can't flood the context.
      const text = budgetedJson(response.data, (kept, truncated) => ({
        data: kept,
        meta: response.meta,
        ...(truncated ? { truncated } : {}),
      }));
      return { content: [{ type: "text" as const, text }] };
    }

    // Summary format
    const eventLines = response.data.map((event: any) => {
      const attrs = event.attributes || {};
      const nested = attrs.attributes || {};
      const timestamp = attrs.timestamp || "unknown";
      const service = attrs.service || "unknown";
      const type = nested.type || "rum";
      const detail =
        nested.error?.message ||
        nested.view?.url ||
        nested.action?.target?.name ||
        nested.resource?.url ||
        "";
      const truncatedDetail =
        detail.length > 200 ? detail.slice(0, 200) + "..." : detail;
      return `- [${timestamp}] [${service}] [${type}] ${truncatedDetail}`;
    });

    let text =
      `${response.data.length} RUM events found (query: \`${query}\`, from: ${timeRange.from}, to: ${timeRange.to}):\n\n` +
      eventLines.join("\n");

    if (response.meta?.page?.after) {
      text += `\n\nNext page cursor: ${response.meta.page.after}`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "search_rum_events"));
  }
}

export const searchRumEvents: ToolDefinition = {
  name: "search_rum_events",
  description:
    "Search Datadog RUM (Real User Monitoring) events — views, actions, errors, resources, and long tasks from real browser/mobile sessions. Supports RUM query syntax, time range, and pagination. Filter by @session.id to follow a single user session. Returns timestamp, service, event type, and a key detail per event.",
  schema,
  handler,
};
