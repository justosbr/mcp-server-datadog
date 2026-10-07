import { z } from "zod";
import { client } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import type { DatadogEnv } from "../config.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";
import { buildDbmQuery, dbmListEvents, toEpochMs } from "../utils/dbm-http.js";
import { budgetedJson } from "../utils/json-budget.js";

const MAX_LIMIT = 50;
const PLAN_PREVIEW_CHARS = 1500;

const schema = {
  query_signature: z
    .string()
    .regex(/^[0-9a-f]+$/i, "query_signature is a hex hash, e.g. '44c22fe3377aff9b'")
    .describe(
      "Signature of the normalized query whose plans to fetch (hex hash, e.g. '44c22fe3377aff9b'). " +
        "Get it from search_dbm_query_samples or by grouping DBM query metrics by query_signature."
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Extra Datadog search filters, e.g. 'env:prod', '@db.instance:<instance>'. " +
        "ANDed with the explain-plan type and signature filters."
    ),
  from: fromTimeSchema("4h"),
  to: toTimeSchema(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(5)
    .describe(`Max plan records to return, newest first (capped at ${MAX_LIMIT}). Default: 5`),
  format: FORMAT_SCHEMA,
};

function formatPlan(record: any): string {
  const db = record?.event?.custom?.db ?? {};
  const plan = db.plan ?? {};
  const statement: string = typeof db.statement === "string" ? db.statement : "";
  const definition =
    typeof plan.definition === "string"
      ? plan.definition
      : plan.definition !== undefined
        ? JSON.stringify(plan.definition)
        : "";
  const preview =
    definition.length > PLAN_PREVIEW_CHARS
      ? definition.slice(0, PLAN_PREVIEW_CHARS) + "... (truncated; use format:json for the full plan)"
      : definition;
  return [
    `- [plan ${plan.signature ?? "unknown"}] [cost ${plan.cost ?? "unknown"}]`,
    `  SQL: ${statement.length > 300 ? statement.slice(0, 300) + "..." : statement}`,
    `  Plan: ${preview || "(no plan definition)"}`,
  ].join("\n");
}

async function handler(
  params: Record<string, unknown>,
  _config: client.Configuration,
  env?: DatadogEnv
) {
  if (!env) {
    return errorContent("get_dbm_explain_plans: no Datadog credentials resolved for this org.");
  }

  const querySignature = params.query_signature as string;
  const extra = params.query as string | undefined;
  const from = (params.from as string | undefined) ?? "4h";
  const to = params.to as string | undefined;
  const limit = Math.min((params.limit as number) ?? 5, MAX_LIMIT);
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const query = buildDbmQuery("plan", querySignature, extra);
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
            text: `No DBM explain plans found matching \`${query}\` in the given time range.`,
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
      `${events.length} DBM explain plan records for query signature ${querySignature} ` +
      `(from: ${timeRange.from}, to: ${timeRange.to}):\n\n` +
      events.map(formatPlan).join("\n\n");
    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "get_dbm_explain_plans"));
  }
}

export const getDbmExplainPlans: ToolDefinition = {
  name: "get_dbm_explain_plans",
  description:
    "Get Datadog Database Monitoring explain plans for a normalized query (by query signature), " +
    "newest first. Returns plan signature, estimated cost, normalized SQL, and the plan " +
    "definition (PostgreSQL JSON explain output). Several plans can exist for one query when " +
    "the planner changed strategy. Requires an unscoped Application Key (the endpoint needs " +
    "the built_in_features scope).",
  schema,
  handler,
};
