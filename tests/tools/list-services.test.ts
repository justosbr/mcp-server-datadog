import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockListServiceDefinitions } = vi.hoisted(() => {
  const mockListServiceDefinitions = vi.fn();
  return { mockListServiceDefinitions };
});

vi.mock("@datadog/datadog-api-client", () => {
  return {
    client: {
      Configuration: vi.fn(),
    },
    v2: {
      ServiceDefinitionApi: vi.fn().mockImplementation(function () {
        return { listServiceDefinitions: mockListServiceDefinitions };
      }),
    },
  };
});

import { client } from "@datadog/datadog-api-client";
import { listServices } from "../../src/tools/list-services.js";

const fakeConfig = new client.Configuration();

const sampleServices = {
  data: [
    {
      attributes: {
        schema: {
          "dd-service": "payments-api",
          team: "payments",
          description: "Handles payment processing",
          links: [
            { name: "Runbook", url: "https://wiki.example.com/payments" },
          ],
        },
      },
    },
    {
      attributes: {
        schema: {
          "dd-service": "auth-service",
          team: "platform",
          description: "Authentication and authorization",
        },
      },
    },
  ],
};

describe("list_services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns services in summary format", async () => {
    mockListServiceDefinitions.mockResolvedValue(sampleServices);

    const result = await listServices.handler(
      { format: "summary" },
      fakeConfig
    );

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("2 services found");
    expect(text).toContain("payments-api");
    expect(text).toContain("auth-service");
    expect(text).toContain("payments");
    expect(text).toContain("platform");
  });

  it("returns friendly message when no services found", async () => {
    mockListServiceDefinitions.mockResolvedValue({ data: [] });

    const result = await listServices.handler({}, fakeConfig);

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No services found in the Service Catalog");
  });
});
