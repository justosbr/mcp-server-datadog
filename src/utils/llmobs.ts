/**
 * Normalized accessors for Datadog LLM Observability span attributes
 * (LLMObsSpanData.attributes). `start_ns` is nanoseconds since the Unix epoch
 * and `duration` is nanoseconds; both are normalized for text rendering at
 * millisecond granularity. Token counts have no typed field — they live in the
 * free-form `metrics` map under conventional keys, so they are read defensively
 * and omitted when absent.
 */
import { formatDurationMs } from "./spans.js";

export interface LlmobsSpanFields {
  start: string;
  startNs: number | null;
  name: string;
  spanKind: string;
  mlApp: string;
  model: string | null;
  status: string;
  traceId: string;
  spanId: string;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

export function llmobsSpanFields(span: any): LlmobsSpanFields {
  const attrs = span?.attributes ?? {};
  const metrics = attrs.metrics ?? {};
  const startNs = typeof attrs.start_ns === "number" ? attrs.start_ns : null;
  const durationNs = typeof attrs.duration === "number" ? attrs.duration : null;

  return {
    start: startNs != null ? new Date(startNs / 1_000_000).toISOString() : "unknown",
    startNs,
    name: attrs.name || "unknown",
    spanKind: attrs.span_kind || "unknown",
    mlApp: attrs.ml_app || "unknown",
    model: attrs.model_name || null,
    status: attrs.status || "unknown",
    traceId: attrs.trace_id || "unknown",
    spanId: attrs.span_id || "unknown",
    durationMs: durationNs != null ? durationNs / 1_000_000 : null,
    inputTokens: typeof metrics.input_tokens === "number" ? metrics.input_tokens : null,
    outputTokens: typeof metrics.output_tokens === "number" ? metrics.output_tokens : null,
  };
}

export function formatLlmobsSpanLine(span: any): string {
  const f = llmobsSpanFields(span);
  const model = f.model ? ` ${f.model}` : "";
  const tokens =
    f.inputTokens != null || f.outputTokens != null
      ? ` tok=${f.inputTokens ?? "?"}/${f.outputTokens ?? "?"}`
      : "";
  return (
    `- [${f.start}] ${f.mlApp} ${f.name} (${f.spanKind})${model}${tokens} ` +
    `${formatDurationMs(f.durationMs)} [${f.status}] trace_id=${f.traceId}`
  );
}
