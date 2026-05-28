export function formatError(error: unknown, toolName: string): string {
  if (error && typeof error === "object" && "httpStatusCode" in error) {
    const statusCode = (error as { httpStatusCode: number }).httpStatusCode;
    const message = (error as { message?: string }).message || "Unknown error";

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
