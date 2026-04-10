'use client';

import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import DungeonScene from './DungeonScene';
import type { AgentState, DungeonConfig } from './types';

export interface PhaserGameHandle {
  updateAgent: (agent: AgentState) => void;
  updateConfig: (config: DungeonConfig) => void;
  onRoomClick: (callback: (roomId: string) => void) => void;
}

interface PhaserGameProps {
  onReady?: (handle: PhaserGameHandle) => void;
  className?: string;
}

export default function PhaserGame({ onReady, className }: PhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (gameRef.current) return; // already initialized
    if (!containerRef.current) return;

    try {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 1400,
        height: 900,
        parent: containerRef.current,
        backgroundColor: '#0a0e1a',
        scene: [DungeonScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        antialias: true,
      };

      const game = new Phaser.Game(config);
      gameRef.current = game;
      setLoading(false);

      if (onReady) {
        const handle: PhaserGameHandle = {
          updateAgent: (agent) => game.events.emit('update-agent', agent),
          updateConfig: (cfg) => game.events.emit('update-config', cfg),
          onRoomClick: (callback) => game.events.on('room-click', callback),
        };
        onReady(handle);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[PhaserGame] init error:', e);
      setError(msg);
      setLoading(false);
    }

    return () => {
      if (gameRef.current) {
        try { gameRef.current.destroy(true); } catch {}
        gameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        maxWidth: 1400,
        aspectRatio: '1400 / 900',
        margin: '0 auto',
        position: 'relative',
      }}
    >
      {loading && !error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#00e5ff', fontFamily: 'monospace', fontSize: 12,
          letterSpacing: '0.2em',
        }}>
          INITIALIZING PHASER ENGINE...
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#ff4081', fontFamily: 'monospace', fontSize: 12, padding: 20,
        }}>
          <div style={{ marginBottom: 8 }}>ENGINE ERROR</div>
          <div style={{ fontSize: 10, opacity: 0.7, maxWidth: 500, textAlign: 'center' }}>{error}</div>
        </div>
      )}
    </div>
  );
}
