export const ddQuerySyntaxPrompt = {
  name: "dd_query_syntax",
  description:
    "Reference card for Datadog query syntax. Use this when you need help " +
    "constructing log, metric, or span queries.",
  arguments: [],
  getMessages() {
    return [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            "# Datadog Query Syntax Reference",
            "",
            "## Log Query Syntax",
            "- Filter by field: `service:payments`",
            "- AND: `service:payments AND status:error`",
            "- OR: `service:payments OR service:auth`",
            "- NOT: `-status:info`",
            "- Wildcard: `service:pay*`",
            "- Numeric range: `@duration:>1000`",
            "- Facets (custom): `@http.status_code:500`",
            '- Free text: `"connection timeout"`',
            "",
            "## Metric Query Syntax",
            "- Basic: `avg:system.cpu.user{*}`",
            "- Filtered: `avg:system.cpu.user{env:prod,service:payments}`",
            "- Grouped: `avg:system.cpu.user{env:prod} by {host}`",
            "- Aggregations: avg, sum, min, max, count",
            "- Rollup: `avg:system.cpu.user{*}.rollup(avg, 60)`",
            "",
            "## Span Query Syntax",
            "- By service: `service:payments`",
            "- By operation: `operation_name:http.request`",
            '- By resource: `resource_name:"/api/v1/users"`',
            "- By status: `status:error`",
            "- By duration: `@duration:>1000000000` (nanoseconds)",
            "",
            "## Common Fields",
            "- Logs: service, source, status, host, @http.method, @http.status_code, @http.url",
            "- Spans: service, operation_name, resource_name, status, @duration, @http.status_code",
            "",
            "## Time Ranges (for tool parameters)",
            "- Relative: '15m', '1h', '6h', '1d', '7d'",
            "- Absolute: ISO 8601, e.g., '2026-02-18T10:00:00Z'",
          ].join("\n"),
        },
      },
    ];
  },
};
