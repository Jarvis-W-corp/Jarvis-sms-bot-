'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { PhaserGameHandle } from './game/PhaserGame';
import {
  useHealth,
  useLeads,
  useCrew,
  useCosts,
} from '@/lib/hooks';
import {
  sendChat,
  sendVoice,
  type ChatResponse,
} from '@/lib/api';
import TopBar from './components/TopBar';
import RoomInterior from './components/RoomInterior';
import AddAgentModal from './components/AddAgentModal';
import AddBusinessModal from './components/AddBusinessModal';
import CustomWorkflow from './components/CustomWorkflow';

// Dynamically import PhaserGame with no SSR
const PhaserGame = dynamic(() => import('./game/PhaserGame'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full neon-card">
      <span className="text-[#00e5ff] animate-pulse text-sm tracking-widest uppercase">
        Initializing Phaser Engine...
      </span>
    </div>
  ),
});

// Room color map
const ROOM_COLORS: Record<string, string> = {
  command: '#00e5ff',
  research: '#b388ff',
  marketing: '#ff4081',
  ops: '#69f0ae',
  etsy: '#f5641e',
  printify: '#39d4a5',
  solar: '#ffd740',
};

const ROOM_NAMES: Record<string, string> = {
  command: 'COMMAND CENTER',
  research: 'RESEARCH LAB',
  marketing: 'MARKETING BAY',
  ops: 'OPS DECK',
  etsy: 'ETSY STORE',
  printify: 'PRINTIFY SHOP',
  solar: 'SOLAR PIPELINE',
};

// ── Voice Overlay ──────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'jarvis';
  text: string;
  ts: number;
}

function VoiceOverlay({ onClose }: { onClose: () => void }) {
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
        const voiceRes = await sendVoice(text.trim());
        let reply = '';

        const vRes = voiceRes as any;
        reply = vRes?.reply || vRes?.text || '';

        if (vRes?.audio) {
          // API returns base64 audio
          setSpeaking(true);
          const audio = new Audio('data:audio/mpeg;base64,' + vRes.audio);
          audio.onended = () => setSpeaking(false);
          audio.onerror = () => setSpeaking(false);
          audio.play().catch(() => setSpeaking(false));
        } else if (!reply) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-[#0a0e1a] border border-[#1a2744] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ boxShadow: '0 0 60px rgba(0, 229, 255, 0.1)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#1a2744]">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-[#00e5ff]">Voice Chat</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#1a2744] bg-[#0d1424] flex items-center justify-center text-[#6b7fa3] hover:text-[#ff4081] hover:border-[#ff4081] transition-all text-sm"
          >
            X
          </button>
        </div>

        {/* Orb */}
        <div className="flex items-center justify-center py-4 shrink-0">
          <div className={`voice-orb ${listening ? 'listening' : speaking ? 'speaking' : ''}`} />
        </div>

        {/* Chat Log */}
        <div
          ref={logRef}
          className="flex-1 overflow-auto px-6 py-2 space-y-3 min-h-[150px]"
        >
          {messages.length === 0 && (
            <p className="text-[#6b7fa3] text-xs text-center py-4">Say something to Jarvis...</p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-xs ${
                  m.role === 'user'
                    ? 'bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[#c8d6e5]'
                    : 'bg-[#b388ff]/10 border border-[#b388ff]/20 text-[#c8d6e5]'
                }`}
              >
                <div className="text-[0.6rem] text-[#6b7fa3] mb-0.5 uppercase">
                  {m.role === 'user' ? 'You' : 'Jarvis'}
                </div>
                {m.text}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-[#b388ff]/10 border border-[#b388ff]/20 rounded-lg px-3 py-2 text-xs text-[#6b7fa3] animate-pulse">
                Jarvis is thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#1a2744] flex gap-2 shrink-0">
          <button
            onClick={toggleMic}
            className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center text-lg transition-all ${
              listening
                ? 'bg-[#69f0ae]/20 border-[#69f0ae]/40 text-[#69f0ae] glow-green'
                : 'bg-[#0d1424] border-[#1a2744] text-[#6b7fa3] hover:text-[#00e5ff] hover:border-[#00e5ff]'
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
            className="flex-1 bg-[#0d1424] border border-[#1a2744] rounded-lg px-3 py-2 text-sm text-[#c8d6e5] placeholder:text-[#6b7fa3]/50 focus:outline-none focus:border-[#00e5ff]"
          />
          <button
            onClick={() => handleSend(input)}
            disabled={sending || !input.trim()}
            className="shrink-0 px-4 py-2 rounded-lg bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] text-sm font-medium hover:bg-[#00e5ff]/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────

export default function MissionControl() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showAddBusiness, setShowAddBusiness] = useState(false);
  const [showVoice, setShowVoice] = useState(false);

  const health = useHealth();
  const costs = useCosts();
  const { data: leads } = useLeads();
  const { data: crew } = useCrew();

  const leadsCount = leads?.length ?? 0;
  const workers: any[] = (crew as any)?.workers ?? [];
  const activeAgents = workers.filter((w: any) => w.status === 'working' || w.status === 'active').length;

  const onPhaserReady = useCallback((h: PhaserGameHandle) => {
    h.onRoomClick((roomId) => {
      // Business rooms with their own apps open in new tab
      const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://jarvis-sms-bot.onrender.com';
      if (roomId === 'roofing') {
        window.open(API_URL + '/roofing?key=' + API_KEY, '_blank');
        return;
      }
      if (roomId === 'solar') {
        window.open(API_URL + '/sales?key=' + API_KEY, '_blank');
        return;
      }
      setActiveRoom(roomId);
    });
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top Bar */}
      <TopBar
        health={health}
        costs={costs}
        leadsCount={leadsCount}
        activeAgents={activeAgents}
        onAddAgent={() => setShowAddAgent(true)}
        onAddBusiness={() => setShowAddBusiness(true)}
        onVoiceToggle={() => setShowVoice(true)}
      />

      {/* Phaser Dungeon — main view */}
      <div className="flex-1 relative min-h-0">
        <div className="h-full px-4 py-3">
          <PhaserGame
            onReady={onPhaserReady}
            className="rounded-xl border border-[#1a2744] overflow-hidden h-full"
          />
        </div>

        {/* Room click hint overlay — only when no room is open */}
        {!activeRoom && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
            <div className="px-4 py-2 rounded-full bg-[#0d1424]/80 backdrop-blur-sm border border-[#1a2744] text-[0.65rem] text-[#6b7fa3] uppercase tracking-widest animate-pulse">
              Click a room to enter
            </div>
          </div>
        )}
      </div>

      {/* Room Interior — slides up when a room is clicked */}
      {activeRoom && (
        <RoomInterior
          roomId={activeRoom}
          roomName={ROOM_NAMES[activeRoom] ?? activeRoom.toUpperCase()}
          roomColor={ROOM_COLORS[activeRoom] ?? '#00e5ff'}
          onClose={() => setActiveRoom(null)}
        />
      )}

      {/* Custom Workflow — fixed at bottom */}
      <CustomWorkflow />

      {/* Modals */}
      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
      {showAddBusiness && <AddBusinessModal onClose={() => setShowAddBusiness(false)} />}
      {showVoice && <VoiceOverlay onClose={() => setShowVoice(false)} />}
    </div>
  );
}
