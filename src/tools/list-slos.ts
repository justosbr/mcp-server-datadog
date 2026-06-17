import { z } from "zod";
import { client, v1 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";

const JSON_BUDGET = 25_000;

const schema = {
  query: z
    .string()
    .optional()
    .describe("Filter SLOs by name (free-text search), e.g. 'checkout availability'."),
  tags: z
    .string()
    .optional()
    .describe("Filter by SLO tags query, e.g. 'team:payments'."),
  limit: z.coerce.number().int().positive().default(50).describe("Max SLOs to return (capped at 200). Default: 50"),
  format: FORMAT_SCHEMA,
};

function sloLine(slo: any): string {
  const thresholds = (slo.thresholds ?? [])
    .map((t: any) => `${t.targetDisplay ?? t.target}%/${t.timeframe}`)
    .join(", ");
  const tags = slo.tags?.length ? ` {${slo.tags.join(", ")}}` : "";
  return `- ${slo.name ?? "unnamed"} (${slo.type ?? "?"}) [${slo.id ?? "?"}] target ${thresholds || "?"}${tags}`;
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const query = params.query as string | undefined;
  const tags = params.tags as string | undefined;
  const limit = Math.min((params.limit as number) ?? 50, 200);
  const format = (params.format as string) ?? "summary";

  try {
    const api = new v1.ServiceLevelObjectivesApi(config);
    const response = await api.listSLOs({ query, tagsQuery: tags, limit });

    const data: any[] = response.data ?? [];
    if (data.length === 0) {
      return { content: [{ type: "text" as const, text: "No SLOs found matching the given filters." }] };
    }

    if (format === "json") {
      const kept: any[] = [];
      let size = 0;
      for (const slo of data) {
        const entrySize = JSON.stringify(slo).length;
        if (kept.length > 0 && size + entrySize > JSON_BUDGET) break;
        kept.push(slo);
        size += entrySize;
      }
      let text = JSON.stringify({ data: kept, metadata: response.metadata }, null, 2);
      if (kept.length < data.length) {
        text += `\n\n[Output truncated: showing ${kept.length} of ${data.length} SLOs (~${JSON_BUDGET / 1000}KB cap). Narrow with query/tags or use format:summary.]`;
      }
      return { content: [{ type: "text" as const, text }] };
    }

    const text = `${data.length} SLOs found:\n\n` + data.map(sloLine).join("\n");
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "list_slos"));
  }
}

export const listSlos: ToolDefinition = {
  name: "list_slos",
  description:
    "List Datadog Service Level Objectives (SLOs) with their type (metric/monitor), target thresholds per " +
    "timeframe, and tags. Use this to discover SLOs and their IDs; pass an ID to get_slo_status for the live " +
    "attainment and error budget.",
  schema,
  handler,
};
