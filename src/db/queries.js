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
  let query = supabase.from('conversations').select('*').eq('tenant_id', tenantId);
  if (userId) query = query.eq('user_id', userId);
  const { data } = await query.order('created_at', { ascending: false }).limit(limit);
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
  const results = await Promise.all(
    categories.map(cat =>
      supabase.from('memories').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).eq('category', cat)
        .then(({ count }) => [cat, count || 0])
    )
  );
  return Object.fromEntries(results);
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

// ── Agent Tasks ──

async function createAgentTask(tenantId, task) {
  const { data } = await supabase.from('agent_tasks').insert({
    tenant_id: tenantId,
    type: task.type || 'general',
    title: task.title,
    description: task.description || null,
    status: task.status || 'pending',
    priority: task.priority || 5,
    result: task.result || null,
    tool_log: task.tool_log || [],
    parent_task_id: task.parent_task_id || null,
    cycle_id: task.cycle_id || null,
    started_at: task.started_at || null,
    completed_at: task.completed_at || null,
  }).select().single();
  return data;
}

async function updateAgentTask(taskId, updates) {
  const { data } = await supabase.from('agent_tasks')
    .update(updates)
    .eq('id', taskId)
    .select().single();
  return data;
}

async function getAgentTasks(tenantId, status, limit = 10) {
  let query = supabase.from('agent_tasks').select('*')
    .eq('tenant_id', tenantId);
  if (status) query = query.eq('status', status);
  const { data } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentAgentCycles(tenantId, limit = 10) {
  const { data } = await supabase.from('agent_tasks').select('*')
    .eq('tenant_id', tenantId)
    .eq('type', 'cycle')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ── API Cost Tracking ──

async function logApiCost(tenantId, agent, model, inputTokens, outputTokens, tool, jobId) {
  // Pricing per 1M tokens (Sonnet 4 as of 2026)
  const pricing = {
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'whisper-1': { input: 0.006, output: 0 }, // per second, approximated
  };
  const p = pricing[model] || { input: 3, output: 15 };
  const cost = ((inputTokens || 0) * p.input + (outputTokens || 0) * p.output) / 1_000_000;

  const { data } = await supabase.from('api_costs').insert({
    tenant_id: tenantId,
    agent: agent || 'jarvis',
    model: model || 'claude-sonnet-4-20250514',
    input_tokens: inputTokens || 0,
    output_tokens: outputTokens || 0,
    cost_usd: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
    tool: tool || null,
    job_id: jobId || null,
  }).select().single();
  return data;
}

async function getApiCosts(tenantId, since, agent) {
  let query = supabase.from('api_costs').select('*');
  if (tenantId) query = query.eq('tenant_id', tenantId);
  if (since) query = query.gte('created_at', since);
  if (agent) query = query.eq('agent', agent);
  const { data } = await query.order('created_at', { ascending: false }).limit(200);
  return data || [];
}

async function getApiCostSummary(tenantId, since) {
  const costs = await getApiCosts(tenantId, since);
  const byAgent = {};
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  costs.forEach(c => {
    const a = c.agent || 'jarvis';
    if (!byAgent[a]) byAgent[a] = { cost: 0, calls: 0, input_tokens: 0, output_tokens: 0 };
    byAgent[a].cost += c.cost_usd || 0;
    byAgent[a].calls++;
    byAgent[a].input_tokens += c.input_tokens || 0;
    byAgent[a].output_tokens += c.output_tokens || 0;
    totalCost += c.cost_usd || 0;
    totalInput += c.input_tokens || 0;
    totalOutput += c.output_tokens || 0;
  });
  return { total_cost: Math.round(totalCost * 100) / 100, total_calls: costs.length, total_input_tokens: totalInput, total_output_tokens: totalOutput, by_agent: byAgent };
}

// ── Processed File Tracking (idempotency) ──

async function markFileProcessed(tenantId, fileId, fileName, source, result) {
  const { data } = await supabase.from('processed_files').upsert({
    tenant_id: tenantId,
    file_id: fileId,
    file_name: fileName || null,
    source: source || 'drive',
    result_summary: (result || '').substring(0, 500),
    processed_at: new Date().toISOString(),
  }, { onConflict: 'tenant_id,file_id' }).select().single();
  return data;
}

async function isFileProcessed(tenantId, fileId) {
  const { data } = await supabase.from('processed_files').select('id, processed_at')
    .eq('tenant_id', tenantId).eq('file_id', fileId).single();
  return !!data;
}

async function getProcessedFiles(tenantId, source, limit = 50) {
  let query = supabase.from('processed_files').select('*').eq('tenant_id', tenantId);
  if (source) query = query.eq('source', source);
  const { data } = await query.order('processed_at', { ascending: false }).limit(limit);
  return data || [];
}

// ── CRM: Leads ──

async function createLead(tenantId, data) {
  try {
    const row = {
      tenant_id: tenantId,
      name: data.name || null,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company || null,
      source: data.source || 'api',
      location: data.location || null,
      score: data.score || null,
      score_reason: data.score_reason || null,
      status: data.status || 'new',
      tags: data.tags || [],
      niche: data.niche || null,
      meta: data.meta || {},
    };
    const { data: lead, error } = await supabase.from('leads')
      .upsert(row, { onConflict: 'tenant_id,email' })
      .select().single();
    if (error) { console.error('[CRM] createLead error:', error.message); return null; }
    return lead;
  } catch (err) {
    console.error('[CRM] createLead error:', err.message);
    return null;
  }
}

async function updateLead(leadId, updates) {
  try {
    const { data, error } = await supabase.from('leads')
      .update(updates).eq('id', leadId).select().single();
    if (error) { console.error('[CRM] updateLead error:', error.message); return null; }
    return data;
  } catch (err) {
    console.error('[CRM] updateLead error:', err.message);
    return null;
  }
}

async function getLead(tenantId, emailOrId) {
  try {
    // Try by UUID first
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(emailOrId)) {
      const { data } = await supabase.from('leads').select('*')
        .eq('tenant_id', tenantId).eq('id', emailOrId).single();
      if (data) return data;
    }
    // Try by email
    const { data } = await supabase.from('leads').select('*')
      .eq('tenant_id', tenantId).eq('email', emailOrId).single();
    return data || null;
  } catch (err) {
    console.error('[CRM] getLead error:', err.message);
    return null;
  }
}

async function getLeads(tenantId, filters = {}) {
  try {
    let query = supabase.from('leads').select('*').eq('tenant_id', tenantId);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.score_min) query = query.gte('score', filters.score_min);
    if (filters.niche) query = query.eq('niche', filters.niche);
    if (filters.source) query = query.eq('source', filters.source);
    const { data } = await query
      .order('created_at', { ascending: false })
      .limit(filters.limit || 50);
    return data || [];
  } catch (err) {
    console.error('[CRM] getLeads error:', err.message);
    return [];
  }
}

