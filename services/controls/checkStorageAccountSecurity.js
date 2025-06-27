const { StorageManagementClient } = require('@azure/arm-storage');
const { ClientSecretCredential } = require('@azure/identity');
const { ResourceManagementClient } = require('@azure/arm-resources');

/**
 * Checks all storage accounts for:
 * 1. No blob container is publicly accessible.
 * 2. Access key-based access is disabled (i.e., allowSharedKeyAccess is false).
 */
async function checkStorageAccountSecurity() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const storageClient = new StorageManagementClient(credential, subscriptionId);
  const resourceClient = new ResourceManagementClient(credential, subscriptionId);

  const violations = [];
  const scanned = [];

  for await (const res of resourceClient.resources.list()) {
    if (res.type !== 'Microsoft.Storage/storageAccounts') continue;

    const rg = res.id.match(/resourceGroups\/([^\/]+)\//i)?.[1];
    const accountName = res.name;

    try {
      // 1. Check access key-based access
      const acc = await storageClient.storageAccounts.getProperties(rg, accountName);
      const allowSharedKeyAccess = acc.allowSharedKeyAccess !== false; // Default is true if not set

      // 2. Check all blob containers for public access
      let publicContainers = [];
      // Remove the 'default' parameter from blobContainers.list
      const blobContainers = storageClient.blobContainers.list(rg, accountName);
      for await (const container of blobContainers) {
        if (container.publicAccess && container.publicAccess !== 'None') {
          publicContainers.push(container.name);
        }
      }

      // Record scanned
      scanned.push({
        resourceType: res.type,
        name: accountName,
        allowSharedKeyAccess: allowSharedKeyAccess ? 'Enabled' : 'Disabled',
        publicContainers: publicContainers.length ? publicContainers.join(', ') : 'None',
        remark:
          (!allowSharedKeyAccess && publicContainers.length === 0)
            ? 'Comply with Zero Trust'
            : 'Not Comply with Zero Trust'
      });

      // Record violations
      if (allowSharedKeyAccess) {
        violations.push({
          resourceType: res.type,
          name: accountName,
          id: res.id,
          reason: 'Access key-based access (allowSharedKeyAccess) is enabled'
        });
      }
      if (publicContainers.length > 0) {
        violations.push({
          resourceType: res.type,
          name: accountName,
          id: res.id,
          reason: `Public blob containers: ${publicContainers.join(', ')}`
        });
      }
    } catch (err) {
      violations.push({
        resourceType: res.type,
        name: accountName,
        id: res.id,
        reason: `Error: ${err.message}`
      });
      scanned.push({
        resourceType: res.type,
        name: accountName,
        remark: 'Error during check'
      });
    }
  }

  return {
    policy: 'Storage Account Security (No public blobs, no access key-based access)',
    status: violations.length ? 'FAIL' : 'PASS',
    reason: violations.length === 0
      ? 'All storage accounts comply with security requirements'
      : `${violations.length} violation(s) found`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkStorageAccountSecurity;