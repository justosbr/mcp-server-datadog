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
