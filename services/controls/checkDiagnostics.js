const { MonitorClient } = require('@azure/arm-monitor');
const { ResourceManagementClient } = require('@azure/arm-resources');
const { ClientSecretCredential } = require('@azure/identity');
const fs = require('fs');


const supportedTypes = process.env.DIAG_SUPPORTED_TYPES
  ? process.env.DIAG_SUPPORTED_TYPES.split(',').map(s => s.trim())
  : [];

//console.log(`Supported resource types for diagnostics: ${supportedTypes.join(', ')}`);

async function checkDiagnostics() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const mon = new MonitorClient(credential, subscriptionId);
  const resClient = new ResourceManagementClient(credential, subscriptionId);
  const diagnostics = [];
  const scanned = [];
  const allDiagnostics = [];


  // for await (const res of resClient.resources.list()) {
  // if (!supportedTypes.includes(res.type)) continue;
  // const ds = await mon.diagnosticSettings.list(res.id);
  // allDiagnostics.push({
  //   resource: res.name,
  //   id: res.id,
  //   diagnostics: ds
  // });
  // }
  // fs.writeFileSync('allDiagnostics.json', JSON.stringify(allDiagnostics, null, 2));

  for await (const res of resClient.resources.list()) {
     if (!supportedTypes.includes(res.type)) continue;

    try {
      let hasDiagnostics = false;

      if (res.type === 'Microsoft.Storage/storageAccounts' || res.type === 'Microsoft.DataLakeStore/accounts') {
        //console.log(`Checking diagnostics for resource: ${res.name} (${res.type})`);
        //console.log(`-------------------Resource Data------------------: ${JSON.stringify(res, null, 2)}`);
        // Check diagnostics for each service
        const services = ['blobServices/default', 'fileServices/default', 'queueServices/default', 'tableServices/default'];
        for (const service of services) {
          const serviceId = `${res.id}/${service}`;
          const ds = await mon.diagnosticSettings.list(serviceId);
          //console.log(`Diagnostic settings for ${serviceId}:`, ds);
          if (ds.value && ds.value.length > 0) {
            hasDiagnostics = true;
            break;
          }
        }
       } 
      // else if (res.type === 'Microsoft.KeyVault/vaults') {
      //   // For Key Vault, diagnostic settings are at the vault resource itself
      //   const ds = await mon.diagnosticSettings.list(res.id);
      //   hasDiagnostics = ds.value && ds.value.length > 0;
      // } 
      else {
        // Default: check diagnostics at resource level
        const ds = await mon.diagnosticSettings.list(res.id);
        //console.log("Diagnostic settings for resource:", res.name, ds);
        hasDiagnostics = ds.value?.length > 0;
      }

      if (!hasDiagnostics) {
        diagnostics.push({
          resourceType: res.type,
          name: res.name,
          id: res.id,
          reason: 'Missing diagnostic settings'
        });
      }

      scanned.push({
        resourceType: res.type,
        name: res.name,
        remark: hasDiagnostics ? 'Comply with Zero Trust' : 'Not Comply with Zero Trust'
      });

    } catch (err) {
      console.error(`Error fetching diagnostics for ${res.name}:`, err.message);
      diagnostics.push({
        resourceType: res.type,
        name: res.name,
        id: res.id,
        reason: `Error: ${err.message}`
      });
    }
  }




  return {
    policy: 'Diagnostics Settings Check for Azure Resources',
    status: diagnostics.length ? 'FAIL' : 'PASS',
    reason: diagnostics.length === 0
      ? 'All resources have diagnostic settings'
      : `${diagnostics.length} resource(s) missing diagnostics`,
    violatingResources: diagnostics,
    scannedResources: scanned
  };
}

module.exports = checkDiagnostics;
