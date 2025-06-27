const { SqlManagementClient } = require('@azure/arm-sql');
const { ClientSecretCredential } = require('@azure/identity');

const extractResourceGroupFromId = require('../../utils/extractGroup');

async function checkSQLAuditing() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const sqlClient = new SqlManagementClient(credential, subscriptionId);
  const violations = [];
  const publicIps = [];
  const scanned = [];

  for await (const server of sqlClient.servers.list()) {
    const rg = extractResourceGroupFromId(server.id);
    if (!rg) continue;

    const policies = await sqlClient.serverBlobAuditingPolicies.get(rg, server.name);
    scanned.push({resourceType: server.type, name: server.name, remark: policies.state !== 'Enabled' ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'})
    if (policies.state !== 'Enabled') {
      violations.push({
        resourceType: 'SQL Server',
        name: server.name,
        resourceGroup: rg,
        reason: 'SQL auditing is not enabled'
      });
    }
  }

  return {
    policy: 'Ensure SQL Servers have auditing enabled',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    reason: violations.length === 0
      ? 'All SQL Servers have auditing enabled.'
      : `${violations.length} SQL Server(s) auditing is disabled.`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkSQLAuditing;
