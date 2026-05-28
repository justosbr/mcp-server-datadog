import { z } from "zod";
import { client, v1 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  name: z
    .string()
    .optional()
    .describe("Filter monitors by name (substring match)"),
  tags: z
    .string()
    .optional()
    .describe("Comma-separated tags to filter by, e.g. 'env:prod,service:web'"),
  monitorTags: z
    .string()
    .optional()
    .describe("Comma-separated monitor tags to filter by"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const name = params.name as string | undefined;
  const tags = params.tags as string | undefined;
  const monitorTags = params.monitorTags as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v1.MonitorsApi(config);
    const monitors = await api.listMonitors({
      name,
      tags,
      monitorTags,
    });

    if (!monitors || monitors.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No monitors found matching the given filters.",
          },
        ],
      };
    }

    if (format === "json") {
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(monitors, null, 2) },
        ],
      };
    }

    // Summary format
    const lines = monitors.map((m: any) => {
      const tagsStr = m.tags && m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
      return `- [${m.overallState}] ${m.name} (ID: ${m.id}, type: ${m.type})${tagsStr}`;
    });

    const text = `${monitors.length} monitors found:\n${lines.join("\n")}`;
    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "list_monitors"));
  }
}

export const listMonitors: ToolDefinition = {
  name: "list_monitors",
  description:
    "List monitors from Datadog with optional filters by name, tags, or monitor tags.",
  schema,
  handler,
};
