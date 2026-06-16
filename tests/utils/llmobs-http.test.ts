import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { llmobsSearchSpans } from "../../src/utils/llmobs-http.js";

const env = { apiKey: "api-123", appKey: "app-456", site: "datadoghq.com" };

function okResponse(obj: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(obj) };
}

describe("llmobsSearchSpans", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the JSON:API-wrapped body to the site host with auth headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ data: [], meta: { page: {} } }));
    vi.stubGlobal("fetch", fetchMock);

    await llmobsSearchSpans(env, { filter: { ml_app: "x" }, page: { limit: 10 } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.datadoghq.com/api/v2/llm-obs/v1/spans/events/search"
    );
    expect(opts.method).toBe("POST");
    expect(opts.headers["DD-API-KEY"]).toBe("api-123");
    expect(opts.headers["DD-APPLICATION-KEY"]).toBe("app-456");
    expect(opts.headers["Content-Type"]).toBe("application/vnd.api+json");
    expect(JSON.parse(opts.body)).toEqual({
      data: { type: "spans", attributes: { filter: { ml_app: "x" }, page: { limit: 10 } } },
    });
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("builds the host for a regional site suffix", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ data: [], meta: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await llmobsSearchSpans({ ...env, site: "us3.datadoghq.com" }, {});
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.us3.datadoghq.com/api/v2/llm-obs/v1/spans/events/search"
    );
  });

  it("returns the parsed JSON on 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ data: [{ id: "s1" }], meta: {} })));
    const res = await llmobsSearchSpans(env, {});
    expect(res.data[0].id).toBe("s1");
  });

  it("treats an empty 2xx body as no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => "" }));
    const res = await llmobsSearchSpans(env, {});
    expect(res).toEqual({ data: [], meta: {} });
  });

  it("throws a contextual error on a non-JSON 2xx body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "<html>oops</html>" })
    );
    await expect(llmobsSearchSpans(env, {})).rejects.toThrow(/non-JSON body/);
  });

  it("throws an error carrying httpStatusCode on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" })
    );
    await expect(llmobsSearchSpans(env, {})).rejects.toMatchObject({ httpStatusCode: 403 });
  });

  it("rejects malformed DD_SITE values before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const bad of [
      "https://api.datadoghq.com",
      "api.datadoghq.com",
      "app.datadoghq.com",
      "datadoghq.com/foo",
      "datadoghq.com:443",
      "datadoghq",
    ]) {
      await expect(llmobsSearchSpans({ ...env, site: bad }, {})).rejects.toThrow(/Invalid DD_SITE/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
