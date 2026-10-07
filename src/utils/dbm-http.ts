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
const MAX_ERROR_BODY_CHARS = 500;

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

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `Database Monitoring API returned ${response.status}: ${excerpt(text)}`
    ) as DbmHttpError;
    error.httpStatusCode = response.status;
    throw error;
  }

  let text: string;
  try {
    text = await response.text();
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `Database Monitoring API returned ${response.status} but reading the body failed: ${reason}`
    );
  }

  if (text.trim() === "") return [];

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Database Monitoring API returned ${response.status} with a non-JSON body: ${excerpt(text)}`
    );
  }

  // A `result` object without `events` is an empty match set (Datadog's own
  // sample client defaults the key to []); anything without a `result` object,
  // such as `{"errors": [...]}`, is an error.
  const result = parsed?.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(
      `Database Monitoring API returned ${response.status} without a result object: ${excerpt(text)}`
    );
  }
  if (result.events === undefined) return [];
  if (!Array.isArray(result.events)) {
    throw new Error(
      `Database Monitoring API returned ${response.status} with a non-array result.events: ${excerpt(text)}`
    );
  }
  return result.events;
}

function excerpt(text: string): string {
  return text.length > MAX_ERROR_BODY_CHARS ? text.slice(0, MAX_ERROR_BODY_CHARS) + "..." : text;
}

/**
 * Reject any parenthesis in the extra filters. The tool wraps them in its own
 * group, and a `)` (even one that looks quoted) could close that group early
 * and escape the `dbm_type` filter.
 */
function assertSafeExtraQuery(extra: string): void {
  if (/[()]/.test(extra)) {
    throw new Error(
      `Invalid query "${extra}": parentheses are not allowed in the extra filter; ` +
        `the tool already groups it, so combine terms with AND/OR/-.`
    );
  }
}

/**
 * Build the `databasequery` search string: the record type, an optional
 * `@db.query_signature` filter, and the caller's extra filters, which must not
 * contain parentheses and are wrapped in a group so a top-level OR in them
 * cannot escape the type filter.
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
