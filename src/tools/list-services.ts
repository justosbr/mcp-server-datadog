import { z } from "zod";
import { client, v2 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const schema = {
  pageSize: z.coerce.number().default(50).describe("Number of services per page"),
  pageNumber: z.coerce.number().default(0).describe("Page number (0-indexed)"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  config: client.Configuration
) {
  const pageSize = (params.pageSize as number) ?? 50;
  const pageNumber = (params.pageNumber as number) ?? 0;
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v2.ServiceDefinitionApi(config);
    const response = await api.listServiceDefinitions({
      pageSize,
      pageNumber,
    });

    const services = response.data;

    if (!services || services.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No services found in the Service Catalog.",
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
    const lines = services.map((s: any) => {
      const schema = s.attributes?.schema;
      const name = schema?.["dd-service"] ?? "unknown";
      const team = schema?.team ? ` (team: ${schema.team})` : "";
      const description = schema?.description
        ? ` — ${schema.description}`
        : "";
      return `- **${name}**${team}${description}`;
    });

    const text = `${services.length} services found:\n${lines.join("\n")}`;
    return {
      content: [{ type: "text" as const, text }],
    };
  } catch (error) {
    return errorContent(formatError(error, "list_services"));
  }
}

export const listServices: ToolDefinition = {
  name: "list_services",
  description:
    "List services from the Datadog Service Catalog. Use this to discover exact service names, team ownership, and links. Helpful for resolving user references like 'the payments service' to exact service names.",
  schema,
  handler,
};
