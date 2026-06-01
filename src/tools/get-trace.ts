import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";
import { spanFields, formatDurationMs } from "../utils/spans.js";

const schema = {
  traceId: z.string().describe("The trace ID to retrieve all spans for"),
  from: z
    .string()
    .optional()
    .describe(
      "Start of the search window — ISO 8601 or relative. Must cover when the trace occurred. Default: 7d"
    ),
  to: z
    .string()
    .optional()
    .describe("End of the search window — ISO 8601 or relative. Default: now"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const traceId = params.traceId as string;
  const from = (params.from as string | undefined) ?? "7d";
  const to = params.to as string | undefined;
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

    // Sort spans chronologically by start time (ISO timestamps sort lexically)
    const sortedSpans = [...response.data].sort((a: any, b: any) =>
      spanFields(a).start.localeCompare(spanFields(b).start)
    );

    // Calculate total trace duration
    const first = spanFields(sortedSpans[0]);
    const last = spanFields(sortedSpans[sortedSpans.length - 1]);
    const firstStart = new Date(first.start).getTime();
    const lastStart = new Date(last.start).getTime();
    const lastDurationMs = last.durationMs ?? 0;
    const totalDurationMs = Math.round(lastStart - firstStart + lastDurationMs);

    const spanLines = sortedSpans.map((span: any) => {
      const f = spanFields(span);
      return `- ${f.service}/${f.operationName} → ${f.resourceName} (${formatDurationMs(f.durationMs)}) [${f.status}]`;
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
