#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { validateMultiOrgEnv } from "./config.js";
import { createOrgSchema } from "./tools/types.js";

// Import all tools
import { listMonitors } from "./tools/list-monitors.js";
import { getMonitor } from "./tools/get-monitor.js";
import { listServices } from "./tools/list-services.js";
import { listMetrics } from "./tools/list-metrics.js";
import { getMetricTags } from "./tools/get-metric-tags.js";
import { queryMetrics } from "./tools/query-metrics.js";
import { searchLogs } from "./tools/search-logs.js";
import { aggregateLogs } from "./tools/aggregate-logs.js";
import { getLogFieldValues } from "./tools/get-log-field-values.js";
import { listSpans } from "./tools/list-spans.js";
import { getTrace } from "./tools/get-trace.js";
import { searchLlmobsSpans } from "./tools/search-llmobs-spans.js";
import { getLlmobsTrace } from "./tools/get-llmobs-trace.js";
import { searchEvents } from "./tools/search-events.js";
import { searchErrorIssues } from "./tools/search-error-issues.js";
import { getErrorIssue } from "./tools/get-error-issue.js";
import { listSlos } from "./tools/list-slos.js";
import { getSloStatus } from "./tools/get-slo-status.js";

// Import all prompts
import { investigateServicePrompt } from "./prompts/investigate-service.js";
import { ddQuerySyntaxPrompt } from "./prompts/dd-query-syntax.js";

// Validate env and create org configs
const multiOrg = validateMultiOrgEnv();
const orgSchema = createOrgSchema(multiOrg.orgs, multiOrg.defaultOrg);

// Create MCP server
const server = new McpServer({
  name: "mcp-server-datadog",
  version: "0.1.0",
});

// Register all 18 tools
const tools = [
  listMonitors,
  getMonitor,
  listServices,
  listMetrics,
  getMetricTags,
  queryMetrics,
  searchLogs,
  aggregateLogs,
  getLogFieldValues,
  listSpans,
  getTrace,
  searchLlmobsSpans,
  getLlmobsTrace,
  searchEvents,
  searchErrorIssues,
  getErrorIssue,
  listSlos,
  getSloStatus,
];

for (const tool of tools) {
  const schemaWithOrg = { ...tool.schema, org: orgSchema };
  server.tool(tool.name, tool.description, schemaWithOrg, (params) => {
    const orgName = (params.org as string) ?? multiOrg.defaultOrg;
    const config = multiOrg.configs.get(orgName);
    if (!config) {
      return Promise.resolve({
        content: [{ type: "text" as const, text: `Unknown org: ${orgName}` }],
        isError: true,
      });
    }
    return tool.handler(
      params as Record<string, unknown>,
      config,
      multiOrg.orgEnvs.get(orgName)
    ) as Promise<CallToolResult>;
  });
}

// Register prompts

// investigate_service — takes a "service" argument
server.prompt(
  investigateServicePrompt.name,
  investigateServicePrompt.description,
  { service: z.string().describe("The service name to investigate (use list_services to find exact names)") },
  ({ service }) => ({
    messages: investigateServicePrompt.getMessages(service),
  })
);

// dd_query_syntax — no arguments
server.prompt(
  ddQuerySyntaxPrompt.name,
  ddQuerySyntaxPrompt.description,
  () => ({
    messages: ddQuerySyntaxPrompt.getMessages(),
  })
);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
const orgList = multiOrg.orgs.join(", ");
console.error(`mcp-server-datadog connected (orgs: ${orgList}, default: ${multiOrg.defaultOrg})`);
