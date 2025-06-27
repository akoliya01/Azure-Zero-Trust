const { ComputeManagementClient } = require('@azure/arm-compute');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { ClientSecretCredential } = require('@azure/identity');


/**
 * Checks all managed disks for:
 * 1. Public access must be disabled (disks should not be shared publicly).
 * 2. MMK (customer-managed key) encryption must be enabled.
 */
async function checkDiskSecurity() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const computeClient = new ComputeManagementClient(credential, subscriptionId);
  const resourceClient = new ResourceManagementClient(credential, subscriptionId);

  const violations = [];
  const scanned = [];

  for await (const res of resourceClient.resources.list()) {
    if (res.type !== 'Microsoft.Compute/disks') continue;

    const rg = res.id.match(/resourceGroups\/([^\/]+)\//i)?.[1];
    const diskName = res.name;

    try {
      const disk = await computeClient.disks.get(rg, diskName);

      // 1. Public access check (Azure Managed Disks do not support public access, but check for export policy)
      // If disk has 'publicNetworkAccess' property, it should be 'Disabled' or undefined (default is disabled)
      const publicAccess = disk.publicNetworkAccess || 'Disabled';

      // 2. MMK encryption check
      const usesMMK = disk.encryption?.type === 'EncryptionAtRestWithPlatformKey';

      scanned.push({
        resourceType: res.type,
        name: diskName,
        publicNetworkAccess: publicAccess,
        encryptionType: disk.encryption?.type || 'None',
        remark:
          (publicAccess === 'Disabled' && usesMMK)
            ? 'Comply with Zero Trust'
            : 'Not Comply with Zero Trust'
      });

      if (publicAccess !== 'Disabled') {
        violations.push({
          resourceType: res.type,
          name: diskName,
          id: res.id,
          reason: 'Public network access is not disabled'
        });
      }
      if (!usesMMK) {
        violations.push({
          resourceType: res.type,
          name: diskName,
          id: res.id,
          reason: 'MMK (Micorsoft-managed key) encryption is not enabled'
        });
      }
    } catch (err) {
      violations.push({
        resourceType: res.type,
        name: diskName,
        id: res.id,
        reason: `Error: ${err.message}`
      });
      scanned.push({
        resourceType: res.type,
        name: diskName,
        remark: 'Error during check'
      });
    }
  }

  return {
    policy: 'Disk Security (No public access, MMK encryption enabled)',
    status: violations.length ? 'FAIL' : 'PASS',
    reason: violations.length === 0
      ? 'All disks comply with security requirements'
      : `${violations.length} violation(s) found`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkDiskSecurity;