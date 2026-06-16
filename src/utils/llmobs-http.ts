import type { DatadogEnv } from "../config.js";

const LLMOBS_SEARCH_PATH = "/api/v2/llm-obs/v1/spans/events/search";
const REQUEST_TIMEOUT_MS = 30_000;

export interface LlmobsSearchAttributes {
  filter?: Record<string, unknown>;
  page?: { limit?: number; cursor?: string };
  sort?: string;
}

interface LlmobsHttpError extends Error {
  httpStatusCode: number;
}

/**
 * DD_SITE must be a bare site suffix (e.g. "datadoghq.com", "us3.datadoghq.com").
 * The base host is built as `https://api.{site}`, matching the SDK's own
 * `{subdomain}.{site}` server template; a full hostname would produce a wrong URL.
 */
function assertValidSite(site: string): void {
  if (/^https?:\/\//i.test(site) || site.startsWith("api.")) {
    throw new Error(
      `Invalid DD_SITE "${site}". Expected a bare site suffix like ` +
        `"datadoghq.com" or "us3.datadoghq.com", not a full hostname.`
    );
  }
}

export async function llmobsSearchSpans(
  env: DatadogEnv,
  attributes: LlmobsSearchAttributes
): Promise<any> {
  assertValidSite(env.site);
  const url = `https://api.${env.site}${LLMOBS_SEARCH_PATH}`;
  const body = JSON.stringify({ data: { type: "spans", attributes } });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "DD-API-KEY": env.apiKey,
      "DD-APPLICATION-KEY": env.appKey,
      "Content-Type": "application/vnd.api+json",
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(
      `LLM Observability API returned ${response.status}: ${text}`
    ) as LlmobsHttpError;
    error.httpStatusCode = response.status;
    throw error;
  }

  return response.json();
}
