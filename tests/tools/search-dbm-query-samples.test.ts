import { describe, it, expect, vi, afterEach } from "vitest";
import { searchDbmQuerySamples } from "../../src/tools/search-dbm-query-samples.js";

const env = { apiKey: "api-123", appKey: "app-456", site: "datadoghq.com" };
const fakeConfig = {} as any;

afterEach(() => vi.unstubAllGlobals());

describe("search_dbm_query_samples", () => {
  it("queries the databasequery index for activity records and summarizes them", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          result: {
            events: [
              {
                event: {
                  custom: {
                    db: {
                      statement: "SELECT * FROM policies WHERE id = ?",
                      query_signature: "44c22fe3377aff9b",
                      wait_event_type: "Lock",
                      wait_event: "relation",
                      rows: 3,
                    },
                  },
                },
              },
            ],
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchDbmQuerySamples.handler(
      {
        query_signature: "44c22fe3377aff9b",
        query: "service:api OR env:prod",
        from: "2026-10-07T10:00:00Z",
        to: "2026-10-07T11:00:00Z",
        limit: 9999,
      },
      fakeConfig,
      env
    );

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.datadoghq.com/api/v1/logs-analytics/list?type=databasequery");
    expect(opts.headers["DD-APPLICATION-KEY"]).toBe("app-456");
    expect(JSON.parse(opts.body)).toEqual({
      list: {
        indexes: ["databasequery"],
        limit: 200,
        search: {
          query: "dbm_type:activity @db.query_signature:44c22fe3377aff9b (service:api OR env:prod)",
        },
        sorts: [{ time: { order: "desc" } }],
        time: { from: Date.parse("2026-10-07T10:00:00Z"), to: Date.parse("2026-10-07T11:00:00Z") },
      },
    });
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("1 DBM query samples found");
    expect(res.content[0].text).toContain(
      "[sig 44c22fe3377aff9b] [wait Lock/relation] [rows 3] SELECT * FROM policies WHERE id = ?"
    );
  });
});
