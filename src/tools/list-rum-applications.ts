import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v2.RUMApi(config);
    const response = await api.getRUMApplications();

    const apps = response.data;

    if (!apps || apps.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No RUM applications found.",
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
    const lines = apps.map((app: any) => {
      const attrs = app.attributes || {};
      const name = attrs.name ?? "unknown";
      const applicationId = attrs.applicationId ?? attrs.application_id ?? "?";
      const type = attrs.type ? ` [${attrs.type}]` : "";
      return `- **${name}**${type} (application_id: ${applicationId})`;
    });

    const text = `${apps.length} RUM applications found:\n${lines.join("\n")}`;
    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "list_rum_applications"));
  }
}

export const listRumApplications: ToolDefinition = {
  name: "list_rum_applications",
  description:
    "List Datadog RUM (Real User Monitoring) applications — their names, application IDs, and types. Use this to discover which RUM apps exist and resolve their IDs before querying RUM events.",
  schema,
  handler,
};
