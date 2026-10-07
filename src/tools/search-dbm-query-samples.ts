import { z } from "zod";
import { client } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import type { DatadogEnv } from "../config.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";
import { buildDbmQuery, dbmListEvents, toEpochMs } from "../utils/dbm-http.js";
import { budgetedJson } from "../utils/json-budget.js";

const MAX_LIMIT = 200;

const schema = {
  query_signature: z
    .string()
    .regex(/^[0-9a-f]+$/i, "query_signature is a hex hash, e.g. '44c22fe3377aff9b'")
    .optional()
    .describe(
      "Restrict to one normalized query by its signature (hex hash, e.g. '44c22fe3377aff9b'). " +
        "Find signatures by grouping DBM query metrics (e.g. postgresql.queries.time) by query_signature."
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Extra Datadog search filters, e.g. 'service:payments env:prod', 'host:db-1', " +
        "'@db.instance:<instance>'. ANDed with the query-sample type filter."
    ),
  from: fromTimeSchema("15m"),
  to: toTimeSchema(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(25)
    .describe(`Max samples to return, newest first (capped at ${MAX_LIMIT}). Default: 25`),
  format: FORMAT_SCHEMA,
};

function formatSampleLine(record: any): string {
  const db = record?.event?.custom?.db ?? {};
  const signature = db.query_signature ?? "unknown";
  const wait = [db.wait_event_type, db.wait_event].filter(Boolean).join("/");
  const statement: string = typeof db.statement === "string" ? db.statement : "";
  const truncated = statement.length > 200 ? statement.slice(0, 200) + "..." : statement;
  const parts = [`[sig ${signature}]`];
  if (wait) parts.push(`[wait ${wait}]`);
  if (db.rows !== undefined && db.rows !== null) parts.push(`[rows ${db.rows}]`);
  return `- ${parts.join(" ")} ${truncated}`;
}

async function handler(
  params: Record<string, unknown>,
  _config: client.Configuration,
  env?: DatadogEnv
) {
  if (!env) {
    return errorContent("search_dbm_query_samples: no Datadog credentials resolved for this org.");
  }

  const querySignature = params.query_signature as string | undefined;
  const extra = params.query as string | undefined;
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const limit = Math.min((params.limit as number) ?? 25, MAX_LIMIT);
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const query = buildDbmQuery("activity", querySignature, extra);
    const events = await dbmListEvents(env, {
      query,
      fromMs: toEpochMs(timeRange.from),
      toMs: toEpochMs(timeRange.to),
      limit,
    });

    if (events.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No DBM query samples found matching \`${query}\` in the given time range.`,
          },
        ],
      };
    }

    if (format === "json") {
      const text = budgetedJson(events, (kept, truncated) => ({
        events: kept,
        ...(truncated ? { truncated } : {}),
      }));
      return { content: [{ type: "text" as const, text }] };
    }

    const text =
      `${events.length} DBM query samples found (query: \`${query}\`, from: ${timeRange.from}, to: ${timeRange.to}):\n\n` +
      events.map(formatSampleLine).join("\n");
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "search_dbm_query_samples"));
  }
}

export const searchDbmQuerySamples: ToolDefinition = {
  name: "search_dbm_query_samples",
  description:
    "Search Datadog Database Monitoring query samples: point-in-time snapshots of active " +
    "queries captured by the Agent. Filter by query signature, service, env, host, or " +
    "database instance. Returns normalized SQL, query signature, wait event, and rows. " +
    "Requires an unscoped Application Key (the endpoint needs the built_in_features scope). " +
    "For aggregated per-query latency/count, use query_metrics on postgresql.queries.* / mysql.queries.*.",
  schema,
  handler,
};
