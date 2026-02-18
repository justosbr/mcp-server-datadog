import { client } from "@datadog/datadog-api-client";

export interface DatadogEnv {
  apiKey: string;
  appKey: string;
  site: string;
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
