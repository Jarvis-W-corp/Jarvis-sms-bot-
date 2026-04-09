// workflows.js — Agent Chaining System
// Hawk → Ghost → Pulse pipelines. One agent's output feeds the next.
// Each workflow is a series of steps. Each step runs on a specific worker.

const { supabase } = require('../db/supabase');

// ═══ WORKFLOW TEMPLATES ═══
// Each step: { worker, title template, description template, task template }
// Templates use {{param}} for workflow params and {{prev_output}} for previous step output

const WORKFLOW_TEMPLATES = {
  solar_pipeline: {
    name: 'Solar Lead Pipeline',
    description: 'Hawk scrapes solar leads in CT → Ghost generates pitch deck + email sequence → Pulse enrolls leads and sends outreach',
    params: ['location', 'niche'],
    defaults: { location: 'Connecticut', niche: 'solar installers' },
    steps: [
      {
        worker: 'hawk',
        title: 'Scrape {{niche}} leads in {{location}}',
        description: 'Search for {{niche}} businesses in {{location}}. Find company names, phone numbers, emails, websites, and any useful info about each business. Return a structured list of at least 15 leads.',
        task: 'Find {{niche}} businesses in {{location}} with contact info. Use brave_search to find businesses, then compile a list with name, phone, email, website, and notes for each.',
      },
      {
        worker: 'ghost',
        title: 'Create pitch deck + email sequence for {{niche}}',
        description: 'Using the leads and market data from research, create: 1) A compelling pitch deck outline for selling solar/AI services to these businesses 2) A 5-7 step email/SMS outreach sequence. Previous research: {{prev_output}}',
        task: 'Create marketing materials for {{niche}} outreach in {{location}}. Use content_create to build a pitch deck and email sequence. Base it on this research: {{prev_output}}',
      },
      {
        worker: 'pulse',
        title: 'Enroll leads and launch outreach for {{niche}}',
        description: 'Take the leads found and the outreach sequence created, then: 1) Log all leads 2) Alert boss with a summary of the pipeline. Previous work: {{prev_output}}',
        task: 'Log the pipeline results and alert boss. Leads and outreach materials: {{prev_output}}. Use alert to notify boss with a summary, then store_finding to save the pipeline data.',
      },
    ],
  },

  medspa_pipeline: {
    name: 'Med Spa Competitor Pipeline',
    description: 'Hawk researches local med spa competitors → Ghost creates ad creatives + landing page copy → Pulse logs results and alerts boss',
    params: ['location', 'target_business'],
    defaults: { location: 'Connecticut', target_business: 'Luxe Level Aesthetics' },
    steps: [
      {
        worker: 'hawk',
        title: 'Research med spa competitors near {{location}}',
        description: 'Research med spa competitors in {{location}}. For each competitor, analyze: pricing, services offered, online reviews, ad presence, website quality, unique selling points, and weaknesses we can exploit for {{target_business}}.',
        task: 'Research med spa competitors in {{location}}. Use brave_search and competitor_analysis to find and analyze top med spas. Focus on pricing, services, reviews, and weaknesses.',
      },
      {
        worker: 'ghost',
        title: 'Create ad creatives + landing page for {{target_business}}',
        description: 'Using competitor research, create: 1) 3-5 ad creatives that beat competitors 2) Landing page copy that positions {{target_business}} as the best choice. Competitor intel: {{prev_output}}',
        task: 'Create winning ad creatives and landing page copy for {{target_business}} in {{location}}. Use generate_ad and write_landing_page. Competitor data: {{prev_output}}',
      },
      {
        worker: 'pulse',
        title: 'Log med spa pipeline results and alert boss',
        description: 'Compile the competitor research and marketing materials into a report. Alert boss with key findings and recommended next steps. Full pipeline output: {{prev_output}}',
        task: 'Save the med spa pipeline results and alert boss. Use store_finding to save key competitor intel, then alert boss channel with a summary. Data: {{prev_output}}',
      },
    ],
  },

  ai_workforce_pipeline: {
    name: 'AI Workforce Outreach Pipeline',
    description: 'Hawk researches target businesses → Ghost creates proposal + outreach sequence → Pulse sends outreach',
    params: ['niche', 'location', 'service'],
    defaults: { niche: 'small businesses', location: 'Connecticut', service: 'AI automation and chatbots' },
    steps: [
      {
        worker: 'hawk',
        title: 'Research {{niche}} for AI workforce sales in {{location}}',
        description: 'Find {{niche}} in {{location}} that could benefit from {{service}}. Look for businesses with: high customer volume, repetitive processes, outdated websites, no chatbot, manual booking systems. These are prime AI automation targets.',
        task: 'Research {{niche}} in {{location}} that need {{service}}. Use brave_search to find businesses, then analyze which ones are best targets for AI services.',
      },
      {
        worker: 'ghost',
        title: 'Create AI workforce proposal + outreach for {{niche}}',
        description: 'Create: 1) A tailored proposal showing how {{service}} saves these businesses time and money 2) A 5-step outreach sequence (SMS + email) with personalization. Target research: {{prev_output}}',
        task: 'Create a sales proposal and outreach sequence for selling {{service}} to {{niche}}. Use content_create for the proposal and email templates. Research data: {{prev_output}}',
      },
      {
        worker: 'pulse',
        title: 'Launch AI workforce outreach campaign',
        description: 'Take the leads and outreach materials and: 1) Store the proposals and sequences 2) Alert boss with the campaign summary and recommended next steps. Pipeline data: {{prev_output}}',
        task: 'Finalize the AI workforce outreach campaign. Use store_finding to save proposals, then alert boss with campaign summary. Data: {{prev_output}}',
      },
    ],
  },

  content_pipeline: {
    name: 'Content Creation Pipeline',
    description: 'Hawk researches trending topics in a niche → Ghost creates content (posts, ads, scripts) → Pulse schedules/publishes',
    params: ['niche', 'platforms', 'content_type'],
    defaults: { niche: 'fitness tech', platforms: 'Instagram, TikTok', content_type: 'posts and short-form video scripts' },
    steps: [
      {
        worker: 'hawk',
        title: 'Research trending topics in {{niche}}',
        description: 'Find what is trending in {{niche}} right now. Look for: viral topics, popular hashtags, competitor content that is performing well, audience pain points, content gaps we can fill. Focus on {{platforms}}.',
        task: 'Research trending topics and content opportunities in {{niche}} for {{platforms}}. Use brave_search to find trends, viral content, and audience interests.',
      },
      {
        worker: 'ghost',
        title: 'Create {{content_type}} for {{niche}}',
        description: 'Using trending research, create a batch of {{content_type}} for {{platforms}}. Each piece should be ready to post. Include hooks, captions, hashtags, and posting notes. Trending data: {{prev_output}}',
        task: 'Create {{content_type}} for {{niche}} on {{platforms}}. Use content_create for each piece. Base on these trends: {{prev_output}}',
      },
      {
        worker: 'pulse',
        title: 'Log content batch and alert boss',
        description: 'Compile all created content into an organized batch. Store it and alert boss with the content calendar and posting schedule. Content batch: {{prev_output}}',
        task: 'Save the content batch and notify boss. Use store_finding to save content pieces, then alert boss with a content calendar summary. Content: {{prev_output}}',
      },
    ],
  },
};

