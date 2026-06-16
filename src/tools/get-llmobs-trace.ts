import { z } from "zod";
import { client } from "@datadog/datadog-api-client";
import { ToolDefinition, FORMAT_SCHEMA } from "./types.js";
import type { DatadogEnv } from "../config.js";
import { formatError, errorContent } from "../utils/errors.js";
import { parseTimeRange } from "../utils/time.js";
import { llmobsSearchSpans } from "../utils/llmobs-http.js";
import { llmobsSpanFields, formatLlmobsSpanLine } from "../utils/llmobs.js";

const TRACE_LIMIT = 1000;
const JSON_BUDGET = 25_000;

const schema = {
  traceId: z.string().describe("The LLM Observability trace ID to retrieve all spans for."),
  from: z
    .string()
    .optional()
    .describe(
      "Start of the search window — ISO 8601 or relative. Must cover when the " +
        "trace occurred. Default: 7d"
    ),
  to: z
    .string()
    .optional()
    .describe("End of the search window — ISO 8601 or relative. Default: now"),
  format: FORMAT_SCHEMA,
};

async function handler(
  params: Record<string, unknown>,
  _config: client.Configuration,
  env?: DatadogEnv
) {
  if (!env) {
    return errorContent(
      "get_llmobs_trace: no Datadog credentials resolved for this org."
    );
  }

  const traceId = params.traceId as string;
  const from = (params.from as string | undefined) ?? "7d";
  const to = params.to as string | undefined;
  const format = (params.format as string) ?? "summary";

  try {
    const timeRange = parseTimeRange(from, to);
    const response = await llmobsSearchSpans(env, {
      filter: { trace_id: traceId, from: timeRange.from, to: timeRange.to },
      page: { limit: TRACE_LIMIT },
      sort: "start_ns",
    });

    const data: any[] = response?.data ?? [];
    if (data.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text:
              `No LLM Observability spans found for trace ID ${traceId}. The trace ` +
              `may have expired or the ID may be incorrect — widen from/to if it is ` +
              `older than the search window.`,
          },
        ],
      };
    }

    // The API caps a single page at TRACE_LIMIT spans; a present cursor means
    // the trace has more spans than were fetched. Surface that rather than
    // silently returning a partial trace.
    const moreSpans = Boolean(response?.meta?.page?.after);
    const truncationNote = moreSpans
      ? `\n\n[Note: this trace has more than ${TRACE_LIMIT} spans; only the first ${data.length} are shown. Narrow from/to to inspect the rest.]`
      : "";

    if (format === "json") {
      const kept: any[] = [];
      let size = 0;
      for (const span of data) {
        const entrySize = JSON.stringify(span).length;
        if (kept.length > 0 && size + entrySize > JSON_BUDGET) break;
        kept.push(span);
        size += entrySize;
      }
      const out = { data: kept, meta: response.meta };
      let text = JSON.stringify(out, null, 2);
      if (kept.length < data.length) {
        text += `\n\n[Output truncated: showing ${kept.length} of ${data.length} spans (~${JSON_BUDGET / 1000}KB cap). Narrow the time window or use format:summary.]`;
      }
      text += truncationNote;
      return { content: [{ type: "text" as const, text }] };
    }

    const sorted = [...data].sort(
      (a, b) => (llmobsSpanFields(a).startNs ?? 0) - (llmobsSpanFields(b).startNs ?? 0)
    );
    const lines = sorted.map(formatLlmobsSpanLine);
    const text =
      `LLM trace ${traceId}: ${data.length} spans\n\n` + lines.join("\n") + truncationNote;

    return { content: [{ type: "text" as const, text }] };
  } catch (error) {
    return errorContent(formatError(error, "get_llmobs_trace"));
  }
}

export const getLlmobsTrace: ToolDefinition = {
  name: "get_llmobs_trace",
  description:
    "Get all LLM Observability spans for a specific trace ID, ordered chronologically, " +
    "showing the agent/LLM/tool call flow with per-span model, token counts, latency, and " +
    "status. Searches a bounded time window (default: last 7d) — widen from/to if the trace " +
    "is older or no spans are found. Queries a Datadog preview API (subject to change).",
  schema,
  handler,
};
