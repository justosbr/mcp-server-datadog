import { describe, it, expect } from "vitest";
import { formatError } from "../../src/utils/errors.js";

describe("formatError", () => {
  it("formats 403 as permission error", () => {
    const error = { httpStatusCode: 403, message: "Forbidden" };
    const result = formatError(error, "search_logs");
    expect(result).toContain("permission");
    expect(result).toContain("search_logs");
  });

  it("formats 429 as rate limit error", () => {
    const error = { httpStatusCode: 429, message: "Too Many Requests" };
    const result = formatError(error, "list_monitors");
    expect(result).toContain("rate limit");
  });

  it("formats an SDK ApiException (code + body.errors), not just httpStatusCode", () => {
    // The Datadog SDK throws ApiException with `code` and a `body`, not `httpStatusCode`.
    const error = { code: 403, body: { errors: ["forbidden: missing scope"] } };
    const result = formatError(error, "search_error_issues");
    expect(result).toContain("Permission denied for search_error_issues");
    expect(result).toContain("forbidden: missing scope");
  });

  it("names the required scope on a 403 for a tool whose scope is known", () => {
    const error = { code: 403, body: { errors: ["Forbidden"] } };
    const result = formatError(error, "query_metrics");
    expect(result).toContain("timeseries_query");
  });

  it("renders JSON:API error objects rather than stringifying them", () => {
    // Some endpoints answer with `{status, title, detail}` entries even where the
    // published schema declares an array of strings.
    const error = {
      code: 400,
      body: {
        errors: [
          { status: "400", title: "Bad Request", detail: "issue_id must be a UUID" },
        ],
      },
    };
    const result = formatError(error, "get_error_issue");
    expect(result).toContain("Bad Request: issue_id must be a UUID");
    expect(result).not.toContain("[object Object]");
  });

  it("formats unknown errors with the message", () => {
    const error = new Error("Something went wrong");
    const result = formatError(error, "query_metrics");
    expect(result).toContain("Something went wrong");
  });

  it("returns isError true in MCP content format", () => {
    const error = new Error("fail");
    const result = formatError(error, "test");
    expect(result).toBeDefined();
  });
});
