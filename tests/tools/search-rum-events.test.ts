import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchRUMEvents } = vi.hoisted(() => {
  const mockSearchRUMEvents = vi.fn();
  return { mockSearchRUMEvents };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      RUMApi: vi.fn().mockImplementation(function () {
        return { searchRUMEvents: mockSearchRUMEvents };
      }),
    },
  };
});

vi.mock("../../src/utils/time.js", () => {
  return {
    parseTimeRange: vi.fn().mockReturnValue({
      from: "2026-02-18T00:00:00.000Z",
      to: "2026-02-18T00:15:00.000Z",
    }),
  };
});

import { client } from "@datadog/datadog-api-client";
import { searchRumEvents } from "../../src/tools/search-rum-events.js";

const fakeConfig = new client.Configuration();

describe("search_rum_events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the nested event type and detail in summary format", async () => {
    mockSearchRUMEvents.mockResolvedValue({
      data: [
        {
          id: "evt-1",
          type: "rum",
          attributes: {
            service: "web-app",
            timestamp: "2026-02-18T00:05:00.000Z",
            attributes: {
              type: "error",
              error: { message: "Cannot read properties of undefined" },
            },
          },
        },
        {
          id: "evt-2",
          type: "rum",
          attributes: {
            service: "web-app",
            timestamp: "2026-02-18T00:06:00.000Z",
            attributes: { type: "view", view: { url: "https://app/checkout" } },
          },
        },
      ],
      meta: { page: { after: "next-cursor" } },
    });

    const result = await searchRumEvents.handler(
      { query: "service:web-app", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 RUM events found");
    expect(text).toContain("[error]");
    expect(text).toContain("Cannot read properties of undefined");
    expect(text).toContain("[view]");
    expect(text).toContain("https://app/checkout");
    expect(text).toContain("Next page cursor: next-cursor");

    // Outbound request shape — guards against field-name / sort-value drift.
    const sentBody = mockSearchRUMEvents.mock.calls[0][0].body;
    expect(sentBody.filter.query).toBe("service:web-app");
    expect(sentBody.sort).toBe("-timestamp");
    expect(sentBody.page.limit).toBe(50);
  });

  it("returns friendly message when no events found", async () => {
    mockSearchRUMEvents.mockResolvedValue({ data: [], meta: { page: {} } });

    const result = await searchRumEvents.handler(
      { query: "service:nonexistent", format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No RUM events found");
  });
});
