import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const schema = {
  traceId: z.string().describe("The trace ID to retrieve all spans for"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const traceId = params.traceId as string;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange("7d");

    const api = new v2.SpansApi(config);
    const response = await api.listSpans({
      body: {
        data: {
          type: "search_request",
          attributes: {
            filter: {
              query: `trace_id:${traceId}`,
              from: timeRange.from,
              to: timeRange.to,
            },
            sort: "timestamp",
            page: {
              limit: 1000,
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
            text: `No spans found for trace ID ${traceId}. The trace may have expired or the ID may be incorrect.`,
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

    // Sort spans by start time
    const sortedSpans = [...response.data].sort((a: any, b: any) => {
      const startA = a.attributes?.start || "";
      const startB = b.attributes?.start || "";
      return startA.localeCompare(startB);
    });

    // Calculate total trace duration
    const firstAttrs = sortedSpans[0]?.attributes as any;
    const firstStart = new Date(firstAttrs?.start || 0).getTime();
    const lastSpan = sortedSpans[sortedSpans.length - 1]?.attributes as any;
    const lastStart = new Date(lastSpan?.start || 0).getTime();
    const lastDurationMs = lastSpan?.duration != null ? lastSpan.duration / 1_000_000 : 0;
    const totalDurationMs = Math.round(lastStart - firstStart + lastDurationMs);

    const spanLines = sortedSpans.map((span: any) => {
      const attrs = span.attributes || {};
      const service = attrs.service || "unknown";
      const operationName = attrs.operationName || "unknown";
      const resourceName = attrs.resourceName || "";
      const duration = attrs.duration != null ? Math.round(attrs.duration / 1_000_000) : 0;
      const status = attrs.status || "unknown";
      return `- ${service}/${operationName} → ${resourceName} (${duration} ms) [${status}]`;
    });

    const text =
      `Trace ${traceId}: ${response.data.length} spans\n` +
      `Total duration: ${totalDurationMs} ms\n\n` +
      spanLines.join("\n");

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "get_trace"));
  }
}

export const getTrace: ToolDefinition = {
  name: "get_trace",
  description:
    "Get all spans for a specific trace by trace ID. Shows the full request flow across services with timing for each span.",
  schema,
  handler,
};
