/**
 * Normalized accessors for Datadog v2 Spans API attributes.
 *
 * The deserialized `SpansAttributes` model exposes some fields at the top level
 * (service, resourceName, traceId, startTimestamp) but keeps others nested:
 * operation_name and status live under `additionalProperties`, and the raw span
 * `duration` (nanoseconds) lives under `custom`. `startTimestamp` deserializes to
 * a `Date`, so it is normalized here to an ISO string that callers can sort and
 * render as text.
 */

export interface SpanFields {
  start: string;
  service: string;
  operationName: string;
  resourceName: string;
  status: string;
  traceId: string;
  durationMs: number | null;
}

export function spanFields(span: any): SpanFields {
  const attrs = span?.attributes ?? {};
  const extra = attrs.additionalProperties ?? {};
  const custom = attrs.custom ?? {};
  const durationNs = custom.duration;
  const startTimestamp = attrs.startTimestamp;
  const start =
    startTimestamp instanceof Date
      ? startTimestamp.toISOString()
      : startTimestamp || "unknown";

  return {
    start,
    service: attrs.service || "unknown",
    operationName: extra.operation_name || "unknown",
    resourceName: attrs.resourceName || "",
    status: extra.status || "unknown",
    traceId: attrs.traceId || "unknown",
    durationMs: typeof durationNs === "number" ? durationNs / 1_000_000 : null,
  };
}

/** Render a span duration in ms, preserving sub-millisecond precision. */
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return "? ms";
  if (ms < 1) return `${ms.toFixed(2)} ms`;
  return `${Math.round(ms)} ms`;
}
