const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://jarvis-sms-bot.onrender.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T | null> {
  try {
    const url = new URL(path, API_BASE);
    url.searchParams.set('key', API_KEY);

    const res = await fetch(url.toString(), {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!res.ok) {
      console.error(`API ${opts.method || 'GET'} ${path} failed: ${res.status}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    console.error(`API ${opts.method || 'GET'} ${path} error:`, err);
    return null;
  }
}

// ── Types ──────────────────────────────────────────────

export interface HealthData {
  status: string;
  uptime?: number;
  version?: string;
  agents?: Record<string, string>;
  [key: string]: unknown;
}

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  source?: string;
  score?: number;
  status?: string;
  created_at?: string;
  activities?: Array<{ type: string; detail: string; ts: string }>;
  [key: string]: unknown;
}

export interface LeadStats {
  total: number;
  hot: number;
  warm: number;
  cold: number;
  converted: number;
  [key: string]: unknown;
}

export interface CrewMember {
  id: string;
  name: string;
  status: string;
  tasksCompleted?: number;
  tasksFailed?: number;
  successRate?: number;
  currentJob?: string;
  jobId?: string;
  [key: string]: unknown;
}

export interface CostData {
  agents: Record<string, number>;
  total24h: number;
  breakdown?: Array<{ agent: string; cost: number }>;
  [key: string]: unknown;
}

export interface Workflow {
  id: string;
  template: string;
  status: string;
  step?: number;
  totalSteps?: number;
  startedAt?: string;
  [key: string]: unknown;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  steps?: string[];
  [key: string]: unknown;
}

export interface Task {
  id: string;
  type: string;
  status: string;
  agent?: string;
  detail?: string;
  startedAt?: string;
  [key: string]: unknown;
}

export interface Appointment {
  id: string;
  lead?: string;
  date: string;
  time?: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

export interface Sequence {
  id: string;
  name: string;
  enrolled?: number;
  completed?: number;
  status?: string;
  [key: string]: unknown;
}

export interface ProactiveStatus {
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  [key: string]: unknown;
}

export interface ProgressData {
  tasks?: number;
  completed?: number;
  revenue?: number;
  [key: string]: unknown;
}

export interface ChatResponse {
  reply: string;
  [key: string]: unknown;
}

export interface VoiceResponse {
  audioUrl?: string;
  text?: string;
  [key: string]: unknown;
}

export interface LeadFilters {
  status?: string;
  source?: string;
  minScore?: number;
  [key: string]: unknown;
}

// ── API Functions ──────────────────────────────────────

export async function fetchHealth(): Promise<HealthData | null> {
  return request<HealthData>('/dashboard/api/health');
}

export async function fetchLeads(filters?: LeadFilters): Promise<Lead[] | null> {
  let path = '/dashboard/api/leads';
  if (filters) {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.source) params.set('source', filters.source);
    if (filters.minScore) params.set('minScore', String(filters.minScore));
    const qs = params.toString();
    if (qs) path += `?${qs}`;
  }
  return request<Lead[]>(path);
}

export async function fetchLeadStats(): Promise<LeadStats | null> {
  return request<LeadStats>('/dashboard/api/leads/stats');
}

export async function fetchCrew(): Promise<CrewMember[] | null> {
  return request<CrewMember[]>('/dashboard/api/crew');
}

export async function fetchCosts(hours?: number): Promise<CostData | null> {
  const path = hours ? `/dashboard/api/costs?hours=${hours}` : '/dashboard/api/costs';
  return request<CostData>(path);
}

export async function fetchWorkflows(): Promise<{ active: Workflow[]; templates: WorkflowTemplate[] } | null> {
  return request<{ active: Workflow[]; templates: WorkflowTemplate[] }>('/dashboard/api/workflows');
}

export async function fetchWorkflowHistory(): Promise<Workflow[] | null> {
  return request<Workflow[]>('/dashboard/api/workflow/history');
}

export async function startWorkflow(template: string, params: Record<string, unknown>): Promise<Workflow | null> {
  return request<Workflow>('/dashboard/api/workflow/start', {
    method: 'POST',
    body: { template, ...params },
  });
}

export async function fetchActiveTasks(): Promise<Task[] | null> {
  return request<Task[]>('/dashboard/api/tasks/active');
}

export async function fetchAppointments(): Promise<Appointment[] | null> {
  return request<Appointment[]>('/dashboard/api/appointments');
}

export async function fetchSequences(): Promise<Sequence[] | null> {
  return request<Sequence[]>('/dashboard/api/sequences');
}

export async function fetchProactiveStatus(): Promise<ProactiveStatus | null> {
  return request<ProactiveStatus>('/dashboard/api/proactive/status');
}

export async function fetchProgress(): Promise<ProgressData | null> {
  return request<ProgressData>('/dashboard/api/progress');
}

export async function sendChat(text: string): Promise<ChatResponse | null> {
  return request<ChatResponse>('/dashboard/api/chat', {
    method: 'POST',
    body: { text },
  });
}

export async function sendVoice(text: string): Promise<VoiceResponse | null> {
  return request<VoiceResponse>('/dashboard/api/voice', {
    method: 'POST',
    body: { text },
  });
}

export async function killJob(jobId: string): Promise<{ success: boolean } | null> {
  return request<{ success: boolean }>(`/dashboard/api/crew/kill/${jobId}`, { method: 'POST' });
}

export async function killAllJobs(): Promise<{ success: boolean } | null> {
  return request<{ success: boolean }>('/dashboard/api/crew/kill-all', { method: 'POST' });
}

export async function killTask(taskId: string): Promise<{ success: boolean } | null> {
  return request<{ success: boolean }>(`/dashboard/api/task/${taskId}/kill`, { method: 'POST' });
}

export async function dialLead(leadId: string, goal?: string): Promise<{ success: boolean; callId?: string } | null> {
  return request<{ success: boolean; callId?: string }>('/dashboard/api/dialer/call', {
    method: 'POST',
    body: { leadId, ...(goal ? { goal } : {}) },
  });
}

export async function launchBusiness(slug: string): Promise<{ success: boolean } | null> {
  return request<{ success: boolean }>('/dashboard/api/business/launch', {
    method: 'POST',
    body: { slug },
  });
}
