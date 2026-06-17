import { z } from "zod";
import { client, v1 } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";

const schema = {
  sloId: z.string().describe("The SLO ID to report status for (from list_slos results)."),
  from: fromTimeSchema("30d"),
  to: toTimeSchema(),
  format: FORMAT_SCHEMA,
};

function pct(v: unknown): string {
  return typeof v === "number" ? `${v.toFixed(3)}%` : "?";
}

async function handler(params: Record<string, unknown>, config: client.Configuration) {
  const sloId = params.sloId as string;
  const from = (params.from as string | undefined) ?? "30d";
  const to = params.to as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const fromTs = Math.floor(Date.parse(timeRange.from) / 1000);
    const toTs = Math.floor(Date.parse(timeRange.to) / 1000);

    const api = new v1.ServiceLevelObjectivesApi(config);
    const response = await api.getSLOHistory({ sloId, fromTs, toTs });
    const data: any = response.data ?? {};
    const overall: any = data.overall ?? {};

    if (format === "json") {
      return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
    }

    const budget = overall.errorBudgetRemaining
      ? Object.entries(overall.errorBudgetRemaining)
          .map(([k, v]) => `${k}: ${typeof v === "number" ? v.toFixed(2) : v}%`)
          .join(", ")
      : "n/a";

    const lines = [
      `SLO ${overall.name || sloId} (${data.type ?? "?"}) — window ${timeRange.from} → ${timeRange.to}`,
      `  SLI attained:          ${pct(overall.sliValue)}`,
      `  uptime:                ${pct(overall.uptime)}`,
      `  error budget remaining: ${budget}`,
    ];
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  } catch (error) {
    return errorContent(formatError(error, "get_slo_status"));
  }
}

export const getSloStatus: ToolDefinition = {
  name: "get_slo_status",
  description:
    "Get the live status of a Datadog SLO by ID over a time window — the attained SLI, uptime, and error " +
    "budget remaining per timeframe. Distinct from monitors (alert config): this answers 'are we within budget'. " +
    "SLO IDs come from list_slos. Default window: 30d.",
  schema,
  handler,
};
