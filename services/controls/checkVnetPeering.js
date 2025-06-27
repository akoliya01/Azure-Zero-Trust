const { NetworkManagementClient } = require('@azure/arm-network');
const { ClientSecretCredential } = require('@azure/identity');
const extractResourceGroupFromId = require('../../utils/extractGroup');
const dotenv = require('dotenv');

dotenv.config();

function getExpectedVnetIds(env) {
  const envKey = `${env.toUpperCase()}_REMOTE_VNET_IDS`;
  const ids = process.env[envKey];
  return ids ? ids.split(',').map(x => x.trim()).filter(Boolean) : [];
}

async function checkVnetPeering() {
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
  const expectedRemoteVnets = getExpectedVnetIds(env);

  const violations = [];
  const scanned = [];

  for await (const vnet of networkClient.virtualNetworks.listAll()) {
    const rg = extractResourceGroupFromId(vnet.id);
    const name = vnet.name;

try {
  const peeringArray = [];
  for await (const p of networkClient.virtualNetworkPeerings.list(rg, name)) {
    peeringArray.push(p);
  }

  const peeredIds = peeringArray
    .map(p => p.remoteVirtualNetwork?.id)
    .filter(Boolean);

  const missingPeers = expectedRemoteVnets.filter(expectedId => !peeredIds.includes(expectedId));

  // scanned.push({
  //   resourceType: 'VNet',
  //   name,
  //   resourceGroup: rg,
  //   peeredWith: peeredIds
  // });
  scanned.push({resourceType: vnet.type, name: vnet.name, remark: missingPeers.length > 0 ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust',  peeredWith: peeredIds})

  if (missingPeers.length > 0) {
    violations.push({
      resourceType: 'VNet',
      name,
      resourceGroup: rg,
      reason: `Missing peering with: ${missingPeers.join(', ')}`
    });
  }
} catch (err) {
  violations.push({
    resourceType: 'VNet',
    name,
    resourceGroup: rg,
    reason: `Error checking peering: ${err.message}`
  });
}



  }

  return {
    policy: `All VNets must be peered with required remote VNets [${env}]`,
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    reason: violations.length === 0
      ? 'All VNets are correctly peered.'
      : `${violations.length} VNet(s) are missing required peering.`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkVnetPeering;
