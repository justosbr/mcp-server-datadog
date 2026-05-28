import { z } from "zod";
import { client } from "@datadog/datadog-api-client";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (
    params: Record<string, unknown>,
    config: client.Configuration
  ) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export const FORMAT_SCHEMA = z
  .enum(["summary", "json"])
  .default("summary")
  .describe("Output format: 'summary' for concise LLM-friendly output, 'json' for full detail");

export function createOrgSchema(orgs: string[], defaultOrg: string) {
  return z
    .enum(orgs as [string, ...string[]])
    .default(defaultOrg)
    .describe("Datadog organization to query");
}
