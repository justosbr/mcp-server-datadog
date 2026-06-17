import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetRUMApplications } = vi.hoisted(() => {
  const mockGetRUMApplications = vi.fn();
  return { mockGetRUMApplications };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      RUMApi: vi.fn().mockImplementation(function () {
        return { getRUMApplications: mockGetRUMApplications };
      }),
    },
  };
});

import { client } from "@datadog/datadog-api-client";
import { listRumApplications } from "../../src/tools/list-rum-applications.js";

const fakeConfig = new client.Configuration();

describe("list_rum_applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns applications with name and id in summary format", async () => {
    mockGetRUMApplications.mockResolvedValue({
      data: [
        {
          id: "app-uuid-1",
          type: "rum_application",
          attributes: {
            name: "webquoting",
            applicationId: "11111111-2222-3333",
            type: "browser",
          },
        },
      ],
    });

    const result = await listRumApplications.handler(
      { format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("1 RUM applications found");
    expect(text).toContain("webquoting");
    expect(text).toContain("11111111-2222-3333");
    expect(text).toContain("browser");
  });

  it("returns friendly message when no applications found", async () => {
    mockGetRUMApplications.mockResolvedValue({ data: [] });

    const result = await listRumApplications.handler({}, fakeConfig);

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No RUM applications found");
  });
});
