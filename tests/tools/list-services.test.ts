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

// The API client deserializes the schema's `dd-service` key to `ddService`, so
// this is the shape the handler is handed for a live response.
const sampleServices = {
  data: [
    {
      attributes: {
        schema: {
          ddService: "payments-api",
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
          ddService: "auth-service",
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
    expect(text).not.toContain("unknown");
  });

  it("names services carrying the raw hyphenated schema key", async () => {
    mockListServiceDefinitions.mockResolvedValue({
      data: [{ attributes: { schema: { "dd-service": "billing-api" } } }],
    });

    const result = await listServices.handler({ format: "summary" }, fakeConfig);

    const text = result.content[0].text;
    expect(text).toContain("billing-api");
    expect(text).not.toContain("unknown");
  });

  it("prefers the deserialized name when both key forms are present", async () => {
    // The two names share no substring, so each assertion can only be satisfied
    // by the key form it names.
    mockListServiceDefinitions.mockResolvedValue({
      data: [
        {
          attributes: {
            schema: { ddService: "orders-api", "dd-service": "legacy-orders" },
          },
        },
      ],
    });

    const result = await listServices.handler({ format: "summary" }, fakeConfig);

    const text = result.content[0].text;
    expect(text).toContain("orders-api");
    expect(text).not.toContain("legacy-orders");
  });

  it("returns friendly message when no services found", async () => {
    mockListServiceDefinitions.mockResolvedValue({ data: [] });

    const result = await listServices.handler({}, fakeConfig);

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("No services found in the Service Catalog");
  });
});
