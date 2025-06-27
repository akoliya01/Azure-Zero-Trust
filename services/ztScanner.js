const { ClientSecretCredential } = require('@azure/identity');

const checkPublicIPs = require('./controls/checkPublicIPs');
const checkPaaSPrivateAccess = require('./controls/checkPaaSPrivateAccess');
const checkNSGDNS = require('./controls/checkNSGDNS');
const checkDiagnostics = require('./controls/checkDiagnostics');
const checkSQLAuditing = require('./controls/checkSQLAuditing');
const checkVnetPeering = require('./controls/checkVnetPeering');
const checkSubnetsNSG = require('./controls/checkSubnetsNSG');
const checkEncryptionAtTransit = require('./controls/checkEncryptionAtTransit');
const checkStorageAccountSecurity = require('./controls/checkStorageAccountSecurity');
const checkDiskSecurity = require('./controls/checkDiskSecurity');

async function runZTChecks(subscriptionId, credential, env, clientId, clientSecret) {
  const results = [];
  const checks = [
    checkPublicIPs,
    checkPaaSPrivateAccess,
    checkDiagnostics,
    checkStorageAccountSecurity,
    checkDiskSecurity,
    checkNSGDNS,
    checkSQLAuditing,
    checkVnetPeering,
    checkSubnetsNSG,
    checkEncryptionAtTransit
  ];

  for (const check of checks) {
    try {
      const result = await check(subscriptionId, credential, env);
      results.push(result);
    } catch (err) {
      results.push({
        policy: check.name,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  return results;
}

module.exports = runZTChecks;
