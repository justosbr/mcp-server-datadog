/**
 * Pull an HTTP status off a Datadog error. The SDK throws `ApiException` with a
 * numeric `code`; some callers/tests use `httpStatusCode`. Accept either.
 */
function statusOf(error: { httpStatusCode?: unknown; code?: unknown }): number | undefined {
  if (typeof error.httpStatusCode === "number") return error.httpStatusCode;
  if (typeof error.code === "number") return error.code;
  return undefined;
}

/**
 * Application Key authorization scope a tool's endpoint requires, so a 403 names
 * the scope to grant instead of leaving it to a documentation lookup. Only tools
 * whose scope is established belong here; the rest get the generic wording.
 */
const TOOL_SCOPE: Record<string, string> = {
  query_metrics: "timeseries_query",
};

/**
 * Render one entry of an API error body's `errors` array. Datadog serves plain
 * strings on some endpoints and JSON:API error objects (`status`/`title`/`detail`)
 * on others, including ones whose published schema declares strings.
 */
function errorEntryText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const fields = entry as Record<string, unknown>;
    const parts = [fields.title, fields.detail].filter(
      (part): part is string => typeof part === "string" && part.length > 0
    );
    if (parts.length > 0) return parts.join(": ");
    if (typeof fields.message === "string" && fields.message) return fields.message;
    return JSON.stringify(entry);
  }
  return String(entry);
}

/**
 * Prefer the API's response body message (`ApiException.body.errors`) over the
 * SDK's verbose `"HTTP-Code: …"` Error message.
 */
function messageOf(error: { message?: unknown; body?: any }): string {
  const body = error.body;
  if (body && typeof body === "object" && Array.isArray(body.errors) && body.errors.length) {
    return body.errors.map(errorEntryText).join(", ");
  }
  if (typeof body === "string" && body) return body;
  return typeof error.message === "string" && error.message ? error.message : "Unknown error";
}

export function formatError(error: unknown, toolName: string): string {
  if (error && typeof error === "object") {
    const statusCode = statusOf(error as any);
    if (statusCode !== undefined) {
    const message = messageOf(error as any);

    switch (statusCode) {
      case 403: {
        const scope = TOOL_SCOPE[toolName];
        return (
          `Permission denied for ${toolName}. ` +
          (scope
            ? `Your Application Key needs the \`${scope}\` authorization scope. `
            : `Your Application Key is missing the authorization scope this endpoint requires. `) +
          `An Application Key carries its own scopes, so a valid key is still refused without them: ` +
          `check the key's authorization scopes and permissions at https://app.datadoghq.com/organization-settings/application-keys. ` +
          `Details: ${message}`
        );
      }
      case 429:
        return (
          `Datadog API rate limit reached while calling ${toolName}. ` +
          `Try again in a moment.`
        );
      case 400:
        return `Invalid request to ${toolName}: ${message}`;
      default:
        return `Datadog API error (${statusCode}) in ${toolName}: ${message}`;
    }
    }
  }

  if (error instanceof Error) {
    return `Error in ${toolName}: ${error.message}`;
  }

  return `Unknown error in ${toolName}: ${String(error)}`;
}

export function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
