const db = require('../db/queries');

const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function resolveTenant(discordId) {
  const cacheKey = `discord_${discordId}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.tenant;
  let tenant = await db.getTenantByDiscordId(discordId);
  if (!tenant) tenant = await db.getDefaultTenant();
  if (tenant) tenantCache.set(cacheKey, { tenant, timestamp: Date.now() });
  return tenant;
}

function clearCache() { tenantCache.clear(); }
function isBoss(tenant, discordId) { return tenant?.config?.boss_discord_id === discordId; }

module.exports = { resolveTenant, clearCache, isBoss };
