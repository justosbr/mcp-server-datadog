import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  metricName: z.string().describe("The metric name, e.g. 'system.cpu.user'"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const metricName = params.metricName as string;
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v2.MetricsApi(config);
    const response = await api.listTagsByMetricName({ metricName });

    const tags = (response.data as any)?.attributes?.tags || [];

    if (format === "json") {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(response, null, 2) },
        ],
      };
    }

    // Summary format
    if (tags.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No tags found for ${metricName}.`,
          },
        ],
      };
    }

    const lines = tags.map((tag: string) => `- ${tag}`);
    const text = `Tags for ${metricName}:\n${lines.join("\n")}`;
    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "get_metric_tags"));
  }
}

export const getMetricTags: ToolDefinition = {
  name: "get_metric_tags",
  description:
    "Get available tag keys for a specific Datadog metric. Use this to discover what you can filter or group by in query_metrics.",
  schema,
  handler,
};