// ═══ WORKFLOW OPERATIONS ═══

// Create a new workflow instance in DB
async function createWorkflow(templateId, params) {
  const template = WORKFLOW_TEMPLATES[templateId];
  if (!template) throw new Error('Unknown workflow template: ' + templateId);

  // Merge defaults with provided params
  const mergedParams = { ...template.defaults, ...params };

  const id = 'wf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  try {
    const { error } = await supabase.from('workflows').insert({
      id,
      template_id: templateId,
      name: template.name,
      params: mergedParams,
      total_steps: template.steps.length,
      current_step: 0,
      status: 'pending', // pending → running → completed → failed
      created_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[WORKFLOW] Create error:', error.message);
      // If table doesn't exist, fall back to in-memory tracking
      return { id, templateId, name: template.name, params: mergedParams, totalSteps: template.steps.length, currentStep: 0, status: 'pending', _inMemory: true };
    }
  } catch (e) {
    console.error('[WORKFLOW] Create error (catch):', e.message);
    return { id, templateId, name: template.name, params: mergedParams, totalSteps: template.steps.length, currentStep: 0, status: 'pending', _inMemory: true };
  }

  return { id, templateId, name: template.name, params: mergedParams, totalSteps: template.steps.length, currentStep: 0, status: 'pending' };
}

// Update workflow status
async function updateWorkflow(workflowId, updates) {
  try {
    await supabase.from('workflows').update(updates).eq('id', workflowId);
  } catch (e) {
    console.error('[WORKFLOW] Update error:', e.message);
  }
}

// Get workflow by ID
async function getWorkflow(workflowId) {
  try {
    const { data } = await supabase.from('workflows').select('*').eq('id', workflowId).single();
    return data;
  } catch (e) {
    return null;
  }
}

// List all workflows (recent)
async function listWorkflows(limit) {
  try {
    const { data } = await supabase.from('workflows').select('*')
      .order('created_at', { ascending: false }).limit(limit || 20);
    return data || [];
  } catch (e) {
    return [];
  }
}

