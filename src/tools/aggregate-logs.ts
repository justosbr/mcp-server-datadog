import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const schema = {
  query: z.string().default("*").describe("Datadog log query"),
  from: z
    .string()
    .optional()
    .describe("Start time — ISO 8601 or relative. Default: 15m"),
  to: z
    .string()
    .optional()
    .describe("End time — ISO 8601 or relative. Default: now"),
  aggregation: z
    .enum(["count", "avg", "sum", "min", "max"])
    .default("count")
    .describe("Aggregation function"),
  metric: z
    .string()
    .optional()
    .describe(
      "Metric to aggregate (required for avg/sum/min/max, e.g. '@duration')"
    ),
  groupBy: z
    .string()
    .optional()
    .describe(
      "Field to group by, e.g. 'service', 'status', '@http.status_code'"
    ),
  groupLimit: z.number().default(10).describe("Max groups to return"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const query = (params.query as string) ?? "*";
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const aggregation = (params.aggregation as string) ?? "count";
  const metric = params.metric as string | undefined;
  const groupBy = params.groupBy as string | undefined;
  const groupLimit = (params.groupLimit as number) ?? 10;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);

    const api = new v2.LogsApi(config);
    const response = await api.aggregateLogs({
      body: {
        filter: {
          query,
          from: timeRange.from,
          to: timeRange.to,
        },
        compute: [
          {
            aggregation: aggregation as any,
            metric,
            type: "total" as any,
          },
        ],
        groupBy: groupBy
          ? [
              {
                facet: groupBy,
                limit: groupLimit,
                sort: {
                  aggregation: aggregation as any,
                  order: "desc" as any,
                },
              },
            ] as any
          : undefined,
      },
    });

    const buckets = response.data?.buckets;

    if (!buckets || buckets.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No data found for the given query and time range.",
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

    const metricLabel = metric || "count";

    if (groupBy) {
      const lines = buckets.map((bucket: any) => {
        const groupValue = bucket.by?.[groupBy] ?? "unknown";
        const value = bucket.computes?.["c0"]?.value ?? 0;
        return `- ${groupValue}: ${value}`;
      });

      const text =
        `Aggregation: ${aggregation}(${metricLabel}) grouped by ${groupBy}:\n` +
        lines.join("\n");

      return {
        content: [{ type: "text" as const, text }],
      };
    }

    // No groupBy — single result
    const value = (buckets[0]?.computes?.["c0"] as any)?.value ?? 0;
    const text = `Aggregation result: ${aggregation}(${metricLabel}) = ${value}`;

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "aggregate_logs"));
  }
}

export const aggregateLogs: ToolDefinition = {
  name: "aggregate_logs",
  description:
    "Run analytics and aggregations on Datadog logs. Supports count, avg, sum, min, max with optional grouping by fields like service, status, or custom facets.",
  schema,
  handler,
};
