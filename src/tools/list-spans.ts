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
      "Datadog span query, e.g. 'service:payments AND operation_name:http.request AND status:error'"
    ),
  from: z
    .string()
    .optional()
    .describe("Start time — ISO 8601 or relative. Default: 15m"),
  to: z
    .string()
    .optional()
    .describe("End time — ISO 8601 or relative. Default: now"),
  limit: z.coerce.number().default(50).describe("Max spans to return. Default: 50"),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous list_spans response"),
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

    const api = new v2.SpansApi(config);
    const response = await api.listSpans({
      body: {
        data: {
          type: "search_request",
          attributes: {
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
        },
      },
    });

    if (!response.data || response.data.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No spans found matching query \`${query}\` in the given time range.`,
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
    const spanLines = response.data.map((span: any) => {
      const attrs = span.attributes || {};
      const start = attrs.start || "unknown";
      const service = attrs.service || "unknown";
      const operationName = attrs.operationName || "unknown";
      const resourceName = attrs.resourceName || "";
      const duration = attrs.duration != null ? Math.round(attrs.duration / 1_000_000) : 0;
      const status = attrs.status || "unknown";
      const traceId = attrs.traceId || "unknown";
      return `- [${start}] ${service}/${operationName} ${resourceName} (${duration} ms) [${status}] trace_id=${traceId}`;
    });

    let text =
      `${response.data.length} spans found (query: \`${query}\`):\n\n` +
      spanLines.join("\n");

    if (response.meta?.page?.after) {
      text += `\n\nNext page cursor: ${response.meta.page.after}`;
    }

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "list_spans"));
  }
}

export const listSpans: ToolDefinition = {
  name: "list_spans",
  description:
    "Search Datadog APM spans with query filters, time range, and pagination. Returns span details including service, operation, resource, duration, and trace IDs.",
  schema,
  handler,
};
