'use client';

import { useState } from 'react';
import { sendChat } from '@/lib/api';

interface AddAgentModalProps {
  onClose: () => void;
}

interface ApiKeyRow {
  id: string;
  name: string;
  value: string;
}

const SUGGESTED_KEYS = [
  'ETSY_API_KEY',
  'PRINTIFY_API_KEY',
  'META_ACCESS_TOKEN',
  'BLAND_API_KEY',
  'BRAVE_SEARCH_API_KEY',
  'OPENAI_API_KEY',
];

const AVAILABLE_TOOLS = [
  'brave_search',
  'content_create',
  'generate_ad',
  'scrape_ads',
  'scrape_leads',
  'send_email',
  'send_sms',
  'create_listing',
  'generate_image',
  'analyze_data',
  'schedule_post',
  'dial_lead',
];

const ROOM_OPTIONS = [
  { id: 'command', name: 'Command Center' },
  { id: 'research', name: 'Research Lab' },
  { id: 'marketing', name: 'Marketing Bay' },
  { id: 'ops', name: 'Ops Deck' },
  { id: 'etsy', name: 'Etsy Store' },
  { id: 'printify', name: 'Printify Shop' },
  { id: 'solar', name: 'Solar Pipeline' },
];

const BUSINESS_TYPES = ['research', 'marketing', 'ops', 'business'];