// Get workflow status with step details
async function getWorkflowStatus(workflowId) {
  try {
    const workflow = await getWorkflow(workflowId);
    if (!workflow) return null;

    // Get all jobs for this workflow
    const { data: jobs } = await supabase.from('agent_jobs').select('*')
      .eq('workflow_id', workflowId)
      .order('step_index', { ascending: true });

    const template = WORKFLOW_TEMPLATES[workflow.template_id];
    const steps = (template?.steps || []).map((step, i) => {
      const job = (jobs || []).find(j => j.step_index === i);
      return {
        index: i,
        worker: step.worker,
        title: renderTemplate(step.title, workflow.params),
        status: job ? job.status : (i < workflow.current_step ? 'completed' : 'pending'),
        job_id: job?.id || null,
        result: job?.output?.result ? String(job.output.result).substring(0, 500) : null,
        started_at: job?.started_at || null,
        completed_at: job?.completed_at || null,
      };
    });

    return {
      id: workflow.id,
      name: workflow.name,
      template_id: workflow.template_id,
      params: workflow.params,
      status: workflow.status,
      total_steps: workflow.total_steps,
      current_step: workflow.current_step,
      steps,
      created_at: workflow.created_at,
      completed_at: workflow.completed_at,
    };
  } catch (e) {
    console.error('[WORKFLOW] Status error:', e.message);
    return null;
  }
}

// Render a template string with params
function renderTemplate(template, params) {
  if (!template) return '';
  let result = template;
  for (const [key, value] of Object.entries(params || {})) {
    result = result.replace(new RegExp('\\{\\{' + key + '\\}\\}', 'g'), value || '');
  }
  return result;
}

// Create the first job in a workflow (kicks it off)
async function startWorkflow(templateId, params) {
  const crew = require('./crew');
  const workflow = await createWorkflow(templateId, params);
  const template = WORKFLOW_TEMPLATES[templateId];

  // Update status to running
  await updateWorkflow(workflow.id, { status: 'running' });

  // Create first step job
  const step = template.steps[0];
  const title = renderTemplate(step.title, workflow.params);
  const description = renderTemplate(step.description, workflow.params);

  const jobId = await crew.createJob(step.worker, title, description, {
    workflow_id: workflow.id,
    step_index: 0,
    workflow_params: workflow.params,
    task: renderTemplate(step.task, workflow.params),
  }, 7); // Higher priority for workflow jobs

  // Tag the job with workflow info
  try {
    await supabase.from('agent_jobs').update({
      workflow_id: workflow.id,
      step_index: 0,
    }).eq('id', jobId);
  } catch (e) {
    console.error('[WORKFLOW] Tag job error:', e.message);
  }

  console.log('[WORKFLOW] Started ' + template.name + ' (workflow: ' + workflow.id + ', first job: ' + jobId + ')');
  return { workflowId: workflow.id, jobId, name: template.name, totalSteps: template.steps.length };
}

// Advance a workflow to the next step (called after a job completes)
async function advanceWorkflow(workflowId, completedStepIndex, stepOutput) {
  const crew = require('./crew');
  const workflow = await getWorkflow(workflowId);
  if (!workflow) {
    console.error('[WORKFLOW] Cannot advance — workflow not found: ' + workflowId);
    return null;
  }

  const template = WORKFLOW_TEMPLATES[workflow.template_id];
  if (!template) {
    console.error('[WORKFLOW] Cannot advance — template not found: ' + workflow.template_id);
    return null;
  }

  const nextStepIndex = completedStepIndex + 1;

  // Check if workflow is done
  if (nextStepIndex >= template.steps.length) {
    await updateWorkflow(workflowId, {
      status: 'completed',
      current_step: template.steps.length,
      completed_at: new Date().toISOString(),
    });
    console.log('[WORKFLOW] ' + template.name + ' COMPLETED (' + workflowId + ')');
    return { done: true, workflowId };
  }

  // Create next step job
  const step = template.steps[nextStepIndex];
  const params = { ...workflow.params, prev_output: (stepOutput || '').substring(0, 3000) };
  const title = renderTemplate(step.title, params);
  const description = renderTemplate(step.description, params);

  const jobId = await crew.createJob(step.worker, title, description, {
    workflow_id: workflowId,
    step_index: nextStepIndex,
    workflow_params: workflow.params,
    prev_output: (stepOutput || '').substring(0, 3000),
    task: renderTemplate(step.task, params),
  }, 7);

  // Tag the job with workflow info
  try {
    await supabase.from('agent_jobs').update({
      workflow_id: workflowId,
      step_index: nextStepIndex,
    }).eq('id', jobId);
  } catch (e) {
    console.error('[WORKFLOW] Tag job error:', e.message);
  }

  // Update workflow progress
  await updateWorkflow(workflowId, { current_step: nextStepIndex });

  console.log('[WORKFLOW] ' + template.name + ' step ' + (nextStepIndex + 1) + '/' + template.steps.length + ' started (job: ' + jobId + ')');
  return { done: false, workflowId, nextStep: nextStepIndex, jobId };
}

// Get list of available workflow templates
function getTemplates() {
  return Object.entries(WORKFLOW_TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
    params: t.params,
    defaults: t.defaults,
    steps: t.steps.length,
  }));
}

module.exports = {
  WORKFLOW_TEMPLATES,
  createWorkflow,
  updateWorkflow,
  getWorkflow,
  listWorkflows,
  getWorkflowStatus,
  startWorkflow,
  advanceWorkflow,
  getTemplates,
  renderTemplate,
};