async function getLeadsByScore(tenantId, minScore, status, limit = 20) {
  try {
    let query = supabase.from('leads').select('*')
      .eq('tenant_id', tenantId).gte('score', minScore);
    if (status) query = query.eq('status', status);
    const { data } = await query
      .order('score', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (err) {
    console.error('[CRM] getLeadsByScore error:', err.message);
    return [];
  }
}

// ── CRM: Activities ──

async function logActivity(tenantId, leadId, type, data = {}) {
  try {
    const { data: activity, error } = await supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type,
      data,
    }).select().single();
    if (error) { console.error('[CRM] logActivity error:', error.message); return null; }
    return activity;
  } catch (err) {
    console.error('[CRM] logActivity error:', err.message);
    return null;
  }
}

async function getLeadActivities(leadId, limit = 50) {
  try {
    const { data } = await supabase.from('activities').select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch (err) {
    console.error('[CRM] getLeadActivities error:', err.message);
    return [];
  }
}

// ── CRM: Appointments ──

async function createAppointment(tenantId, leadId, scheduledAt, notes) {
  try {
    const { data, error } = await supabase.from('appointments').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      scheduled_at: scheduledAt,
      notes: notes || null,
      status: 'scheduled',
    }).select().single();
    if (error) { console.error('[CRM] createAppointment error:', error.message); return null; }

    // Log activity
    await supabase.from('activities').insert({
      tenant_id: tenantId,
      lead_id: leadId,
      type: 'appointment_booked',
      data: { appointment_id: data.id, scheduled_at: scheduledAt },
    });

    return data;
  } catch (err) {
    console.error('[CRM] createAppointment error:', err.message);
    return null;
  }
}

async function updateAppointment(appointmentId, updates) {
  try {
    const { data, error } = await supabase.from('appointments')
      .update(updates).eq('id', appointmentId).select().single();
    if (error) { console.error('[CRM] updateAppointment error:', error.message); return null; }
    return data;
  } catch (err) {
    console.error('[CRM] updateAppointment error:', err.message);
    return null;
  }
}

async function getUpcomingAppointments(tenantId, hours = 24) {
  try {
    const now = new Date().toISOString();
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('appointments').select('*, leads(name, email, phone, company)')
      .eq('tenant_id', tenantId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now)
      .lte('scheduled_at', until)
      .order('scheduled_at', { ascending: true });
    return data || [];
  } catch (err) {
    console.error('[CRM] getUpcomingAppointments error:', err.message);
    return [];
  }
}

// ── CRM: Stats ──

async function getLeadStats(tenantId) {
  try {
    const { data: leads } = await supabase.from('leads').select('status, score, source')
      .eq('tenant_id', tenantId);
    if (!leads || !leads.length) return { total: 0, by_status: {}, avg_score: 0, by_source: {} };

    const byStatus = {};
    const bySource = {};
    let scoreSum = 0;
    let scoreCount = 0;

    leads.forEach(l => {
      byStatus[l.status] = (byStatus[l.status] || 0) + 1;
      if (l.source) bySource[l.source] = (bySource[l.source] || 0) + 1;
      if (l.score) { scoreSum += l.score; scoreCount++; }
    });

    return {
      total: leads.length,
      by_status: byStatus,
      avg_score: scoreCount ? Math.round((scoreSum / scoreCount) * 10) / 10 : 0,
      by_source: bySource,
    };
  } catch (err) {
    console.error('[CRM] getLeadStats error:', err.message);
    return { total: 0, by_status: {}, avg_score: 0, by_source: {} };
  }
}

module.exports = {
  getTenantByDiscordId, getDefaultTenant, getTenantById, getAllActiveTenants,
  getOrCreateUser, getAllUsers, deleteUser,
  saveConversation, getRecentConversations, getRecentRawConversations, getConversationCount,
  saveMemory, getFactMemories, getOpenTasks, getRecentDecisions, searchMemories, getMemoryCount, getMemoriesByCategory,
  getStats,
  createAgentTask, updateAgentTask, getAgentTasks, getRecentAgentCycles,
  logApiCost, getApiCosts, getApiCostSummary,
  markFileProcessed, isFileProcessed, getProcessedFiles,
  // CRM v3
  createLead, updateLead, getLead, getLeads, getLeadsByScore,
  logActivity, getLeadActivities,
  createAppointment, updateAppointment, getUpcomingAppointments,
  getLeadStats,
};
