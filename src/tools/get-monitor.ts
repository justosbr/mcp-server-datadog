import { z } from "zod";
import { client, v1 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  monitorId: z.coerce.number().describe("The monitor ID to retrieve"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const monitorId = params.monitorId as number;
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v1.MonitorsApi(config);
    const monitor = await api.getMonitor({ monitorId });

    if (format === "json") {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(monitor, null, 2) },
        ],
      };
    }

    // Summary format
    const m = monitor as any;
    const tagsStr =
      m.tags && m.tags.length > 0 ? m.tags.join(", ") : "none";
    const lines = [
      `**${m.name}** (ID: ${m.id})`,
      `Status: ${m.overallState}`,
      `Type: ${m.type}`,
      `Query: \`${m.query}\``,
      `Message: ${m.message}`,
      `Tags: ${tagsStr}`,
      `Created: ${m.created}`,
      `Modified: ${m.modified}`,
    ];

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  } catch (error) {
    return errorContent(formatError(error, "get_monitor"));
  }
}

export const getMonitor: ToolDefinition = {
  name: "get_monitor",
  description:
    "Get detailed information about a specific Datadog monitor by its ID.",
  schema,
  handler,
};
