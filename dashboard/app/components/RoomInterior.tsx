'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCrew,
  fetchLeads,
  fetchCosts,
  fetchWorkflows,
  startWorkflow,
  killJob,
  sendChat,
  type Lead,
} from '@/lib/api';

interface RoomInteriorProps {
  roomId: string;
  roomName: string;
  roomColor: string;
  onClose: () => void;
}

interface AgentInfo {
  id: string;
  name: string;
  status: string;
  currentJob?: string;
  jobId?: string;
  tasksCompleted?: number;
  tasksFailed?: number;
  uptime?: string;
}

interface ActivityItem {
  id: string;
  text: string;
  ts: string;
  type: 'task' | 'error' | 'info';
}

interface ApiConnection {
  name: string;
  connected: boolean;
}

const ROOM_APIS: Record<string, ApiConnection[]> = {
  command: [
    { name: 'Claude API', connected: true },
    { name: 'Discord Bot', connected: true },
    { name: 'Twilio SMS', connected: true },
  ],
  research: [
    { name: 'Brave Search', connected: true },
    { name: 'Supabase', connected: true },
    { name: 'Web Scraper', connected: true },
  ],
  marketing: [
    { name: 'Meta Ads API', connected: false },
    { name: 'Content Engine', connected: true },
    { name: 'Email SMTP', connected: true },
  ],
  ops: [
    { name: 'Render Deploy', connected: true },
    { name: 'GitHub API', connected: true },
    { name: 'Supabase', connected: true },
  ],
  etsy: [
    { name: 'Etsy API', connected: true },
    { name: 'Image Gen', connected: true },
    { name: 'Pricing Engine', connected: true },
  ],
  printify: [
    { name: 'Printify API', connected: true },
    { name: 'Design Engine', connected: true },
    { name: 'Mockup Gen', connected: true },
  ],
  solar: [
    { name: 'Enerflo CRM', connected: false },
    { name: 'Bland Dialer', connected: true },
    { name: 'Lead Scraper', connected: true },
  ],
};

const ROOM_WORKFLOWS: Record<string, string[]> = {
  command: ['Full System Health Check', 'Daily Briefing', 'Reset All Agents'],
  research: ['Scrape 50 Leads', 'Competitor Analysis', 'Market Research'],
  marketing: ['Generate Ad Campaign', 'Email Sequence Builder', 'Social Media Blast'],
  ops: ['Deploy to Production', 'Database Backup', 'Run Diagnostics'],
  etsy: ['Create New Listing', 'Optimize Prices', 'Refresh All Listings'],
  printify: ['New Product Design', 'Sync Inventory', 'Generate Mockups'],
  solar: ['Scrape Solar Leads CT', 'Launch Dialer Campaign', 'Send Follow-ups'],
};

