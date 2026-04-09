'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { PhaserGameHandle } from './game/PhaserGame';
import {
  useHealth,
  useLeads,
  useCrew,
  useCosts,
  useWorkflows,
  useActiveTasks,
  useAppointments,
} from '@/lib/hooks';
import {
  sendChat,
  sendVoice,
  killJob,
  killAllJobs,
  startWorkflow,
  fetchSequences,
  type Lead,
  type Sequence,
  type ChatResponse,
} from '@/lib/api';

// Dynamically import PhaserGame with no SSR
const PhaserGame = dynamic(() => import('./game/PhaserGame'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[340px] neon-card">
      <span className="text-cyan animate-pulse text-sm tracking-widest uppercase">
        Initializing Phaser Engine...
      </span>
    </div>
  ),
});

type Tab = 'leads' | 'crew' | 'workflows' | 'sequences' | 'costs' | 'voice';

const TAB_LIST: { key: Tab; label: string }[] = [
  { key: 'leads', label: 'LEADS' },
  { key: 'crew', label: 'CREW' },
  { key: 'workflows', label: 'WORKFLOWS' },
  { key: 'sequences', label: 'SEQUENCES' },
  { key: 'costs', label: 'COSTS' },
  { key: 'voice', label: 'VOICE' },
];

// ── Top Bar ──────────────────────────────────────────

function TopBar({
  health,
  costs,
}: {
  health: ReturnType<typeof useHealth>;
  costs: ReturnType<typeof useCosts>;
}) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      setClock(
        new Date().toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const isOnline = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const totalCost = costs.data?.total24h ?? 0;

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-card-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-[0.2em] text-cyan uppercase">JARVIS</h1>
        <span className="text-[0.65rem] text-dim tracking-wider uppercase">Mission Control</span>
      </div>
      <div className="flex items-center gap-5 text-xs">
        <span className="font-mono text-dim">{clock} ET</span>
        <span className="flex items-center gap-1.5">
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span className={isOnline ? 'text-green' : 'text-pink'}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </span>
        <span className="text-orange font-mono">
          ${totalCost.toFixed(2)} <span className="text-dim">/ 24h</span>
        </span>
      </div>
    </header>
  );
}

// ── Leads Panel ──────────────────────────────────────

