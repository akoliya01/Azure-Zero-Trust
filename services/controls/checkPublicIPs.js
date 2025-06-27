const { NetworkManagementClient } = require('@azure/arm-network');
const { ClientSecretCredential } = require('@azure/identity');
const extractResourceGroupFromId = require('../../utils/extractGroup');
const violations = [];
const scanned = [];

async function checkPublicIPs() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const networkClient = new NetworkManagementClient(credential, subscriptionId);
  const publicIps = [];

  for await (const ip of networkClient.publicIPAddresses.listAll()) {
    scanned.push({resourceType: ip.type, name: ip.name, remark: ip.ipAddress ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust'})
    if (ip.ipAddress) {
      violations.push({
        name: ip.name,
        ipAddress: ip.ipAddress,
        resourceGroup: extractResourceGroupFromId(ip.id)
      });
    }
  }

  

  return {
    policy: `Ensure no Public IP exists`,
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    reason: violations.length === 0
      ? `No public IP addresses found in the subscription.`
      : `${publicIps.length} public IP(s) detected.`,
    violatingResources: violations,
    scannedResources: scanned
  };

}

module.exports = checkPublicIPs;
