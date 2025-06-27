const { NetworkManagementClient } = require('@azure/arm-network');
const { ClientSecretCredential } = require('@azure/identity');

require('dotenv').config();

async function checkNSGDNS() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

  if (!env) {
    throw new Error('Environment is required to determine DNS IPs');
  }
  

  const networkClient = new NetworkManagementClient(credential, subscriptionId);
  const envKey = `DNS_IPS_${env.toUpperCase()}`;
  const expectedDNS = (process.env[envKey] || '')
    .split(',')
    .map(ip => ip.trim())
    .filter(Boolean);

  const violations = [];
  const scanned = [];

  for await (const vnet of networkClient.virtualNetworks.listAll()) {
    const actualDNS = vnet.dhcpOptions?.dnsServers || [];

    const missing = expectedDNS.filter(ip => !actualDNS.includes(ip));

    scanned.push({
      resourceType: 'Virtual Network',
      name: vnet.name,
      location: vnet.location,
      dnsServers: actualDNS,
      remark: missing.length === 0
        ? 'Comply with Zero Trust'
        : `Not Comply with Zero Trust - Missing DNS IPs: ${missing.join(', ')}`
    });

    if (missing.length > 0) {
      violations.push({
        resourceType: 'Virtual Network',
        name: vnet.name,
        location: vnet.location,
        reason: `Missing expected DNS IP(s): ${missing.join(', ')}`
      });
    }
  }

  return {
    policy: `Ensure VNETs use correct DNS IPs [${env}]`,
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    reason: violations.length === 0
      ? `All VNETs use configured DNS IPs (${expectedDNS.join(', ')})`
      : `${violations.length} VNET(s) missing expected DNS IPs`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkNSGDNS;