export default function RoomInterior({ roomId, roomName, roomColor, onClose }: RoomInteriorProps) {
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [taskInput, setTaskInput] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isBusiness = ['etsy', 'printify', 'solar'].includes(roomId);
  const workflows = ROOM_WORKFLOWS[roomId] ?? [];
  const apis = ROOM_APIS[roomId] ?? [];

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  // Fetch agent data
  useEffect(() => {
    async function load() {
      const crewData = await fetchCrew();
      if (crewData) {
        const workers: any[] = (crewData as any).workers ?? [];
        const roomAgent = workers.find(
          (w: any) => w.room === roomId || w.name?.toLowerCase() === roomId
        );
        if (roomAgent) {
          setAgent({
            id: roomAgent.id ?? roomAgent.name,
            name: roomAgent.name ?? 'Unknown',
            status: roomAgent.status ?? 'idle',
            currentJob: roomAgent.currentJob,
            jobId: roomAgent.jobId,
            tasksCompleted: roomAgent.tasksCompleted ?? 0,
            tasksFailed: roomAgent.tasksFailed ?? 0,
            uptime: roomAgent.uptime ?? '—',
          });
        }
        const jobs: any[] = (crewData as any).recentJobs ?? [];
        const roomJobs = jobs.slice(0, 20).map((j: any, i: number) => ({
          id: j.id ?? String(i),
          text: j.task ?? j.template ?? j.type ?? 'Task',
          ts: j.completedAt ?? j.startedAt ?? '',
          type: (j.status === 'failed' ? 'error' : j.status === 'completed' ? 'task' : 'info') as 'task' | 'error' | 'info',
        }));
        setActivities(roomJobs);
      }

      const costData = await fetchCosts();
      if (costData) {
        setTotalCost(costData.total_cost ?? 0);
      }

      if (isBusiness || roomId === 'research') {
        const leadsData = await fetchLeads();
        if (leadsData) setLeads(leadsData.slice(0, 10));
      }
    }
    load();
  }, [roomId, isBusiness]);

  async function handleRunTask() {
    if (!taskInput.trim() || sending) return;
    setSending(true);
    const res = await sendChat(taskInput.trim());
    if (res?.reply) {
      setLogs((prev) => [...prev, `> ${taskInput}`, res.reply]);
      setActivities((prev) => [
        { id: String(Date.now()), text: taskInput, ts: new Date().toISOString(), type: 'task' },
        ...prev,
      ]);
    }
    setTaskInput('');
    setSending(false);
  }

  async function handleRunWorkflow() {
    if (!selectedWorkflow) return;
    setSending(true);
    await startWorkflow(selectedWorkflow, { room: roomId });
    setActivities((prev) => [
      { id: String(Date.now()), text: `Launched: ${selectedWorkflow}`, ts: new Date().toISOString(), type: 'info' },
      ...prev,
    ]);
    setSending(false);
  }

  async function handleKillAgent() {
    if (!agent?.jobId) return;
    await killJob(agent.jobId);
    setAgent((prev) => (prev ? { ...prev, status: 'idle', currentJob: undefined } : null));
    setActivities((prev) => [
      { id: String(Date.now()), text: 'Agent job killed', ts: new Date().toISOString(), type: 'error' },
      ...prev,
    ]);
  }

  const successRate =
    agent && (agent.tasksCompleted ?? 0) + (agent.tasksFailed ?? 0) > 0
      ? (((agent.tasksCompleted ?? 0) / ((agent.tasksCompleted ?? 0) + (agent.tasksFailed ?? 0))) * 100).toFixed(0)
      : '—';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-all duration-300 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
      }`}
      style={{ height: '55vh' }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${roomColor}08 0%, ${roomColor}02 100%)`,
        }}
      />

      <div
        ref={panelRef}
        className="relative h-full bg-[#0a0e1a]/95 backdrop-blur-xl border-t-2 overflow-hidden flex flex-col"
        style={{ borderColor: roomColor }}
      >
        {/* Top glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ boxShadow: `0 0 20px 2px ${roomColor}` }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a2744] shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ color: roomColor }}>
              {roomName}
            </h2>
            <span
              className={`px-2 py-0.5 rounded-full text-[0.6rem] font-bold uppercase tracking-wider ${
                (agent?.status === 'working' || agent?.status === 'active')
                  ? 'bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/30'
                  : agent?.status === 'error'
                    ? 'bg-[#ff4081]/15 text-[#ff4081] border border-[#ff4081]/30'
                    : 'bg-[#69f0ae]/15 text-[#69f0ae] border border-[#69f0ae]/30'
              }`}
            >
              {agent?.status ?? 'idle'}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg border border-[#1a2744] bg-[#0d1424] flex items-center justify-center text-[#6b7fa3] hover:text-[#ff4081] hover:border-[#ff4081] transition-all text-sm"
          >
            X
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto flex">
          {/* Left Column — 60% */}
          <div className="w-[60%] border-r border-[#1a2744] overflow-auto p-4 space-y-4">
            {/* Agent Card */}
            <div className="neon-card p-4 flex items-start gap-4">
              {/* Stick figure avatar */}
              <div className="w-16 h-20 shrink-0 flex items-center justify-center">
                <svg width="40" height="60" viewBox="0 0 40 60" fill="none">
                  <circle cx="20" cy="10" r="8" stroke={roomColor} strokeWidth="2" fill="none" />
                  <line x1="20" y1="18" x2="20" y2="40" stroke={roomColor} strokeWidth="2" />
                  <line x1="20" y1="24" x2="8" y2="34" stroke={roomColor} strokeWidth="2" />
                  <line x1="20" y1="24" x2="32" y2="34" stroke={roomColor} strokeWidth="2" />
                  <line x1="20" y1="40" x2="10" y2="56" stroke={roomColor} strokeWidth="2" />
                  <line x1="20" y1="40" x2="30" y2="56" stroke={roomColor} strokeWidth="2" />
                  {(agent?.status === 'working' || agent?.status === 'active') && (
                    <circle cx="20" cy="10" r="10" stroke={roomColor} strokeWidth="1" fill="none" opacity="0.3">
                      <animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold uppercase tracking-wider text-sm" style={{ color: roomColor }}>
                    {agent?.name ?? 'No Agent'}
                  </span>
                  <span className={`status-dot ${(agent?.status === 'working' || agent?.status === 'active') ? 'working' : agent?.status === 'error' ? 'offline' : 'online'}`} />
                </div>
                <div className="text-[0.65rem] text-[#6b7fa3] uppercase tracking-wider mb-2">
                  {agent?.currentJob ?? 'Standing by'}
                </div>
                <div className="grid grid-cols-3 gap-3 text-center text-xs">
                  <div>
                    <div className="text-[#69f0ae] font-bold">{agent?.tasksCompleted ?? 0}</div>
                    <div className="text-[0.55rem] text-[#6b7fa3]">DONE</div>
                  </div>
                  <div>
                    <div className="text-[#ff4081] font-bold">{agent?.tasksFailed ?? 0}</div>
                    <div className="text-[0.55rem] text-[#6b7fa3]">FAIL</div>
                  </div>
                  <div>
                    <div className="text-[#00e5ff] font-bold">{successRate}%</div>
                    <div className="text-[0.55rem] text-[#6b7fa3]">RATE</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Activity Log */}
            <div>
              <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">Activity Log</h3>
              <div className="neon-card p-3 max-h-40 overflow-auto space-y-2">
                {activities.length === 0 ? (
                  <p className="text-[0.65rem] text-[#6b7fa3] text-center py-3">No recent activity</p>
                ) : (
                  activities.map((a) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs border-l-2 pl-2" style={{
                      borderColor: a.type === 'error' ? '#ff4081' : a.type === 'task' ? '#69f0ae' : '#00e5ff',
                    }}>
                      <span className="text-[#c8d6e5] flex-1 min-w-0 truncate">{a.text}</span>
                      <span className="text-[0.55rem] text-[#6b7fa3] shrink-0">
                        {a.ts ? new Date(a.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Business-specific: Revenue / Leads */}
            {isBusiness && (
              <div>
                <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">
                  {roomId === 'solar' ? 'Pipeline' : 'Revenue & Orders'}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="neon-card p-3 text-center">
                    <div className="text-lg font-bold" style={{ color: roomColor }}>
                      {roomId === 'etsy' ? '$2,100' : roomId === 'printify' ? '$450' : '$0'}
                    </div>
                    <div className="text-[0.55rem] text-[#6b7fa3] uppercase">Revenue</div>
                  </div>
                  <div className="neon-card p-3 text-center">
                    <div className="text-lg font-bold text-[#c8d6e5]">
                      {roomId === 'etsy' ? '47' : roomId === 'printify' ? '12' : leads.length}
                    </div>
                    <div className="text-[0.55rem] text-[#6b7fa3] uppercase">
                      {roomId === 'solar' ? 'Leads' : 'Orders'}
                    </div>
                  </div>
                  <div className="neon-card p-3 text-center">
                    <div className="text-lg font-bold text-[#b388ff]">
                      {roomId === 'etsy' ? '156' : roomId === 'printify' ? '34' : '0'}
                    </div>
                    <div className="text-[0.55rem] text-[#6b7fa3] uppercase">
                      {roomId === 'solar' ? 'Calls' : 'Products'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Leads list for research/solar */}
            {(roomId === 'research' || roomId === 'solar') && leads.length > 0 && (
              <div>
                <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">Recent Leads</h3>
                <div className="neon-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[#6b7fa3] text-[0.6rem] uppercase tracking-wider border-b border-[#1a2744]">
                        <th className="text-left py-2 px-3">Name</th>
                        <th className="text-center py-2 px-3">Score</th>
                        <th className="text-left py-2 px-3">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((l) => (
                        <tr key={l.id} className="border-b border-[#1a2744]/50 hover:bg-[#00e5ff]/5">
                          <td className="py-1.5 px-3 text-[#c8d6e5]">{l.name}</td>
                          <td className="py-1.5 px-3 text-center font-bold" style={{
                            color: (l.score ?? 0) >= 80 ? '#ff4081' : (l.score ?? 0) >= 50 ? '#ff9100' : '#00e5ff',
                          }}>
                            {l.score ?? '—'}
                          </td>
                          <td className="py-1.5 px-3 text-[#6b7fa3]">{l.source ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column — 40% */}
          <div className="w-[40%] overflow-auto p-4 space-y-4">
            {/* Run Task */}
            <div>
              <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">Run Task</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRunTask()}
                  placeholder="Enter a task for this agent..."
                  className="flex-1 bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-xs text-[#c8d6e5] placeholder:text-[#6b7fa3]/50 focus:outline-none focus:border-[#00e5ff]"
                />
                <button
                  onClick={handleRunTask}
                  disabled={sending || !taskInput.trim()}
                  className="px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    background: `${roomColor}15`,
                    color: roomColor,
                    border: `1px solid ${roomColor}40`,
                  }}
                >
                  {sending ? '...' : 'Run'}
                </button>
              </div>
            </div>

            {/* Run Workflow */}
            <div>
              <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">Run Workflow</h3>
              <div className="flex gap-2">
                <select
                  value={selectedWorkflow}
                  onChange={(e) => setSelectedWorkflow(e.target.value)}
                  className="flex-1 bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-xs text-[#c8d6e5] focus:outline-none focus:border-[#00e5ff] appearance-none"
                >
                  <option value="">Select workflow...</option>
                  {workflows.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
                <button
                  onClick={handleRunWorkflow}
                  disabled={!selectedWorkflow || sending}
                  className="btn-launch disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Launch
                </button>
              </div>
            </div>

            {/* Kill Agent */}
            <div>
              <button
                onClick={handleKillAgent}
                disabled={!agent?.jobId}
                className="btn-kill w-full py-2 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Kill Current Job
              </button>
            </div>

            {/* View Logs */}
            <div>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="w-full text-left px-3 py-2 rounded-lg bg-[#0d1424] border border-[#1a2744] text-xs text-[#6b7fa3] hover:text-[#00e5ff] hover:border-[#00e5ff] transition-all flex items-center justify-between"
              >
                <span>View Logs</span>
                <span className="text-[0.65rem]">{showLogs ? '▲' : '▼'}</span>
              </button>
              {showLogs && (
                <div className="mt-2 neon-card p-3 max-h-32 overflow-auto font-mono text-[0.65rem] text-[#6b7fa3] space-y-1">
                  {logs.length === 0 ? (
                    <p className="text-center py-2">No logs yet. Run a task to see output.</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className={log.startsWith('>') ? 'text-[#00e5ff]' : 'text-[#c8d6e5]'}>
                        {log}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* API Connections */}
            <div>
              <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">API Connections</h3>
              <div className="neon-card p-3 space-y-2">
                {apis.map((api) => (
                  <div key={api.name} className="flex items-center justify-between text-xs">
                    <span className="text-[#c8d6e5]">{api.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: api.connected ? '#69f0ae' : '#ff4081',
                          boxShadow: api.connected ? '0 0 6px #69f0ae' : '0 0 6px #ff4081',
                        }}
                      />
                      <span className={api.connected ? 'text-[#69f0ae] text-[0.6rem]' : 'text-[#ff4081] text-[0.6rem]'}>
                        {api.connected ? 'OK' : 'DOWN'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div>
              <h3 className="text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-2 px-1">Stats</h3>
              <div className="neon-card p-3 grid grid-cols-2 gap-3 text-center text-xs">
                <div>
                  <div className="text-[#69f0ae] font-bold">{agent?.tasksCompleted ?? 0}</div>
                  <div className="text-[0.55rem] text-[#6b7fa3]">Completed</div>
                </div>
                <div>
                  <div className="text-[#ff4081] font-bold">{agent?.tasksFailed ?? 0}</div>
                  <div className="text-[0.55rem] text-[#6b7fa3]">Failed</div>
                </div>
                <div>
                  <div className="text-[#00e5ff] font-bold">{successRate}%</div>
                  <div className="text-[0.55rem] text-[#6b7fa3]">Success Rate</div>
                </div>
                <div>
                  <div className="text-[#ff9100] font-bold">${totalCost.toFixed(2)}</div>
                  <div className="text-[0.55rem] text-[#6b7fa3]">API Cost 24h</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
