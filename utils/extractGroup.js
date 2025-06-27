function extractResourceGroupFromId(resourceId) {
  const match = resourceId.match(/resourceGroups\/([^\/]*)\//i);
  return match ? match[1] : null;
}

module.exports = extractResourceGroupFromId;