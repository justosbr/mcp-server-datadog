import { client } from "@datadog/datadog-api-client";

export interface DatadogEnv {
  apiKey: string;
  appKey: string;
  site: string;
}

export interface MultiOrgEnv {
  orgs: string[];
  defaultOrg: string;
  orgEnvs: Map<string, DatadogEnv>;
  configs: Map<string, client.Configuration>;
}

export function validateEnv(): DatadogEnv {
  const apiKey = process.env.DD_API_KEY;
  const appKey = process.env.DD_APP_KEY;
  const site = process.env.DD_SITE || "datadoghq.com";

  if (!apiKey) {
    throw new Error(
      "DD_API_KEY environment variable is required. " +
      "Create one at https://app.datadoghq.com/organization-settings/api-keys"
    );
  }

  if (!appKey) {
    throw new Error(
      "DD_APP_KEY environment variable is required. " +
      "Create a scoped Application Key at https://app.datadoghq.com/organization-settings/application-keys"
    );
  }

  return { apiKey, appKey, site };
}

export function createDatadogConfig(env: DatadogEnv): client.Configuration {
  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: env.apiKey,
      appKeyAuth: env.appKey,
    },
  });

  configuration.setServerVariables({
    site: env.site,
  });

  return configuration;
}

export function createOrgConfigs(env: {
  orgs: string[];
  orgEnvs: Map<string, DatadogEnv>;
}): Map<string, client.Configuration> {
  const configs = new Map<string, client.Configuration>();
  for (const org of env.orgs) {
    const orgEnv = env.orgEnvs.get(org);
    if (!orgEnv) {
      throw new Error(`Missing environment for org "${org}"`);
    }
    configs.set(org, createDatadogConfig(orgEnv));
  }
  return configs;
}

export function validateMultiOrgEnv(): MultiOrgEnv {
  const ddOrgs = process.env.DD_ORGS;

  if (!ddOrgs) {
    // Fall back to single-org mode
    const env = validateEnv();
    const orgEnvs = new Map<string, DatadogEnv>();
    orgEnvs.set("default", env);
    const configs = createOrgConfigs({ orgs: ["default"], orgEnvs });
    return {
      orgs: ["default"],
      defaultOrg: "default",
      orgEnvs,
      configs,
    };
  }

  const orgs = ddOrgs.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
  if (orgs.length === 0) {
    throw new Error("DD_ORGS is set but contains no valid org names");
  }

  const site = process.env.DD_SITE || "datadoghq.com";
  const defaultOrg = process.env.DD_DEFAULT_ORG || orgs[0];

  if (!orgs.includes(defaultOrg)) {
    throw new Error(
      `DD_DEFAULT_ORG "${defaultOrg}" is not in DD_ORGS list: ${orgs.join(", ")}`
    );
  }

  const orgEnvs = new Map<string, DatadogEnv>();
  for (const org of orgs) {
    const envPrefix = `DD_${org.toUpperCase().replace(/-/g, "_")}`;
    const apiKey = process.env[`${envPrefix}_API_KEY`];
    const appKey = process.env[`${envPrefix}_APP_KEY`];

    if (!apiKey) {
      throw new Error(
        `${envPrefix}_API_KEY environment variable is required for org "${org}"`
      );
    }
    if (!appKey) {
      throw new Error(
        `${envPrefix}_APP_KEY environment variable is required for org "${org}"`
      );
    }

    orgEnvs.set(org, { apiKey, appKey, site });
  }

  const configs = createOrgConfigs({ orgs, orgEnvs });

  return { orgs, defaultOrg, orgEnvs, configs };
}
