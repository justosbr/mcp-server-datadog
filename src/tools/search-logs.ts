import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const schema = {
  query: z
    .string()
    .default("*")
    .describe(
      "Datadog log query, e.g. 'service:payments AND status:error'. Default: '*'"
    ),
  from: z
    .string()
    .optional()
    .describe(
      "Start time — ISO 8601 or relative (e.g., '15m', '1h'). Default: 15m"
    ),
  to: z
    .string()
    .optional()
    .describe("End time — ISO 8601 or relative. Default: now"),
  limit: z
    .number()
    .default(50)
    .describe("Max logs to return (1-1000). Default: 50"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous search_logs response"),
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

    const api = new v2.LogsApi(config);
    const response = await api.listLogs({
      body: {
        filter: {
          query,
          from: timeRange.from,
          to: timeRange.to,
        },
        sort: "timestamp",
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
            text: `No logs found matching query \`${query}\` in the given time range.`,
          },
        ],
      };
    }

    if (format === "json") {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    // Summary format
    const logLines = response.data.map((log: any) => {
      const attrs = log.attributes || {};
      const timestamp = attrs.timestamp || "unknown";
      const service = attrs.service || "unknown";
      const status = attrs.status || "unknown";
      const message = attrs.message || "";
      const truncatedMessage =
        message.length > 200 ? message.slice(0, 200) + "..." : message;
      return `- [${timestamp}] [${service}] [${status}] ${truncatedMessage}`;
    });

    let text =
      `${response.data.length} logs found (query: \`${query}\`, from: ${timeRange.from}, to: ${timeRange.to}):\n\n` +
      logLines.join("\n");

    if (response.meta?.page?.after) {
      text += `\n\nNext page cursor: ${response.meta.page.after}`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "search_logs"));
  }
}

export const searchLogs: ToolDefinition = {
  name: "search_logs",
  description:
    "Search Datadog logs with query filters, time range, and pagination. Supports Datadog log query syntax (use dd_query_syntax prompt for help). Returns log entries with timestamps, service, status, and messages.",
  schema,
  handler,
};
