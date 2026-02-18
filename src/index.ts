#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { validateEnv, createDatadogConfig } from "./config.js";

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

// Import all prompts
import { investigateServicePrompt } from "./prompts/investigate-service.js";
import { ddQuerySyntaxPrompt } from "./prompts/dd-query-syntax.js";

// Validate env and create config
const env = validateEnv();
const config = createDatadogConfig(env);

// Create MCP server
const server = new McpServer({
  name: "mcp-server-datadog",
  version: "0.1.0",
});

// Register all 11 tools
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
];

for (const tool of tools) {
  server.tool(tool.name, tool.description, tool.schema, (params) =>
    tool.handler(params as Record<string, unknown>, config) as Promise<CallToolResult>
  );
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
console.error(`mcp-server-datadog connected (site: ${env.site})`);
