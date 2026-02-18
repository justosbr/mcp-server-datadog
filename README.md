# mcp-server-datadog

An MCP (Model Context Protocol) server for Datadog that provides read-only access to Logs, APM traces, Metrics, Monitors, and the Service Catalog. Connect your AI assistant to Datadog and let it investigate service health, query metrics, search logs, and trace requests across your infrastructure.

## Prerequisites

- **Node.js 18+**
- **Datadog API Key** ([create one](https://app.datadoghq.com/organization-settings/api-keys))
- **Datadog Application Key** (user-scoped) ([create one](https://app.datadoghq.com/organization-settings/application-keys))

## Setup

```bash
git clone <repo-url>
cd mcp-server-datadog
npm install
npm run build
```

## MCP Client Configuration

Add the server to your MCP client configuration (Claude Desktop, Claude Code, etc.):

```json
{
  "mcpServers": {
    "datadog": {
      "command": "node",
      "args": ["/path/to/mcp-server-datadog/dist/index.js"],
      "env": {
        "DD_API_KEY": "your-api-key",
        "DD_APP_KEY": "your-app-key",
        "DD_SITE": "datadoghq.com"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DD_API_KEY` | Yes | Datadog API key |
| `DD_APP_KEY` | Yes | Datadog Application key (user-scoped) |
| `DD_SITE` | No | Datadog site (default: `datadoghq.com`) |

## Available Tools

| Tool | Description |
|---|---|
| `list_monitors` | List monitors with filtering by name, tags, or monitor tags |
| `get_monitor` | Get detailed information about a specific monitor by ID |
| `list_services` | List services from the Service Catalog with ownership and metadata |
| `list_metrics` | List available metrics, optionally filtered by tag |
| `get_metric_tags` | Get available tag keys for a specific metric |
| `query_metrics` | Query time-series metric data with aggregation and grouping |
| `search_logs` | Search logs with query filters, time range, and pagination |
| `aggregate_logs` | Run analytics on logs (count, avg, sum, min, max with grouping) |
| `get_log_field_values` | Discover possible values for a log field (service, status, etc.) |
| `list_spans` | Search APM spans with query filters and time range |
| `get_trace` | Get all spans for a trace ID showing the full request flow |

## Available Prompts

| Prompt | Description |
|---|---|
| `investigate_service` | Guided service health investigation workflow (monitors, errors, latency) |
| `dd_query_syntax` | Datadog query syntax reference card for logs, metrics, and spans |

## Required Datadog Permissions

Create a scoped Application Key with the following minimum permissions:

- `logs_read_data`
- `apm_read`
- `metrics_read`
- `monitors_read`
- `services_catalog_read` (or equivalent)

## Development

```bash
npm test            # run tests
npm run test:watch  # run tests in watch mode
npm run dev         # watch mode compilation
```

## License

ISC
