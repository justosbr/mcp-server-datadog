import { z } from "zod";
import { client } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA, fromTimeSchema, toTimeSchema } from "./types.js";
import type { DatadogEnv } from "../config.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";
import { llmobsSearchSpans } from "../utils/llmobs-http.js";
import { formatLlmobsSpanLine } from "../utils/llmobs.js";
import { budgetedJson } from "../utils/json-budget.js";

const SPAN_KINDS = [
  "agent", "workflow", "llm", "tool", "task", "embedding", "retrieval",
] as const;
const MAX_LIMIT = 200;

const schema = {
  query: z
    .string()
    .optional()
    .describe(
      "LLM Observability query, e.g. '@session_id:abc123'. When set, the " +
        "structured filters (ml_app, span_kind, tags) are ignored by the API."
    ),
  ml_app: z
    .string()
    .optional()
    .describe("Filter by ML app name — the instrumented LLM application (e.g. 'my-chatbot')."),
  span_kind: z.enum(SPAN_KINDS).optional().describe("Filter by span kind."),
  tags: z
    .record(z.string())
    .optional()
    .describe('Tag filters as key/value pairs, e.g. {"env":"prod"}.'),
  from: fromTimeSchema("15m"),
  to: toTimeSchema(),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .default(50)
    .describe(`Max spans to return (capped at ${MAX_LIMIT}). Default: 50`),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a previous search_llmobs_spans response."),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  _config: client.Configuration,
  env?: DatadogEnv
) {
  if (!env) {
    return errorContent(
      "search_llmobs_spans: no Datadog credentials resolved for this org."
    );
  }

  const query = params.query as string | undefined;
  const mlApp = params.ml_app as string | undefined;
  const spanKind = params.span_kind as string | undefined;
  const tags = params.tags as Record<string, string> | undefined;
  const from = params.from as string | undefined;
  const to = params.to as string | undefined;
  const limit = Math.min((params.limit as number) ?? 50, MAX_LIMIT);
  const cursor = params.cursor as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const filter: Record<string, unknown> = { from: timeRange.from, to: timeRange.to };
    if (query) filter.query = query;
    if (mlApp) filter.ml_app = mlApp;
    if (spanKind) filter.span_kind = spanKind;
    if (tags) filter.tags = tags;

    const response = await llmobsSearchSpans(env, {
      filter,
      page: { limit, cursor },
      sort: "-start_ns",
    });

    const data: any[] = response?.data ?? [];
    if (data.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No LLM Observability spans found in the given time range.",
          },
        ],
      };
    }

    if (format === "json") {
      const text = budgetedJson(data, (kept, truncated) => ({
        data: kept,
        meta: response.meta,
        ...(truncated ? { truncated } : {}),
      }));
      return { content: [{ type: "text" as const, text }] };
    }

    const lines = data.map(formatLlmobsSpanLine);
    let text = `${data.length} LLM Observability spans found:\n\n` + lines.join("\n");
    const after = response?.meta?.page?.after;
    if (after) text += `\n\nNext page cursor: ${after}`;

    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "search_llmobs_spans"));
  }
}

export const searchLlmobsSpans: ToolDefinition = {
  name: "search_llmobs_spans",
  description:
    "Search Datadog LLM Observability spans by ML app, span kind, tags, free-text " +
    "query, and time range. Returns span summaries (name, kind, model, token counts, " +
    "latency, status, trace ID) with cursor pagination. Queries a Datadog preview API " +
    "(subject to change).",
  schema,
  handler,
};
