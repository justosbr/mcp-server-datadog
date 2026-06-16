import { z } from "zod";
import { client } from "@datadog/datadog-api-client";
import type { DatadogEnv } from "../config.js";

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodRawShape;
  handler: (
    params: Record<string, unknown>,
    config: client.Configuration,
    env?: DatadogEnv
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

const TIME_FORMAT_HINT =
  "ISO 8601 (e.g. '2026-06-16T10:00:00Z') or relative ('15m', '2h', '7d')";

/**
 * Shared `from` time-window parameter. `defaultLabel` documents the default the
 * tool's handler applies when omitted (e.g. "15m", "7d"); `extra` appends
 * tool-specific guidance. The default value itself is applied at call time, not
 * here, so the parameter stays optional.
 */
export function fromTimeSchema(defaultLabel: string, extra = "") {
  const suffix = extra ? ` ${extra}` : "";
  return z
    .string()
    .optional()
    .describe(`Start time — ${TIME_FORMAT_HINT}. Default: ${defaultLabel}.${suffix}`);
}

/** Shared `to` time-window parameter; defaults to "now" when omitted. */
export function toTimeSchema(defaultLabel = "now") {
  return z
    .string()
    .optional()
    .describe(`End time — ${TIME_FORMAT_HINT}. Default: ${defaultLabel}.`);
}

export function createOrgSchema(orgs: string[], defaultOrg: string) {
  return z
    .enum(orgs as [string, ...string[]])
    .default(defaultOrg)
    .describe("Datadog organization to query");
}
