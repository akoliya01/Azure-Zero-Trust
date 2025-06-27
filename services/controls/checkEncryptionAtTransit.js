const { ResourceManagementClient } = require('@azure/arm-resources');
const { ClientSecretCredential } = require('@azure/identity');


const supportedTypes = process.env.MMK_SUPPORTED_TYPES
  ? process.env.MMK_SUPPORTED_TYPES.split(',').map(s => s.trim())
  : [];

//console.log(`Supported resource types for MMK encryption: ${supportedTypes.join(', ')}`);

// Helper to extract resource group from resource ID
function extractRG(id) {
  const match = id.match(/resourceGroups\/([^\/]+)\//i);
  return match ? match[1] : null;
}

// List of actually implemented types (update this list as you comment/uncomment cases)
const implementedTypes = [
  'Microsoft.Storage/storageAccounts',
  'Microsoft.Compute/disks',
  // 'Microsoft.Sql/servers', // commented out
  'Microsoft.DocumentDB/databaseAccounts',
  'Microsoft.KeyVault/vaults',
  // 'Microsoft.Synapse/workspaces', // commented out
  'Microsoft.AppConfiguration/configurationStores',
  'Microsoft.ContainerRegistry/registries',
  'Microsoft.MachineLearningServices/workspaces',
  'Microsoft.CognitiveServices/accounts',
  'Microsoft.DBforPostgreSQL/servers',
  'Microsoft.DBforMySQL/servers',
  'Microsoft.DBforMariaDB/servers',
  // 'Microsoft.Network/virtualNetworkGateways', // commented out
  // 'Microsoft.RecoveryServices/vaults', // commented out
  // 'Microsoft.EventHub/namespaces', // commented out
  // 'Microsoft.ServiceBus/namespaces', // commented out
  // 'Microsoft.Kubernetes/connectedClusters', // commented out
];

async function checkEncryptionAtTransit() {
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  const env = process.env.ENV;

  if (!tenantId || !clientId || !clientSecret || !subscriptionId) {
    throw new Error('Tenant ID, Client ID, Client Secret, and Subscription ID are required.');
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  const resourceClient = new ResourceManagementClient(credential, subscriptionId);
  const violations = [];
  const scanned = [];

  for await (const res of resourceClient.resources.list()) {
    // Only scan if both supported and implemented
    if (!supportedTypes.includes(res.type) || !implementedTypes.includes(res.type)) continue;

    const rg = extractRG(res.id);
    const name = res.name;
    const type = res.type;
    let usesMMK = false;

    try {
      switch (type) {
        case 'Microsoft.Storage/storageAccounts': {
          const { StorageManagementClient } = require('@azure/arm-storage');
          const storageClient = new StorageManagementClient(credential, subscriptionId);
          const acc = await storageClient.storageAccounts.getProperties(rg, name);
          usesMMK = acc.encryption?.keySource === 'Microsoft.Storage';
          break;
        }
        case 'Microsoft.Compute/disks': {
          const { ComputeManagementClient } = require('@azure/arm-compute');
          const computeClient = new ComputeManagementClient(credential, subscriptionId);
          const disk = await computeClient.disks.get(rg, name);
          usesMMK = disk.encryption?.type === 'EncryptionAtRestWithCustomerKey';
          break;
        }
        // case 'Microsoft.Sql/servers': {
        //   const { SqlManagementClient } = require('@azure/arm-sql');
        //   const client = new SqlManagementClient(credential, subscriptionId);
        //   const keys = await client.serverKeys.listByServer(rg, name);
        //   usesMMK = keys.some(k => k.serverKeyType === 'AzureKeyVault');
        //   break;
        // }
        case 'Microsoft.DocumentDB/databaseAccounts': {
          const { CosmosDBManagementClient } = require('@azure/arm-cosmosdb');
          const client = new CosmosDBManagementClient(credential, subscriptionId);
          const db = await client.databaseAccounts.get(rg, name);
          usesMMK = !!db.keyVaultKeyUri;
          break;
        }
        case 'Microsoft.KeyVault/vaults': {
          const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
          const client = new KeyVaultManagementClient(credential, subscriptionId);
          const kv = await client.vaults.get(rg, name);
          usesMMK = !!kv.properties?.enableSoftDelete;
          break;
        }
        // case 'Microsoft.Synapse/workspaces': {
        //   const { SynapseManagementClient } = require('@azure/arm-synapse');
        //   const client = new SynapseManagementClient(credential, subscriptionId);
        //   const ws = await client.workspaces.get(rg, name);
        //   usesMMK = !!ws.encryption?.cmk?.key;
        //   break;
        // }
        case 'Microsoft.AppConfiguration/configurationStores': {
          const { AppConfigurationManagementClient } = require('@azure/arm-appconfiguration');
          const client = new AppConfigurationManagementClient(credential, subscriptionId);
          const config = await client.configurationStores.get(rg, name);
          usesMMK = !!config.encryption?.keyVaultProperties?.keyIdentifier;
          break;
        }
        case 'Microsoft.ContainerRegistry/registries': {
          const { ContainerRegistryManagementClient } = require('@azure/arm-containerregistry');
          const client = new ContainerRegistryManagementClient(credential, subscriptionId);
          const reg = await client.registries.get(rg, name);
          usesMMK = !!reg.encryption?.keyVaultProperties?.keyIdentifier;
          break;
        }
        case 'Microsoft.MachineLearningServices/workspaces': {
          const { MachineLearningServicesManagementClient } = require('@azure/arm-machinelearningservices');
          const client = new MachineLearningServicesManagementClient(credential, subscriptionId);
          const ws = await client.workspaces.get(rg, name);
          usesMMK = !!ws.encryption?.keyVaultProperties?.keyIdentifier;
          break;
        }
        case 'Microsoft.CognitiveServices/accounts': {
          const { CognitiveServicesManagementClient } = require('@azure/arm-cognitiveservices');
          const client = new CognitiveServicesManagementClient(credential, subscriptionId);
          const acc = await client.accounts.get(rg, name);
          usesMMK = !!acc.encryption?.keyVaultProperties?.keyIdentifier;
          break;
        }
        case 'Microsoft.DBforPostgreSQL/servers': {
          const { PostgreSQLManagementClient } = require('@azure/arm-postgresql');
          const client = new PostgreSQLManagementClient(credential, subscriptionId);
          const server = await client.servers.get(rg, name);
          usesMMK = !!server.keyId;
          break;
        }
        case 'Microsoft.DBforMySQL/servers': {
          const { MySQLManagementClient } = require('@azure/arm-mysql');
          const client = new MySQLManagementClient(credential, subscriptionId);
          const server = await client.servers.get(rg, name);
          usesMMK = !!server.keyId;
          break;
        }
        case 'Microsoft.DBforMariaDB/servers': {
          const { MariaDBManagementClient } = require('@azure/arm-mariadb');
          const client = new MariaDBManagementClient(credential, subscriptionId);
          const server = await client.servers.get(rg, name);
          usesMMK = !!server.keyId;
          break;
        }
        // Add more implemented types here as needed
        default:
          break;
      }

      scanned.push({
        resourceType: type,
        name,
        remark: usesMMK ? 'Comply with Zero Trust' : 'Not Comply with Zero Trust'
      });

      if (!usesMMK) {
        violations.push({
          resourceType: type,
          name,
          id: res.id,
          reason: 'MMK not enabled'
        });
      }
    } catch (err) {
      console.error(`Error checking MMK for ${name}:`, err.message);
      violations.push({
        resourceType: type,
        name,
        id: res.id,
        reason: `Error: ${err.message}`
      });
      scanned.push({
        resourceType: type,
        name,
        remark: 'Error during check'
      });
    }
  }

  return {
    policy: 'Data encryption with MMK',
    status: violations.length ? 'FAIL' : 'PASS',
    reason: violations.length === 0
      ? 'All MMK-supported resources are correctly encrypted'
      : `${violations.length} resource(s) do not use MMK`,
    violatingResources: violations,
    scannedResources: scanned
  };
}

module.exports = checkEncryptionAtTransit;