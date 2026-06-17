import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchEvents } = vi.hoisted(() => ({ mockSearchEvents: vi.fn() }));

vi.mock("@datadog/datadog-api-client", () => ({
  client: { Configuration: vi.fn() },
  v2: {
    EventsApi: vi.fn().mockImplementation(function () {
      return { searchEvents: mockSearchEvents };
    }),
  },
}));

import { searchEvents } from "../../src/tools/search-events.js";

const config = {} as any;

describe("search_events", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a summary from the nested event attributes and surfaces the cursor", async () => {
    mockSearchEvents.mockResolvedValue({
      data: [
        {
          attributes: {
            timestamp: new Date("2026-06-17T10:00:00.000Z"),
            message: "deployed v1.2",
            attributes: { title: "Deploy payments v1.2", service: "payments", status: "info", sourceTypeName: "github" },
          },
        },
      ],
      meta: { page: { after: "CUR2" } },
    });

    const res = await searchEvents.handler({ query: "tags:deploy" }, config);
    const text = res.content[0].text as string;
    expect(text).toContain("Deploy payments v1.2 (github) payments");
    expect(text).toContain("[info]");
    expect(text).toContain("Next page cursor: CUR2");
    // filter uses ISO strings (Events API accepts string from/to)
    expect(typeof mockSearchEvents.mock.calls[0][0].body.filter.from).toBe("string");
  });

  it("reports a friendly message when no events match", async () => {
    mockSearchEvents.mockResolvedValue({ data: [] });
    const res = await searchEvents.handler({}, config);
    expect(res.content[0].text).toContain("No events found");
  });
});
