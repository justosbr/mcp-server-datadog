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

### With 1Password CLI (single org)

Use the `op` CLI to inject credentials from 1Password instead of storing keys in plaintext:

```json
{
  "mcpServers": {
    "datadog": {
      "command": "/opt/homebrew/bin/op",
      "args": ["run", "--", "node", "/path/to/mcp-server-datadog/dist/index.js"],
      "env": {
        "DD_API_KEY": "op://Employee/mcp-datadog/api_key",
        "DD_APP_KEY": "op://Employee/mcp-datadog/app_key",
        "DD_SITE": "datadoghq.com"
      }
    }
  }
}
```

### With 1Password CLI (multi-org)

For multiple Datadog organizations, create a 1Password item per org (e.g. `mcp-datadog-prod`, `mcp-datadog-staging`), each with `api_key` and `app_key` fields:

```json
{
  "mcpServers": {
    "datadog": {
      "command": "/opt/homebrew/bin/op",
      "args": ["run", "--", "node", "/path/to/mcp-server-datadog/dist/index.js"],
      "env": {
        "DD_ORGS": "prod,staging",
        "DD_DEFAULT_ORG": "prod",
        "DD_PROD_API_KEY": "op://Employee/mcp-datadog-prod/api_key",
        "DD_PROD_APP_KEY": "op://Employee/mcp-datadog-prod/app_key",
        "DD_STAGING_API_KEY": "op://Employee/mcp-datadog-staging/api_key",
        "DD_STAGING_APP_KEY": "op://Employee/mcp-datadog-staging/app_key",
        "DD_SITE": "datadoghq.com"
      }
    }
  }
}
```

The `op run --` wrapper resolves `op://` references at runtime, so no secrets are stored on disk.

## Environment Variables

### Single-org mode

| Variable | Required | Description |
|---|---|---|
| `DD_API_KEY` | Yes | Datadog API key (or `op://` reference) |
| `DD_APP_KEY` | Yes | Datadog Application key, user-scoped (or `op://` reference) |
| `DD_SITE` | No | Datadog site (default: `datadoghq.com`) |

### Multi-org mode

| Variable | Required | Description |
|---|---|---|
| `DD_ORGS` | Yes | Comma-separated org names (e.g. `prod,staging`) |
| `DD_DEFAULT_ORG` | No | Default org when `org` param is omitted (defaults to first in `DD_ORGS`) |
| `DD_<ORG>_API_KEY` | Yes | API key per org. Org name uppercased, hyphens become underscores. |
| `DD_<ORG>_APP_KEY` | Yes | Application key per org. |
| `DD_SITE` | No | Datadog site, shared across all orgs (default: `datadoghq.com`) |

## Multi-Org Support

All tools accept an optional `org` parameter to specify which Datadog organization to query. If omitted, the default org (`DD_DEFAULT_ORG`) is used.

```
search_logs({ query: "service:api error", org: "staging" })
search_logs({ query: "service:api error" })  // uses default org
```

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

## Claude Code Tool Whitelist

All tools are read-only. To auto-approve them in Claude Code, add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "mcp__datadog__list_monitors",
      "mcp__datadog__get_monitor",
      "mcp__datadog__list_services",
      "mcp__datadog__list_metrics",
      "mcp__datadog__get_metric_tags",
      "mcp__datadog__query_metrics",
      "mcp__datadog__search_logs",
      "mcp__datadog__aggregate_logs",
      "mcp__datadog__get_log_field_values",
      "mcp__datadog__list_spans",
      "mcp__datadog__get_trace"
    ]
  }
}
```

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
