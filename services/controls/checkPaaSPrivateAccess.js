const axios = require('axios');
const { ClientSecretCredential } = require('@azure/identity');
const { OperationalInsightsManagementClient } = require('@azure/arm-operationalinsights');
const { WebSiteManagementClient } = require('@azure/arm-appservice');
const { StorageManagementClient } = require('@azure/arm-storage');
const { SqlManagementClient } = require('@azure/arm-sql');
const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
const { SynapseManagementClient } = require('@azure/arm-synapse');
const { ContainerAppsAPIClient } = require('@azure/arm-appcontainers');
const { CosmosDBManagementClient } = require('@azure/arm-cosmosdb');
const { AppConfigurationManagementClient } = require('@azure/arm-appconfiguration');
const { ContainerRegistryManagementClient } = require('@azure/arm-containerregistry');
const PostgreSQLManagementClient = require('@azure/arm-postgresql-flexible').default;
const { MachineLearningServicesManagementClient } = require('@azure/arm-machinelearning');
const extractResourceGroupFromId = require('../../utils/extractGroup');

/**
 * Main function: expects all credentials from user input.
 */
async function checkPaaSPrivateAccess() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  const violations = [];
  const scanned = [];

  // Use user-provided credentials for all SDK and REST calls


  const evaluate = (access, peCount) =>
    access !== 'Disabled' || peCount === 0;

  const logViolation = (resourceType, name, rg, access, peCount) =>
    violations.push({
      resourceType,
      name,
      resourceGroup: rg,
      reason: `Public access: ${access}, Private Endpoints: ${peCount}`
    });

  async function getAzureAccessToken() {
    const token = await credential.getToken('https://management.azure.com/.default');
    return token.token;
  }

  // REST call to fetch private endpoints for a Web App
  async function getWebAppPrivateEndpoints(subscriptionId, rg, appName, accessToken) {
    const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${rg}/providers/Microsoft.Web/sites/${appName}/privateEndpointConnections?api-version=2022-03-01`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    return response.data.value || [];
  }

  // --- Web Apps ---
  try {
    const webClient = new WebSiteManagementClient(credential, subscriptionId);
    const accessToken = await getAzureAccessToken();

    for await (const app of webClient.webApps.list()) {
      const rg = extractResourceGroupFromId(app.id);
      const config = await webClient.webApps.getConfiguration(rg, app.name);
      const access = config.publicNetworkAccess || 'Unknown';

      let peConnections = [];
      try {
        peConnections = await getWebAppPrivateEndpoints(subscriptionId, rg, app.name, accessToken);
      } catch (restErr) {
        console.error(`REST API error for app ${app.name}:`, restErr.message);
      }
      scanned.push({
        resourceType: app.type,
        name: app.name,
        remark: evaluate(access, peConnections.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, peConnections.length)) {
        logViolation('Web App', app.name, rg, access, peConnections.length);
      }
    }
  } catch (err) {
    violations.push({
      resourceType: 'Web App',
      name: 'All',
      resourceGroup: 'Unknown',
      reason: `Error: ${err.message}`
    });
  }

  // --- Storage Accounts ---
  try {
    const storageClient = new StorageManagementClient(credential, subscriptionId);
    for await (const account of storageClient.storageAccounts.list()) {
      const rg = extractResourceGroupFromId(account.id);
      const props = await storageClient.storageAccounts.getProperties(rg, account.name);
      const access = props.publicNetworkAccess || 'Unknown';
      const pe = props.privateEndpointConnections || [];

      scanned.push({
        resourceType: account.type,
        name: account.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('Storage Account', account.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'Storage Account', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- SQL Servers ---
  try {
    const sqlClient = new SqlManagementClient(credential, subscriptionId);
    for await (const server of sqlClient.servers.list()) {
      const rg = extractResourceGroupFromId(server.id);
      const props = await sqlClient.servers.get(rg, server.name);
      const access = props.publicNetworkAccess || 'Unknown';
      const pe = await sqlClient.privateEndpointConnections.listByServer(rg, server.name);

      scanned.push({
        resourceType: server.type,
        name: server.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('SQL Server', server.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'SQL Server', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- Key Vaults ---
  try {
    const keyVaultClient = new KeyVaultManagementClient(credential, subscriptionId);
    for await (const vault of keyVaultClient.vaults.list()) {
      const rg = extractResourceGroupFromId(vault.id);
      const props = await keyVaultClient.vaults.get(rg, vault.name);
      const access = props.properties?.publicNetworkAccess || 'Unknown';
      const pe = props.properties?.privateEndpointConnections || [];
      scanned.push({
        resourceType: vault.type,
        name: vault.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('Key Vault', vault.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'Key Vault', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- Synapse Workspaces ---
  try {
    const synapseClient = new SynapseManagementClient(credential, subscriptionId);
    for await (const ws of synapseClient.workspaces.list()) {
      const rg = extractResourceGroupFromId(ws.id);
      const props = await synapseClient.workspaces.get(rg, ws.name);
      const access = props.publicNetworkAccess || 'Unknown';
      const pe = props.privateEndpointConnections || [];
      scanned.push({
        resourceType: ws.type,
        name: ws.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('Synapse Workspace', ws.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'Synapse', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- Cosmos DB ---
  try {
    const cosmosClient = new CosmosDBManagementClient(credential, subscriptionId);
    for await (const acc of cosmosClient.databaseAccounts.list()) {
      const rg = extractResourceGroupFromId(acc.id);
      const props = await cosmosClient.databaseAccounts.get(rg, acc.name);
      const access = props.publicNetworkAccess || 'Unknown';
      const pe = props.privateEndpointConnections || [];
      scanned.push({
        resourceType: acc.type,
        name: acc.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('Cosmos DB', acc.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'Cosmos DB', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- App Configuration ---
  try {
    const appConfigClient = new AppConfigurationManagementClient(credential, subscriptionId);
    for await (const conf of appConfigClient.configurationStores.list()) {
      const rg = extractResourceGroupFromId(conf.id);
      const props = await appConfigClient.configurationStores.get(rg, conf.name);
      const access = props.publicNetworkAccess || 'Unknown';
      const pe = props.privateEndpointConnections || [];
      scanned.push({
        resourceType: conf.type,
        name: conf.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('App Config', conf.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'App Config', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- Container Registry ---
  try {
    const acrClient = new ContainerRegistryManagementClient(credential, subscriptionId);
    for await (const reg of acrClient.registries.list()) {
      const rg = extractResourceGroupFromId(reg.id);
      const props = await acrClient.registries.get(rg, reg.name);
      const access = props.publicNetworkAccess || 'Unknown';
      const pe = props.privateEndpointConnections || [];
      scanned.push({
        resourceType: reg.type,
        name: reg.name,
        remark: evaluate(access, pe.length) ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (evaluate(access, pe.length)) logViolation('ACR', reg.name, rg, access, pe.length);
    }
  } catch (err) {
    violations.push({ resourceType: 'ACR', name: 'All', resourceGroup: 'Unknown', reason: `Error: ${err.message}` });
  }

  // --- Log Analytics Workspaces ---
  try {
    const insightsClient = new OperationalInsightsManagementClient(credential, subscriptionId);
    for await (const ws of insightsClient.workspaces.list()) {
      const rg = extractResourceGroupFromId(ws.id);
      if (!rg) continue;
      const badIngestion = ws.publicNetworkAccessForIngestion !== 'SecuredByPerimeter';
      const badQuery = ws.publicNetworkAccessForQuery !== 'SecuredByPerimeter';
      scanned.push({
        resourceType: ws.type,
        name: ws.name,
        remark: badIngestion || badQuery ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'
      });
      if (badIngestion || badQuery) {
        violations.push({
          resourceType: 'Log Analytics Workspace',
          name: ws.name,
          resourceGroup: rg,
          reason: `Ingestion: ${ws.publicNetworkAccessForIngestion}, Query: ${ws.publicNetworkAccessForQuery}`
        });
      }
    }
  } catch (err) {
    violations.push({
      resourceType: 'Log Analytics Workspace',
      name: 'All',
      resourceGroup: 'Unknown',
      reason: `Error: ${err.message}`
    });
  }

  return {
    policy: 'All PaaS services must have Private Endpoint & Public Access disabled',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    reason: violations.length === 0
      ? 'All PaaS services comply with Zero Trust rules.'
      : `${violations.length} PaaS resource(s) violate Zero Trust policies.`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkPaaSPrivateAccess;
