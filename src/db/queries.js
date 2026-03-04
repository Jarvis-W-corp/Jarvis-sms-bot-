const { supabase } = require('./supabase');

async function getTenantByDiscordId(discordId) {
  const { data } = await supabase
    .from('tenants').select('*').eq('active', true)
    .contains('config', { boss_discord_id: discordId }).single();
  return data;
}

async function getDefaultTenant() {
  const { data } = await supabase
    .from('tenants').select('*').eq('plan', 'owner').eq('active', true).single();
  return data;
}

async function getTenantById(tenantId) {
  const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
  return data;
}

async function getAllActiveTenants() {
  const { data } = await supabase.from('tenants').select('*').eq('active', true);
  return data || [];
}

async function getOrCreateUser(tenantId, platformId, platform, name) {
  const { data: existing } = await supabase
    .from('users').select('*').eq('tenant_id', tenantId).eq('platform_id', platformId).single();
  if (existing) {
    await supabase.from('users').update({
      last_seen: new Date().toISOString(),
      message_count: (existing.message_count || 0) + 1,
      ...(name && { name }),
    }).eq('id', existing.id);
    return { ...existing, message_count: (existing.message_count || 0) + 1 };
  }
  const { data: newUser } = await supabase.from('users').insert({
    tenant_id: tenantId, platform_id: platformId, platform, name: name || null, message_count: 1,
  }).select().single();
  return newUser;
}

async function getAllUsers(tenantId, limit = 20) {
  const { data } = await supabase.from('users').select('*')
    .eq('tenant_id', tenantId).order('last_seen', { ascending: false }).limit(limit);
  return data || [];
}

async function deleteUser(tenantId, platformId) {
  await supabase.from('conversations').delete().eq('tenant_id', tenantId).eq('user_id', platformId);
  await supabase.from('memories').delete().eq('tenant_id', tenantId).eq('source', platformId);
  const { data } = await supabase.from('users').delete()
    .eq('tenant_id', tenantId).eq('platform_id', platformId).select();
  return data?.length > 0;
}

async function saveConversation(tenantId, platform, userId, role, message, metadata = {}) {
  const { data } = await supabase.from('conversations').insert({
    tenant_id: tenantId, platform, user_id: userId, role, message, metadata,
  }).select().single();
  return data;
}

async function getRecentConversations(tenantId, userId, limit = 20) {
  const { data } = await supabase.from('conversations').select('role, message, created_at')
    .eq('tenant_id', tenantId).eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(limit);
  return (data || []).map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.message,
  }));
}

async function getRecentRawConversations(tenantId, userId, limit = 20) {
  const { data } = await supabase.from('conversations').select('*')
    .eq('tenant_id', tenantId).eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(limit);
  return data || [];
}

async function getConversationCount(tenantId) {
  const { count } = await supabase.from('conversations')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return count || 0;
}

async function saveMemory(tenantId, category, content, embedding, importance = 5, source = 'system') {
  const { data } = await supabase.from('memories').insert({
    tenant_id: tenantId, category, content, embedding, importance, source,
  }).select().single();
  return data;
}

async function getFactMemories(tenantId) {
  const { data } = await supabase.from('memories').select('content, importance')
    .eq('tenant_id', tenantId).eq('category', 'fact').order('importance', { ascending: false });
  return data || [];
}

async function getOpenTasks(tenantId) {
  const { data } = await supabase.from('memories').select('content, importance, created_at')
    .eq('tenant_id', tenantId).eq('category', 'task')
    .order('importance', { ascending: false }).limit(10);
  return data || [];
}

async function getRecentDecisions(tenantId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from('memories').select('content, created_at')
    .eq('tenant_id', tenantId).eq('category', 'decision')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(10);
  return data || [];
}

async function searchMemories(tenantId, embedding, count = 10, threshold = 0.7) {
  const { data } = await supabase.rpc('match_memories', {
    query_embedding: embedding, match_tenant_id: tenantId,
    match_count: count, match_threshold: threshold,
  });
  return data || [];
}

async function getMemoryCount(tenantId) {
  const { count } = await supabase.from('memories')
    .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  return count || 0;
}

async function getMemoriesByCategory(tenantId) {
  const categories = ['fact', 'summary', 'conversation', 'task', 'decision', 'training'];
  const counts = {};
  for (const cat of categories) {
    const { count } = await supabase.from('memories')
      .select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('category', cat);
    counts[cat] = count || 0;
  }
  return counts;
}

async function getStats(tenantId) {
  const [userCount, msgCount, memCount, memCats] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    getConversationCount(tenantId),
    getMemoryCount(tenantId),
    getMemoriesByCategory(tenantId),
  ]);
  return { users: userCount.count || 0, messages: msgCount, memories: memCount, memoryBreakdown: memCats };
}

module.exports = {
  getTenantByDiscordId, getDefaultTenant, getTenantById, getAllActiveTenants,
  getOrCreateUser, getAllUsers, deleteUser,
  saveConversation, getRecentConversations, getRecentRawConversations, getConversationCount,
  saveMemory, getFactMemories, getOpenTasks, getRecentDecisions, searchMemories, getMemoryCount, getMemoriesByCategory,
  getStats,
};
