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
 * DD_SITE must be a bare site suffix (e.g. "datadoghq.com", "us3.datadoghq.com",
 * "datadoghq.eu", "ddog-gov.com"). The base host is built as `https://api.{site}`,
 * matching the SDK's own `{subdomain}.{site}` server template. Reject schemes,
 * paths, ports, whitespace, and api/app/www subdomains — anything that would
 * produce a wrong host when prefixed with "api.". Returns the normalized site.
 */
function normalizeSite(site: string): string {
  const trimmed = site.trim();
  const looksLikeBareSite =
    /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed) &&
    !/^(api|app|www)\./i.test(trimmed);
  if (!looksLikeBareSite) {
    throw new Error(
      `Invalid DD_SITE "${site}". Expected a bare site suffix like ` +
        `"datadoghq.com" or "us3.datadoghq.com", not a full hostname.`
    );
  }
  return trimmed;
}

export async function llmobsSearchSpans(
  env: DatadogEnv,
  attributes: LlmobsSearchAttributes
): Promise<any> {
  const site = normalizeSite(env.site);
  const url = `https://api.${site}${LLMOBS_SEARCH_PATH}`;
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

  const text = await response.text().catch(() => "");

  if (!response.ok) {
    const error = new Error(
      `LLM Observability API returned ${response.status}: ${text}`
    ) as LlmobsHttpError;
    error.httpStatusCode = response.status;
    throw error;
  }

  // A 2xx with an empty body (e.g. 204) is treated as no results.
  if (text.trim() === "") {
    return { data: [], meta: {} };
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `LLM Observability API returned ${response.status} with a non-JSON body: ` +
        text.slice(0, 200)
    );
  }
}
