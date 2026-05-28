export const investigateServicePrompt = {
  name: "investigate_service",
  description:
    "Guided workflow to investigate a Datadog service's health. " +
    "Checks monitors, recent error logs, and key metrics.",
  arguments: [
    {
      name: "service",
      description:
        "The service name to investigate (use list_services to find exact names)",
      required: true,
    },
  ],
  getMessages(service: string) {
    return [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `Investigate the health of the "${service}" service in Datadog. Follow these steps:`,
            "",
            `1. **Monitors**: Call list_monitors with tags "service:${service}" to check alert statuses.`,
            `2. **Recent Errors**: Call search_logs with query "service:${service} AND status:error" and from "1h" to see recent errors.`,
            `3. **Error Rate**: Call aggregate_logs with query "service:${service}", groupBy "status", to see error vs info/warn distribution.`,
            `4. **Key Metrics**: Call query_metrics with query "avg:trace.http.request.duration{service:${service}}" from "1h" for latency.`,
            "",
            "Note: All tools accept an optional `org` parameter to specify which Datadog organization to query (use one of the configured org names). If omitted, the default org is used.",
            "",
            "Summarize findings: which monitors are alerting, what errors are occurring, and whether latency is elevated.",
          ].join("\n"),
        },
      },
    ];
  },
};
