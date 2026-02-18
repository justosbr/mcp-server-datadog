import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  filterTags: z
    .string()
    .optional()
    .describe("Filter metrics by tag, e.g. 'env:prod'"),
  filterConfigured: z
    .boolean()
    .optional()
    .describe("Filter to only configured metrics"),
  pageSize: z.number().default(50).describe("Number of metrics per page"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const filterTags = params.filterTags as string | undefined;
  const filterConfigured = params.filterConfigured as boolean | undefined;
  const pageSize = (params.pageSize as number) ?? 50;
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v2.MetricsApi(config);
    const response = await api.listTagConfigurations({
      filterTags,
      filterConfigured,
      pageSize,
    });

    const metrics = response.data || [];

    if (metrics.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No metrics found matching the given filters.",
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
    const lines = metrics.map((m: any) => {
      const metricType = m.attributes?.metricType
        ? ` (type: ${m.attributes.metricType})`
        : "";
      return `- ${m.id}${metricType}`;
    });

    const text = `${metrics.length} metrics found:\n${lines.join("\n")}`;
    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "list_metrics"));
  }
}

export const listMetrics: ToolDefinition = {
  name: "list_metrics",
  description:
    "List available Datadog metrics, optionally filtered by tag. Returns metric names and types. Use get_metric_tags to discover available tags for a specific metric.",
  schema,
  handler,
};