export default function AddAgentModal({ onClose }: AddAgentModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [assignedRoom, setAssignedRoom] = useState('');
  const [isNewRoom, setIsNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomColor, setNewRoomColor] = useState('#00e5ff');
  const [newRoomType, setNewRoomType] = useState('research');
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function addApiKey(suggestion?: string) {
    setApiKeys((prev) => [
      ...prev,
      { id: String(Date.now()), name: suggestion ?? '', value: '' },
    ]);
  }

  function removeApiKey(id: string) {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function updateApiKey(id: string, field: 'name' | 'value', val: string) {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, [field]: val } : k))
    );
  }

  function toggleTool(tool: string) {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  }

  async function handleDeploy() {
    if (!name.trim() || !role.trim()) return;
    setDeploying(true);
    setResult(null);

    const payload = {
      agent_name: name,
      role: role,
      room: isNewRoom
        ? { name: newRoomName, color: newRoomColor, type: newRoomType, isNew: true }
        : { id: assignedRoom },
      api_keys: apiKeys.reduce(
        (acc, k) => (k.name && k.value ? { ...acc, [k.name]: k.value } : acc),
        {} as Record<string, string>
      ),
      tools: selectedTools,
    };

    const res = await sendChat(
      `Deploy new agent: ${JSON.stringify(payload)}`
    );

    setResult(res?.reply ?? 'Agent deployment initiated.');
    setDeploying(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-auto bg-[#0a0e1a] border rounded-xl shadow-2xl"
        style={{ borderColor: '#b388ff', boxShadow: '0 0 40px rgba(179, 136, 255, 0.15)' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[#1a2744] bg-[#0a0e1a]">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#b388ff]">Deploy New Agent</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#1a2744] bg-[#0d1424] flex items-center justify-center text-[#6b7fa3] hover:text-[#ff4081] hover:border-[#ff4081] transition-all text-sm"
          >
            X
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Agent Name */}
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-1.5">Agent Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIPER, NOVA, PHANTOM..."
              className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#b388ff]"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-1.5">Role Description</label>
            <textarea
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="What does this agent do? e.g. 'Scrapes competitor ads on Meta and generates counter-campaigns'"
              rows={3}
              className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#b388ff] resize-none"
            />
          </div>

          {/* Assigned Room */}
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-1.5">Assigned Room</label>
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-1.5 text-xs text-[#c8d6e5] cursor-pointer">
                <input
                  type="radio"
                  checked={!isNewRoom}
                  onChange={() => setIsNewRoom(false)}
                  className="accent-[#b388ff]"
                />
                Existing Room
              </label>
              <label className="flex items-center gap-1.5 text-xs text-[#c8d6e5] cursor-pointer">
                <input
                  type="radio"
                  checked={isNewRoom}
                  onChange={() => setIsNewRoom(true)}
                  className="accent-[#b388ff]"
                />
                New Room
              </label>
            </div>

            {!isNewRoom ? (
              <select
                value={assignedRoom}
                onChange={(e) => setAssignedRoom(e.target.value)}
                className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] focus:outline-none focus:border-[#b388ff] appearance-none"
              >
                <option value="">Select room...</option>
                {ROOM_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Room name..."
                  className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2.5 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#b388ff]"
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newRoomColor}
                        onChange={(e) => setNewRoomColor(e.target.value)}
                        className="w-8 h-8 rounded border border-[#1a2744] bg-transparent cursor-pointer"
                      />
                      <span className="text-xs font-mono text-[#6b7fa3]">{newRoomColor}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[0.55rem] uppercase tracking-wider text-[#6b7fa3] mb-1">Type</label>
                    <select
                      value={newRoomType}
                      onChange={(e) => setNewRoomType(e.target.value)}
                      className="w-full bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-xs text-[#c8d6e5] focus:outline-none focus:border-[#b388ff] appearance-none"
                    >
                      {BUSINESS_TYPES.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* API Keys */}
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-1.5">API Keys</label>
            <div className="space-y-2 mb-2">
              {apiKeys.map((k) => (
                <div key={k.id} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={k.name}
                    onChange={(e) => updateApiKey(k.id, 'name', e.target.value)}
                    placeholder="Key name"
                    className="w-40 bg-[#0d1424] border border-[#1a2744] rounded px-2 py-1.5 text-xs text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#b388ff]"
                  />
                  <input
                    type="password"
                    value={k.value}
                    onChange={(e) => updateApiKey(k.id, 'value', e.target.value)}
                    placeholder="Key value"
                    className="flex-1 bg-[#0d1424] border border-[#1a2744] rounded px-2 py-1.5 text-xs text-[#c8d6e5] placeholder:text-[#6b7fa3]/40 focus:outline-none focus:border-[#b388ff]"
                  />
                  <button
                    onClick={() => removeApiKey(k.id)}
                    className="text-[#ff4081] text-xs hover:text-[#ff4081]/80"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => addApiKey()}
                className="px-2 py-1 rounded text-[0.65rem] bg-[#b388ff]/10 text-[#b388ff] border border-[#b388ff]/30 hover:bg-[#b388ff]/20 transition-all"
              >
                + Add Key
              </button>
              {SUGGESTED_KEYS.filter((s) => !apiKeys.some((k) => k.name === s)).map((s) => (
                <button
                  key={s}
                  onClick={() => addApiKey(s)}
                  className="px-2 py-1 rounded text-[0.55rem] bg-[#1a2744]/50 text-[#6b7fa3] border border-[#1a2744] hover:text-[#c8d6e5] hover:border-[#6b7fa3] transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Tools */}
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#6b7fa3] mb-1.5">Tools</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => (
                <button
                  key={tool}
                  onClick={() => toggleTool(tool)}
                  className={`px-2.5 py-1.5 rounded text-[0.65rem] font-medium transition-all ${
                    selectedTools.includes(tool)
                      ? 'bg-[#00e5ff]/15 text-[#00e5ff] border border-[#00e5ff]/40'
                      : 'bg-[#0d1424] text-[#6b7fa3] border border-[#1a2744] hover:text-[#c8d6e5]'
                  }`}
                >
                  {selectedTools.includes(tool) ? '✓ ' : ''}{tool}
                </button>
              ))}
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="neon-card p-3 text-xs text-[#69f0ae]">
              {result}
            </div>
          )}

          {/* Deploy Button */}
          <button
            onClick={handleDeploy}
            disabled={deploying || !name.trim() || !role.trim()}
            className="w-full py-3 rounded-lg text-sm font-bold uppercase tracking-[0.15em] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, rgba(179,136,255,0.15), rgba(0,229,255,0.15))',
              color: '#b388ff',
              border: '1px solid rgba(179,136,255,0.4)',
              boxShadow: deploying ? 'none' : '0 0 20px rgba(179,136,255,0.15)',
            }}
          >
            {deploying ? 'Deploying...' : 'Deploy Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
