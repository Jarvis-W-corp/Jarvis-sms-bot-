'use client';

import { useState, useEffect, useRef } from 'react';
import type { HookResult } from './types';

interface TopBarProps {
  health: HookResult<any>;
  costs: HookResult<any>;
  leadsCount: number;
  activeAgents: number;
  onAddAgent: () => void;
  onAddBusiness: () => void;
  onVoiceToggle: () => void;
}

export default function TopBar({
  health,
  costs,
  leadsCount,
  activeAgents,
  onAddAgent,
  onAddBusiness,
  onVoiceToggle,
}: TopBarProps) {
  const [clock, setClock] = useState('');
  const [plusOpen, setPlusOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isOnline = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const totalCost = costs.data?.total_cost ?? 0;

  return (
    <header className="flex items-center justify-between px-5 py-3 border-b border-[#1a2744] bg-[#0d1424]/60 backdrop-blur-sm z-50 relative">
      {/* Left: Brand */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold tracking-[0.2em] text-[#00e5ff] uppercase">JARVIS</h1>
        <span className="text-[0.65rem] text-[#6b7fa3] tracking-wider uppercase">Mission Control</span>
      </div>

      {/* Center: Live Stats */}
      <div className="hidden md:flex items-center gap-6 text-xs">
        <div className="flex flex-col items-center">
          <span className="text-[#00e5ff] font-bold text-sm">{leadsCount}</span>
          <span className="text-[0.55rem] text-[#6b7fa3] uppercase tracking-wider">Leads</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[#b388ff] font-bold text-sm">{activeAgents}</span>
          <span className="text-[0.55rem] text-[#6b7fa3] uppercase tracking-wider">Agents</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[#ff9100] font-bold text-sm">${totalCost.toFixed(2)}</span>
          <span className="text-[0.55rem] text-[#6b7fa3] uppercase tracking-wider">24h Cost</span>
        </div>
      </div>

      {/* Right: Clock, Status, Mic, Plus */}
      <div className="flex items-center gap-4 text-xs">
        <span className="font-mono text-[#6b7fa3]">{clock} ET</span>
        <span className="flex items-center gap-1.5">
          <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          <span className={isOnline ? 'text-[#69f0ae]' : 'text-[#ff4081]'}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </span>

        {/* Mic button */}
        <button
          onClick={onVoiceToggle}
          className="w-8 h-8 rounded-lg border border-[#1a2744] bg-[#0d1424] flex items-center justify-center text-[#6b7fa3] hover:text-[#00e5ff] hover:border-[#00e5ff] transition-all"
          title="Voice Chat"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>

        {/* Plus button */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setPlusOpen(!plusOpen)}
            className="w-8 h-8 rounded-lg border border-[#1a2744] bg-[#0d1424] flex items-center justify-center text-[#00e5ff] hover:bg-[#00e5ff]/10 hover:border-[#00e5ff] transition-all text-lg font-bold"
            title="Add Agent or Business"
          >
            +
          </button>
          {plusOpen && (
            <div className="absolute right-0 top-10 w-48 bg-[#0d1424] border border-[#1a2744] rounded-lg shadow-xl shadow-black/50 z-50 overflow-hidden">
              <button
                onClick={() => { onAddAgent(); setPlusOpen(false); }}
                className="w-full text-left px-4 py-3 text-xs text-[#c8d6e5] hover:bg-[#00e5ff]/10 hover:text-[#00e5ff] transition-colors border-b border-[#1a2744] flex items-center gap-2"
              >
                <span className="text-[#b388ff]">&#9679;</span> Add Agent
              </button>
              <button
                onClick={() => { onAddBusiness(); setPlusOpen(false); }}
                className="w-full text-left px-4 py-3 text-xs text-[#c8d6e5] hover:bg-[#69f0ae]/10 hover:text-[#69f0ae] transition-colors flex items-center gap-2"
              >
                <span className="text-[#69f0ae]">&#9679;</span> Add Business
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
