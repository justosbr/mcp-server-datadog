import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createDatadogConfig,
  createOrgConfigs,
  validateEnv,
  validateMultiOrgEnv,
} from "../src/config.js";

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

describe("validateMultiOrgEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("parses DD_ORGS into org list", () => {
    process.env.DD_ORGS = "staging,production";
    process.env.DD_STAGING_API_KEY = "staging-api";
    process.env.DD_STAGING_APP_KEY = "staging-app";
    process.env.DD_PRODUCTION_API_KEY = "prod-api";
    process.env.DD_PRODUCTION_APP_KEY = "prod-app";

    const result = validateMultiOrgEnv();
    expect(result.orgs).toEqual(["staging", "production"]);
    expect(result.orgEnvs.size).toBe(2);
    expect(result.configs.size).toBe(2);
  });

  it("falls back to single-org when DD_ORGS not set", () => {
    delete process.env.DD_ORGS;
    process.env.DD_API_KEY = "test-api-key";
    process.env.DD_APP_KEY = "test-app-key";

    const result = validateMultiOrgEnv();
    expect(result.orgs).toEqual(["default"]);
    expect(result.defaultOrg).toBe("default");
    expect(result.orgEnvs.get("default")).toEqual({
      apiKey: "test-api-key",
      appKey: "test-app-key",
      site: "datadoghq.com",
    });
    expect(result.configs.has("default")).toBe(true);
  });

  it("throws when org missing API key", () => {
    process.env.DD_ORGS = "staging";
    process.env.DD_STAGING_APP_KEY = "staging-app";
    delete process.env.DD_STAGING_API_KEY;

    expect(() => validateMultiOrgEnv()).toThrow("DD_STAGING_API_KEY");
  });

  it("throws when DD_DEFAULT_ORG not in DD_ORGS", () => {
    process.env.DD_ORGS = "staging,production";
    process.env.DD_DEFAULT_ORG = "unknown";
    process.env.DD_STAGING_API_KEY = "staging-api";
    process.env.DD_STAGING_APP_KEY = "staging-app";
    process.env.DD_PRODUCTION_API_KEY = "prod-api";
    process.env.DD_PRODUCTION_APP_KEY = "prod-app";

    expect(() => validateMultiOrgEnv()).toThrow(
      'DD_DEFAULT_ORG "unknown" is not in DD_ORGS list'
    );
  });

  it("defaults DD_DEFAULT_ORG to first org", () => {
    process.env.DD_ORGS = "staging,production";
    delete process.env.DD_DEFAULT_ORG;
    process.env.DD_STAGING_API_KEY = "staging-api";
    process.env.DD_STAGING_APP_KEY = "staging-app";
    process.env.DD_PRODUCTION_API_KEY = "prod-api";
    process.env.DD_PRODUCTION_APP_KEY = "prod-app";

    const result = validateMultiOrgEnv();
    expect(result.defaultOrg).toBe("staging");
  });

  it("replaces hyphens with underscores in org env var names", () => {
    process.env.DD_ORGS = "my-org";
    process.env.DD_MY_ORG_API_KEY = "my-org-api";
    process.env.DD_MY_ORG_APP_KEY = "my-org-app";

    const result = validateMultiOrgEnv();
    expect(result.orgEnvs.get("my-org")?.apiKey).toBe("my-org-api");
  });

  it("uses shared DD_SITE across all orgs", () => {
    process.env.DD_ORGS = "staging,production";
    process.env.DD_SITE = "datadoghq.eu";
    process.env.DD_STAGING_API_KEY = "staging-api";
    process.env.DD_STAGING_APP_KEY = "staging-app";
    process.env.DD_PRODUCTION_API_KEY = "prod-api";
    process.env.DD_PRODUCTION_APP_KEY = "prod-app";

    const result = validateMultiOrgEnv();
    expect(result.orgEnvs.get("staging")?.site).toBe("datadoghq.eu");
    expect(result.orgEnvs.get("production")?.site).toBe("datadoghq.eu");
  });
});

describe("createOrgConfigs", () => {
  it("returns Map with one config per org", () => {
    const orgEnvs = new Map([
      ["org1", { apiKey: "api1", appKey: "app1", site: "datadoghq.com" }],
      ["org2", { apiKey: "api2", appKey: "app2", site: "datadoghq.com" }],
    ]);

    const configs = createOrgConfigs({ orgs: ["org1", "org2"], orgEnvs });
    expect(configs.size).toBe(2);
    expect(configs.has("org1")).toBe(true);
    expect(configs.has("org2")).toBe(true);
  });
});
