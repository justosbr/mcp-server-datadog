import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseTimeRange, resolveTime } from "../../src/utils/time.js";

describe("resolveTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-18T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes through ISO 8601 strings unchanged", () => {
    expect(resolveTime("2026-02-18T10:00:00Z")).toBe("2026-02-18T10:00:00Z");
  });

  it("converts '15m' to 15 minutes ago", () => {
    expect(resolveTime("15m")).toBe("2026-02-18T11:45:00.000Z");
  });

  it("converts '1h' to 1 hour ago", () => {
    expect(resolveTime("1h")).toBe("2026-02-18T11:00:00.000Z");
  });

  it("converts '7d' to 7 days ago", () => {
    expect(resolveTime("7d")).toBe("2026-02-11T12:00:00.000Z");
  });

  it("throws on invalid format", () => {
    expect(() => resolveTime("abc")).toThrow("Invalid time format");
  });
});

describe("parseTimeRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-18T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to last 15 minutes when no args", () => {
    const { from, to } = parseTimeRange();
    expect(from).toBe("2026-02-18T11:45:00.000Z");
    expect(to).toBe("2026-02-18T12:00:00.000Z");
  });

  it("uses provided from and to", () => {
    const { from, to } = parseTimeRange("1h", "15m");
    expect(from).toBe("2026-02-18T11:00:00.000Z");
    expect(to).toBe("2026-02-18T11:45:00.000Z");
  });
});
