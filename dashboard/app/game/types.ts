export type AgentStatus = 'idle' | 'working' | 'error' | 'offline';

export interface AgentState {
  id: string;
  name: string;
  room: string;
  status: AgentStatus;
  currentTask?: string;
  cost?: number;
}

export interface RoomState {
  id: string;
  name: string;
  type: 'command' | 'research' | 'marketing' | 'ops' | 'factory';
  revenue?: number;
  agentCount: number;
  status: 'active' | 'idle' | 'alert';
}

export interface DungeonConfig {
  rooms: RoomState[];
  agents: AgentState[];
}

export const DEFAULT_CONFIG: DungeonConfig = {
  rooms: [
    { id: 'command', name: 'Command Center', type: 'command', agentCount: 1, status: 'active' },
    { id: 'research', name: 'Research Lab', type: 'research', agentCount: 1, status: 'active' },
    { id: 'marketing', name: 'Marketing Bay', type: 'marketing', revenue: 0, agentCount: 1, status: 'idle' },
    { id: 'ops', name: 'Ops Deck', type: 'ops', agentCount: 1, status: 'active' },
    { id: 'factory', name: 'Factory Floor', type: 'factory', revenue: 0, agentCount: 0, status: 'idle' },
  ],
  agents: [
    { id: 'jarvis', name: 'Jarvis', room: 'command', status: 'working' },
    { id: 'hawk', name: 'Hawk', room: 'research', status: 'idle' },
    { id: 'ghost', name: 'Ghost', room: 'marketing', status: 'idle' },
    { id: 'pulse', name: 'Pulse', room: 'ops', status: 'working' },
  ],
};
