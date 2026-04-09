'use client';

import { useState } from 'react';
import { sendChat, type ChatResponse } from '@/lib/api';

const EXAMPLE_CHIPS = [
  'Build me an ad for my Shopify store',
  'Scrape 50 solar leads in CT',
  'Create email sequence for med spa',
  'Research my competitors',
  'Design a new Etsy listing',
  'Launch a dialer campaign',
];

export default function CustomWorkflow() {
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [executed, setExecuted] = useState(false);

  async function handleSubmit(text?: string) {
    const val = (text ?? input).trim();
    if (!val || sending) return;
    setInput(val);
    setSending(true);
    setPlan(null);
    setExecuted(false);

    const res: ChatResponse | null = await sendChat(
      `Plan this workflow (don't execute yet, just tell me what you'd do and which agents you'd use): ${val}`
    );

    setPlan(res?.reply ?? 'I can handle that. Click Execute to run it.');
    setSending(false);
  }

  async function handleExecute() {
    if (!input.trim() || sending) return;
    setSending(true);

    await sendChat(`Execute this workflow now: ${input.trim()}`);

    setExecuted(true);
    setSending(false);
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 pointer-events-none">
      <div className="pointer-events-auto">
        {/* Collapsed bar */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-6 py-2.5 bg-[#0d1424]/90 backdrop-blur-sm border-t border-[#1a2744] hover:border-[#00e5ff]/40 transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
            <span className="text-xs text-[#6b7fa3] uppercase tracking-wider">
              Custom Workflow
            </span>
          </div>
          <span className="text-[#6b7fa3] text-xs">{expanded ? '▼' : '▲'}</span>
        </button>

        {/* Expanded panel */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-out bg-[#0a0e1a]/95 backdrop-blur-xl border-t border-[#1a2744] ${
            expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="p-5 space-y-4">
            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setPlan(null); setExecuted(false); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Tell Jarvis what to build..."
                className="flex-1 bg-[#0d1424] border border-[#1a2744] rounded-lg px-4 py-3 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/50 focus:outline-none focus:border-[#00e5ff] transition-all"
              />
              <button
                onClick={() => handleSubmit()}
                disabled={sending || !input.trim()}
                className="px-5 py-3 rounded-lg text-xs font-bold uppercase tracking-wider bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30 hover:bg-[#00e5ff]/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {sending ? '...' : 'Plan'}
              </button>
            </div>

            {/* Example chips */}
            {!plan && (
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => { setInput(chip); handleSubmit(chip); }}
                    className="px-3 py-1.5 rounded-full text-[0.65rem] bg-[#0d1424] text-[#6b7fa3] border border-[#1a2744] hover:text-[#00e5ff] hover:border-[#00e5ff]/40 transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Jarvis response */}
            {plan && (
              <div className="space-y-3">
                <div className="neon-card p-4">
                  <div className="text-[0.6rem] uppercase tracking-wider text-[#b388ff] mb-2">Jarvis Plan</div>
                  <p className="text-xs text-[#c8d6e5] leading-relaxed whitespace-pre-wrap">{plan}</p>
                </div>
                {!executed ? (
                  <button
                    onClick={handleExecute}
                    disabled={sending}
                    className="w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-30"
                    style={{
                      background: 'linear-gradient(135deg, rgba(105,240,174,0.15), rgba(0,229,255,0.15))',
                      color: '#69f0ae',
                      border: '1px solid rgba(105,240,174,0.4)',
                      boxShadow: '0 0 15px rgba(105,240,174,0.1)',
                    }}
                  >
                    {sending ? 'Executing...' : 'Execute Workflow'}
                  </button>
                ) : (
                  <div className="text-center py-2 text-xs text-[#69f0ae]">
                    Workflow launched. Check room panels for progress.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
