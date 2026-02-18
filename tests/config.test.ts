import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatadogConfig, validateEnv } from "../src/config.js";

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when DD_API_KEY is missing", () => {
    process.env.DD_APP_KEY = "test-app-key";
    delete process.env.DD_API_KEY;
    expect(() => validateEnv()).toThrow("DD_API_KEY");
  });

  it("throws when DD_APP_KEY is missing", () => {
    process.env.DD_API_KEY = "test-api-key";
    delete process.env.DD_APP_KEY;
    expect(() => validateEnv()).toThrow("DD_APP_KEY");
  });

  it("returns config when both keys are set", () => {
    process.env.DD_API_KEY = "test-api-key";
    process.env.DD_APP_KEY = "test-app-key";
    const env = validateEnv();
    expect(env.apiKey).toBe("test-api-key");
    expect(env.appKey).toBe("test-app-key");
    expect(env.site).toBe("datadoghq.com");
  });

  it("uses DD_SITE when provided", () => {
    process.env.DD_API_KEY = "test-api-key";
    process.env.DD_APP_KEY = "test-app-key";
    process.env.DD_SITE = "datadoghq.eu";
    const env = validateEnv();
    expect(env.site).toBe("datadoghq.eu");
  });
});

describe("createDatadogConfig", () => {
  it("returns a Configuration object", () => {
    const config = createDatadogConfig({
      apiKey: "test-api-key",
      appKey: "test-app-key",
      site: "datadoghq.com",
    });
    expect(config).toBeDefined();
  });
});
