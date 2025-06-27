const { NetworkManagementClient } = require('@azure/arm-network');
const { ClientSecretCredential } = require('@azure/identity');
const extractResourceGroupFromId = require('../../utils/extractGroup');

async function checkSubnetsNSG() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const client = new NetworkManagementClient(credential, subscriptionId);
  const violations = [];
  const scanned = [];

  try {
    const vnets = await client.virtualNetworks.listAll();

    for await (const vnet of vnets) {
      const rg = extractResourceGroupFromId(vnet.id);
      const vnetName = vnet.name;
      // const subnets = await client.subnets.list(rg, vnetName);

      for await (const subnet of client.subnets.list(rg, vnetName)) {
        const subnetName = subnet.name;
        const nsgId = subnet.networkSecurityGroup?.id;

        // scanned.push({
        //   resourceType: 'Subnet',
        //   name: subnetName,
        //   vnet: vnetName,
        //   resourceGroup: rg,
        //   nsg: nsgId || 'None'
        // });

        scanned.push({resourceType: subnet.type, name: subnet.name, remark: !nsgId || nsgId.trim() === '' ? 'Not Comply with Zero Trust' : 'Comply with Zero Trust', nsg: nsgId || 'None'});

        if (!nsgId || nsgId.trim() === '') {
          violations.push({
            resourceType: 'Subnet',
            name: subnetName,
            vnet: vnetName,
            resourceGroup: rg,
            reason: 'No NSG associated'
          });
        }
      }
    }
  } catch (err) {
    violations.push({
      resourceType: 'Subnet',
      name: 'All',
      resourceGroup: 'Unknown',
      reason: `Error during subnet NSG check: ${err.message}`
    });
  }

  return {
    policy: 'All Subnets must have NSG associated',
    status: violations.length === 0 ? 'PASS' : 'FAIL',
    reason: violations.length === 0
      ? 'All subnets are correctly associated with NSGs.'
      : `${violations.length} subnet(s) are missing NSG association.`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkSubnetsNSG;
