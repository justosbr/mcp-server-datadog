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
 * Prefer the API's response body message (`ApiException.body.errors`) over the
 * SDK's verbose `"HTTP-Code: …"` Error message.
 */
function messageOf(error: { message?: unknown; body?: any }): string {
  const body = error.body;
  if (body && typeof body === "object" && Array.isArray(body.errors) && body.errors.length) {
    return body.errors.join(", ");
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
      case 403:
        return (
          `Permission denied for ${toolName}. ` +
          `Your Application Key may not have the required scope. ` +
          `Check your key's permissions at https://app.datadoghq.com/organization-settings/application-keys. ` +
          `Details: ${message}`
        );
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
