import type { DatadogEnv } from "../config.js";
import { normalizeSite } from "./llmobs-http.js";

/**
 * Database Monitoring query samples and explain plans are served by the logs
 * analytics list endpoint on the app host, querying the `databasequery` index.
 * Documented in https://docs.datadoghq.com/database_monitoring/guide/build_apps_with_dbm_api/
 * and absent from the OpenAPI spec, so the SDK has no method for it.
 */
const DBM_LIST_PATH = "/api/v1/logs-analytics/list?type=databasequery";
const REQUEST_TIMEOUT_MS = 30_000;

export interface DbmListRequest {
  query: string;
  fromMs: number;
  toMs: number;
  limit: number;
}

interface DbmHttpError extends Error {
  httpStatusCode: number;
}

/** Returns the `result.events` array of the response (empty when absent). */
export async function dbmListEvents(env: DatadogEnv, request: DbmListRequest): Promise<any[]> {
  const site = normalizeSite(env.site);
  const url = `https://app.${site}${DBM_LIST_PATH}`;
  const body = JSON.stringify({
    list: {
      indexes: ["databasequery"],
      limit: request.limit,
      search: { query: request.query },
      sorts: [{ time: { order: "desc" } }],
      time: { from: request.fromMs, to: request.toMs },
    },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "DD-API-KEY": env.apiKey,
      "DD-APPLICATION-KEY": env.appKey,
      "Content-Type": "application/json",
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const text = await response.text().catch(() => "");

  if (!response.ok) {
    const error = new Error(
      `Database Monitoring API returned ${response.status}: ${text}`
    ) as DbmHttpError;
    error.httpStatusCode = response.status;
    throw error;
  }

  if (text.trim() === "") return [];

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Database Monitoring API returned ${response.status} with a non-JSON body: ` +
        text.slice(0, 200)
    );
  }
  const events = parsed?.result?.events;
  if (!Array.isArray(events)) {
    throw new Error(
      `Database Monitoring API returned ${response.status} without result.events: ` +
        text.slice(0, 200)
    );
  }
  return events;
}

/**
 * Reject extra filters that could escape the parenthesized group: unbalanced
 * parentheses, or a `dbm_type:` term (the tool sets the record type itself).
 */
function assertSafeExtraQuery(extra: string): void {
  if (/\bdbm_type\s*:/i.test(extra)) {
    throw new Error(
      `Invalid query "${extra}": do not filter on dbm_type; the tool sets the record type.`
    );
  }
  let depth = 0;
  for (const ch of extra) {
    if (ch === "(") depth++;
    else if (ch === ")" && --depth < 0) break;
  }
  if (depth !== 0) {
    throw new Error(`Invalid query "${extra}": parentheses are unbalanced.`);
  }
}

/**
 * Build the `databasequery` search string: the record type, an optional
 * `@db.query_signature` filter, and the caller's extra filters, validated and
 * parenthesized so a top-level OR in them cannot escape the type filter.
 */
export function buildDbmQuery(
  dbmType: "activity" | "plan",
  querySignature?: string,
  extra?: string
): string {
  const parts = [`dbm_type:${dbmType}`];
  if (querySignature) parts.push(`@db.query_signature:${querySignature}`);
  if (extra && extra.trim()) {
    assertSafeExtraQuery(extra.trim());
    parts.push(`(${extra.trim()})`);
  }
  return parts.join(" ");
}

/** Convert a resolved ISO timestamp to epoch milliseconds, rejecting unparseable input. */
export function toEpochMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid time "${iso}": not a parseable ISO 8601 timestamp.`);
  }
  return ms;
}
