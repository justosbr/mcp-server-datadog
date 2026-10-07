import { describe, it, expect, vi, afterEach } from "vitest";
import { getDbmExplainPlans } from "../../src/tools/get-dbm-explain-plans.js";

const env = { apiKey: "api-123", appKey: "app-456", site: "datadoghq.com" };
const fakeConfig = {} as any;

afterEach(() => vi.unstubAllGlobals());

describe("get_dbm_explain_plans", () => {
  it("fetches plan records for the signature and summarizes cost and definition", async () => {
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
                      plan: {
                        definition: '{"Plan":{"Node Type":"Seq Scan","Relation Name":"policies"}}',
                        cost: 431.5,
                        signature: "9f1e2d3c",
                      },
                    },
                  },
                },
              },
            ],
          },
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await getDbmExplainPlans.handler(
      { query_signature: "44C22FE3377AFF9B", limit: 9999 },
      fakeConfig,
      env
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.list.search.query).toBe("dbm_type:plan @db.query_signature:44c22fe3377aff9b");
    expect(body.list.limit).toBe(50);
    expect(body.list.time.to - body.list.time.from).toBeCloseTo(4 * 3600 * 1000, -4);
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("[plan 9f1e2d3c] [cost 431.5]");
    expect(res.content[0].text).toContain('"Node Type":"Seq Scan"');
  });

  it("formats a 403 asking for an unscoped key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "Forbidden" })
    );
    const res = await getDbmExplainPlans.handler(
      { query_signature: "44c22fe3377aff9b" },
      fakeConfig,
      env
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("unscoped Application Key");
  });

  it("surfaces a 2xx body without result.events as an error, not as no matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ errors: ["invalid query"] }),
      })
    );
    const res = await getDbmExplainPlans.handler(
      { query_signature: "44c22fe3377aff9b" },
      fakeConfig,
      env
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("invalid query");
  });

  it("errors when reading a 2xx body fails instead of reporting no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.reject(new Error("socket hang up")),
      })
    );
    const res = await getDbmExplainPlans.handler(
      { query_signature: "44c22fe3377aff9b" },
      fakeConfig,
      env
    );
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("socket hang up");
  });

  it("treats a result object without events as no matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"result":{}}' })
    );
    const res = await getDbmExplainPlans.handler(
      { query_signature: "44c22fe3377aff9b" },
      fakeConfig,
      env
    );
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("No DBM explain plans found");
  });
});