function LeadsPanel() {
  const { data: leads, loading } = useLeads();
  const [selected, setSelected] = useState<Lead | null>(null);

  if (loading) return <PanelLoading label="Loading leads..." />;

  const list = leads ?? [];

  function scoreClass(score?: number) {
    if (!score) return 'text-dim';
    if (score >= 80) return 'score-hot';
    if (score >= 50) return 'score-warm';
    return 'score-cold';
  }

  function statusBadge(status?: string) {
    const s = (status || 'new').toLowerCase();
    const cls =
      s === 'new'
        ? 'badge-new'
        : s === 'contacted'
          ? 'badge-contacted'
          : s === 'qualified'
            ? 'badge-qualified'
            : s === 'closed'
              ? 'badge-closed'
              : 'badge-dead';
    return <span className={`badge ${cls}`}>{status || 'new'}</span>;
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-dim uppercase tracking-wider border-b border-card-border">
              <th className="text-left py-2 px-3 font-medium">Name</th>
              <th className="text-center py-2 px-3 font-medium">Score</th>
              <th className="text-center py-2 px-3 font-medium">Status</th>
              <th className="text-left py-2 px-3 font-medium">Source</th>
              <th className="text-left py-2 px-3 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-dim">
                  No leads found
                </td>
              </tr>
            ) : (
              list.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => setSelected(lead)}
                  className={`border-b border-card-border/50 cursor-pointer hover:bg-cyan/5 transition-colors ${
                    selected?.id === lead.id ? 'bg-cyan/10' : ''
                  }`}
                >
                  <td className="py-2 px-3">{lead.name}</td>
                  <td className={`py-2 px-3 text-center font-bold ${scoreClass(lead.score)}`}>
                    {lead.score ?? '\u2014'}
                  </td>
                  <td className="py-2 px-3 text-center">{statusBadge(lead.status)}</td>
                  <td className="py-2 px-3 text-dim">{lead.source ?? '\u2014'}</td>
                  <td className="py-2 px-3 font-mono text-dim">{lead.phone ?? '\u2014'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="w-64 neon-card p-4 overflow-auto">
          <h3 className="text-sm font-bold text-cyan mb-2">{selected.name}</h3>
          <p className="text-xs text-dim mb-3">{selected.email ?? 'No email'}</p>
          <h4 className="text-[0.65rem] uppercase text-dim tracking-wider mb-2">Activities</h4>
          {selected.activities && selected.activities.length > 0 ? (
            <ul className="space-y-2">
              {selected.activities.map((a, i) => (
                <li key={i} className="text-xs border-l-2 border-purple pl-2">
                  <span className="text-purple text-[0.65rem] uppercase">{a.type}</span>
                  <p className="text-dim">{a.detail}</p>
                  <span className="text-[0.6rem] text-dim">{a.ts}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-dim">No activity recorded</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Crew Panel ───────────────────────────────────────

function CrewPanel() {
  const { data: crew, loading, refetch } = useCrew();

  if (loading) return <PanelLoading label="Loading crew..." />;

  const members = crew ?? [];

  const agentColors: Record<string, string> = {
    ghost: 'purple',
    hawk: 'cyan',
    pulse: 'green',
  };

  async function handleKill(jobId?: string) {
    if (!jobId) return;
    await killJob(jobId);
    refetch();
  }

  async function handleKillAll() {
    await killAllJobs();
    refetch();
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={handleKillAll} className="btn-kill">
          Kill All Jobs
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {members.map((m) => {
          const color = agentColors[m.name.toLowerCase()] || 'cyan';
          const total = (m.tasksCompleted ?? 0) + (m.tasksFailed ?? 0);
          const rate = total > 0 ? (((m.tasksCompleted ?? 0) / total) * 100).toFixed(0) : '\u2014';

          return (
            <div key={m.id} className={`neon-card p-4 glow-${color}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`status-dot ${
                      m.status === 'working'
                        ? 'working'
                        : m.status === 'idle'
                          ? 'online'
                          : 'offline'
                    }`}
                  />
                  <h3 className={`font-bold text-${color} uppercase tracking-wider text-sm`}>
                    {m.name}
                  </h3>
                </div>
                <span className="text-[0.65rem] text-dim uppercase">{m.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                <div>
                  <div className="text-green font-bold text-base">{m.tasksCompleted ?? 0}</div>
                  <div className="text-dim text-[0.6rem]">DONE</div>
                </div>
                <div>
                  <div className="text-pink font-bold text-base">{m.tasksFailed ?? 0}</div>
                  <div className="text-dim text-[0.6rem]">FAIL</div>
                </div>
                <div>
                  <div className="text-cyan font-bold text-base">{rate}%</div>
                  <div className="text-dim text-[0.6rem]">RATE</div>
                </div>
              </div>
              {m.currentJob && (
                <div className="flex items-center justify-between bg-background/50 rounded px-2 py-1.5">
                  <span className="text-xs text-dim truncate flex-1 mr-2">{m.currentJob}</span>
                  <button onClick={() => handleKill(m.jobId)} className="btn-kill text-[0.65rem]">
                    Kill
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {members.length === 0 && (
          <div className="col-span-3 text-center py-8 text-dim text-sm">No crew data available</div>
        )}
      </div>
    </div>
  );
}

// ── Workflows Panel ──────────────────────────────────

function WorkflowsPanel() {
  const { data, loading, refetch } = useWorkflows();

  if (loading) return <PanelLoading label="Loading workflows..." />;

  const active = data?.active ?? [];
  const templates = data?.templates ?? [];

  async function handleLaunch(templateId: string) {
    await startWorkflow(templateId, {});
    refetch();
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-dim mb-3">Active Workflows</h3>
        {active.length === 0 ? (
          <p className="text-xs text-dim">No active workflows</p>
        ) : (
          <div className="space-y-3">
            {active.map((w) => {
              const pct = w.totalSteps ? ((w.step ?? 0) / w.totalSteps) * 100 : 0;
              return (
                <div key={w.id} className="neon-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-cyan">{w.template}</span>
                    <span className="text-[0.65rem] text-dim">{w.status}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[0.6rem] text-dim mt-1">
                    Step {w.step ?? 0} / {w.totalSteps ?? '?'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xs uppercase tracking-wider text-dim mb-3">Available Templates</h3>
        {templates.length === 0 ? (
          <p className="text-xs text-dim">No templates available</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="neon-card p-3 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-foreground">{t.name}</div>
                  {t.description && (
                    <div className="text-[0.65rem] text-dim mt-0.5">{t.description}</div>
                  )}
                </div>
                <button onClick={() => handleLaunch(t.id)} className="btn-launch">
                  Launch
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sequences Panel ──────────────────────────────────

function SequencesPanel() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSequences().then((data) => {
      setSequences(data ?? []);
      setLoading(false);
    });
  }, []);

  if (loading) return <PanelLoading label="Loading sequences..." />;

  return (
    <div>
      {sequences.length === 0 ? (
        <p className="text-xs text-dim text-center py-8">No active sequences</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sequences.map((s) => (
            <div key={s.id} className="neon-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-purple">{s.name}</h4>
                <span
                  className={`badge ${s.status === 'active' ? 'badge-qualified' : 'badge-dead'}`}
                >
                  {s.status ?? 'unknown'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center text-xs">
                <div>
                  <div className="text-cyan font-bold text-lg">{s.enrolled ?? 0}</div>
                  <div className="text-dim text-[0.6rem]">ENROLLED</div>
                </div>
                <div>
                  <div className="text-green font-bold text-lg">{s.completed ?? 0}</div>
                  <div className="text-dim text-[0.6rem]">COMPLETED</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Costs Panel ──────────────────────────────────────

function CostsPanel() {
  const { data, loading } = useCosts();

  if (loading) return <PanelLoading label="Loading costs..." />;

  if (!data) return <p className="text-xs text-dim text-center py-8">No cost data available</p>;

  const agents = data.agents ?? {};
  const entries = Object.entries(agents).sort((a, b) => b[1] - a[1]);
  const maxCost = Math.max(...entries.map(([, v]) => v), 0.01);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-wider text-dim">Cost by Agent (24h)</h3>
        <span className="text-orange font-mono font-bold text-sm">${data.total24h.toFixed(2)}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-dim text-center py-8">No agent costs recorded</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([agent, cost]) => (
            <div key={agent}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-foreground font-medium uppercase">{agent}</span>
                <span className="text-orange font-mono">${cost.toFixed(4)}</span>
              </div>
              <div className="h-2 bg-card-border/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange to-pink"
                  style={{ width: `${(cost / maxCost) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Voice Panel ──────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'jarvis';
  text: string;
  ts: number;
}

function VoicePanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      const userMsg: ChatMessage = { role: 'user', text: text.trim(), ts: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);

      try {
        // Try voice first for TTS, fall back to chat
        const voiceRes = await sendVoice(text.trim());
        let reply = '';

        if (voiceRes?.audioUrl) {
          reply = voiceRes.text || 'Audio response received.';
          setSpeaking(true);
          const audio = new Audio(voiceRes.audioUrl);
          audio.onended = () => setSpeaking(false);
          audio.onerror = () => setSpeaking(false);
          audio.play().catch(() => setSpeaking(false));
        } else {
          const chatRes: ChatResponse | null = await sendChat(text.trim());
          reply = chatRes?.reply || 'No response.';
        }

        setMessages((prev) => [...prev, { role: 'jarvis', text: reply, ts: Date.now() }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: 'jarvis', text: 'Connection error.', ts: Date.now() },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      handleSend(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <div className="flex flex-col items-center gap-4 h-full">
      {/* Orb */}
      <div className="flex items-center justify-center py-4">
        <div
          className={`voice-orb ${listening ? 'listening' : speaking ? 'speaking' : ''}`}
        />
      </div>

      {/* Chat Log */}
      <div
        ref={logRef}
        className="flex-1 w-full max-w-2xl overflow-auto neon-card p-4 space-y-3 min-h-[200px] max-h-[300px]"
      >
        {messages.length === 0 && (
          <p className="text-dim text-xs text-center py-4">Say something to Jarvis...</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-lg px-3 py-2 text-xs ${
                m.role === 'user'
                  ? 'bg-cyan/10 border border-cyan/20 text-foreground'
                  : 'bg-purple/10 border border-purple/20 text-foreground'
              }`}
            >
              <div className="text-[0.6rem] text-dim mb-0.5 uppercase">
                {m.role === 'user' ? 'You' : 'Jarvis'}
              </div>
              {m.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-purple/10 border border-purple/20 rounded-lg px-3 py-2 text-xs text-dim animate-pulse">
              Jarvis is thinking...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="w-full max-w-2xl flex gap-2">
        <button
          onClick={toggleMic}
          className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-lg transition-all ${
            listening
              ? 'bg-green/20 border-green/40 text-green glow-green'
              : 'bg-card border-card-border text-dim hover:text-cyan hover:border-cyan'
          }`}
          title={listening ? 'Stop listening' : 'Start listening'}
        >
          {listening ? '\u23F9' : '\uD83C\uDFA4'}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          placeholder="Talk to Jarvis..."
          className="flex-1 bg-card border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-dim focus:outline-none focus:border-cyan"
        />
        <button
          onClick={() => handleSend(input)}
          disabled={sending || !input.trim()}
          className="shrink-0 px-4 py-2 rounded-lg bg-cyan/10 border border-cyan/30 text-cyan text-sm font-medium hover:bg-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ── Loading Component ────────────────────────────────

function PanelLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <span className="text-dim text-xs animate-pulse tracking-widest uppercase">{label}</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────

export default function MissionControl() {
  const [activeTab, setActiveTab] = useState<Tab>('leads');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const health = useHealth();
  const costs = useCosts();

  const onPhaserReady = useCallback((h: PhaserGameHandle) => {
    h.onRoomClick((roomId) => {
      setActiveRoom(roomId);
    });
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar health={health} costs={costs} />

      {/* Phaser Game Canvas */}
      <div className="px-4 pt-4">
        <PhaserGame
          onReady={onPhaserReady}
          className="rounded-xl border border-card-border overflow-hidden"
        />
      </div>

      {/* Room selection toast */}
      {activeRoom && (
        <div className="mx-4 mt-2 flex items-center justify-between neon-card px-4 py-2 text-xs">
          <span>
            Room: <span className="text-cyan font-bold">{activeRoom}</span>
          </span>
          <button
            className="text-dim hover:text-foreground ml-3"
            onClick={() => setActiveRoom(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {/* Tab Bar */}
      <nav className="flex items-center gap-0 px-4 pt-4 border-b border-card-border">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-bold tracking-[0.15em] transition-all ${
              activeTab === tab.key
                ? 'tab-active'
                : 'text-dim hover:text-foreground border-b-2 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Panel Content */}
      <div className="flex-1 p-4 overflow-auto">
        {activeTab === 'leads' && <LeadsPanel />}
        {activeTab === 'crew' && <CrewPanel />}
        {activeTab === 'workflows' && <WorkflowsPanel />}
        {activeTab === 'sequences' && <SequencesPanel />}
        {activeTab === 'costs' && <CostsPanel />}
        {activeTab === 'voice' && <VoicePanel />}
      </div>
    </div>
  );
}
