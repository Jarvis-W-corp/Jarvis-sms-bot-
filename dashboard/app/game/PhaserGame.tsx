'use client';

import { useEffect, useRef, useCallback } from 'react';
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
  const readyFired = useRef(false);

  const initGame = useCallback(async () => {
    if (gameRef.current || !containerRef.current) return;

    // Dynamic import — Phaser requires browser globals
    const Phaser = (await import('phaser')).default;
    const { default: DungeonScene } = await import('./DungeonScene');

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.CANVAS,
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

    if (onReady && !readyFired.current) {
      readyFired.current = true;
      const handle: PhaserGameHandle = {
        updateAgent: (agent: AgentState) => {
          game.events.emit('update-agent', agent);
        },
        updateConfig: (cfg: DungeonConfig) => {
          game.events.emit('update-config', cfg);
        },
        onRoomClick: (callback: (roomId: string) => void) => {
          game.events.on('room-click', callback);
        },
      };
      onReady(handle);
    }
  }, [onReady]);

  useEffect(() => {
    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
        readyFired.current = false;
      }
    };
  }, [initGame]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        maxWidth: 1400,
        aspectRatio: '1400 / 900',
        margin: '0 auto',
      }}
    />
  );
}
