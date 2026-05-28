import { z } from "zod";
import { client, v1 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const schema = {
  query: z.string().describe(
    "Datadog metric query, e.g. 'avg:system.cpu.user{env:prod} by {host}'. " +
    "Use the dd_query_syntax prompt for syntax help."
  ),
  from: z
    .string()
    .optional()
    .describe("Start time — ISO 8601 or relative (e.g., '1h', '7d'). Default: 15m"),
  to: z
    .string()
    .optional()
    .describe("End time — ISO 8601 or relative. Default: now"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const query = params.query as string;
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const unixFrom = Math.floor(new Date(timeRange.from).getTime() / 1000);
    const unixTo = Math.floor(new Date(timeRange.to).getTime() / 1000);

    const api = new v1.MetricsApi(config);
    const response = await api.queryMetrics({
      from: unixFrom,
      to: unixTo,
      query,
    });

    if (!response.series || response.series.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No data found for query \`${query}\` in the given time range.`,
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
    const seriesLines = response.series.map((s: any) => {
      const tags = s.tagSet && s.tagSet.length > 0 ? ` (${s.tagSet.join(", ")})` : "";
      const lastPoint = s.pointlist && s.pointlist.length > 0
        ? s.pointlist[s.pointlist.length - 1]
        : null;
      const lastValue = lastPoint ? lastPoint[1] : "N/A";
      return `- ${s.scope}${tags}: last value = ${lastValue}`;
    });

    const text =
      `Query: \`${query}\`\n` +
      `Time range: ${timeRange.from} — ${timeRange.to}\n` +
      `${response.series.length} series returned:\n\n` +
      seriesLines.join("\n");

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "query_metrics"));
  }
}

export const queryMetrics: ToolDefinition = {
  name: "query_metrics",
  description:
    "Query Datadog time-series metric data with aggregation and grouping. Use list_metrics to find metric names and get_metric_tags to find available tags.",
  schema,
  handler,
};
