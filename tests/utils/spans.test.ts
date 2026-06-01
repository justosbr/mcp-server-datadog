import { describe, it, expect } from "vitest";
import { spanFields, formatDurationMs } from "../../src/utils/spans.js";

describe("spanFields", () => {
  it("normalizes a Date startTimestamp to an ISO string", () => {
    // The v2 Spans API client deserializes start_timestamp to a Date object,
    // not a string. Callers that sort lexically rely on start being a string.
    const span = {
      attributes: { startTimestamp: new Date("2026-02-18T00:05:00.000Z") },
    };

    const f = spanFields(span);

    expect(typeof f.start).toBe("string");
    expect(f.start).toBe("2026-02-18T00:05:00.000Z");
  });

  it("passes through a string startTimestamp unchanged", () => {
    const span = {
      attributes: { startTimestamp: "2026-02-18T00:05:00.000Z" },
    };

    expect(spanFields(span).start).toBe("2026-02-18T00:05:00.000Z");
  });

  it("falls back to 'unknown' when startTimestamp is missing", () => {
    expect(spanFields({ attributes: {} }).start).toBe("unknown");
  });
});

describe("formatDurationMs", () => {
  it("renders sub-millisecond durations with two decimals", () => {
    expect(formatDurationMs(0.16)).toBe("0.16 ms");
  });

  it("rounds durations of 1ms or more to whole milliseconds", () => {
    expect(formatDurationMs(56.4)).toBe("56 ms");
  });

  it("renders '? ms' when duration is unknown", () => {
    expect(formatDurationMs(null)).toBe("? ms");
  });
});
