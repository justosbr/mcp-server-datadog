import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const schema = {
  field: z
    .string()
    .describe(
      "Log field to discover values for, e.g. 'service', 'env', 'status', 'host'"
    ),
  query: z
    .string()
    .default("*")
    .describe("Optional query to scope the discovery"),
  from: fromTimeSchema("15m"),
  to: toTimeSchema(),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const field = params.field as string;
  const query = (params.query as string) ?? "*";
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
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
            aggregation: "count",
            type: "total" as any,
          },
        ],
        groupBy: [
          {
            facet: field,
            limit: 100,
          },
        ],
      },
    });

    const buckets = response.data?.buckets;

    if (!buckets || buckets.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No values found for field '${field}' in the given scope.`,
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
    const lines = buckets.map((bucket: any) => {
      const value = bucket.by?.[field] ?? "unknown";
      const count = bucket.computes?.["c0"]?.value ?? 0;
      return `- ${value} (count: ${count})`;
    });

    const text =
      `Values for field '${field}':\n` + lines.join("\n");

    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "get_log_field_values"));
  }
}

export const getLogFieldValues: ToolDefinition = {
  name: "get_log_field_values",
  description:
    "Discover possible values for a log field (e.g., service, env, status, host). Useful for understanding what filters are available before searching logs.",
  schema,
  handler,
};
