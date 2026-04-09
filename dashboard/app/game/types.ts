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
  type: string;
  revenue?: number;
  agentCount: number;
  status: 'active' | 'idle' | 'alert';
  icon?: string;
}

export interface DungeonConfig {
  rooms: RoomState[];
  agents: AgentState[];
}

export const DEFAULT_CONFIG: DungeonConfig = {
  rooms: [
    { id: 'command', name: 'COMMAND CENTER', type: 'command', agentCount: 1, status: 'active' },
    { id: 'research', name: 'RESEARCH LAB', type: 'research', agentCount: 1, status: 'active' },
    { id: 'marketing', name: 'MARKETING BAY', type: 'marketing', agentCount: 1, status: 'idle' },
    { id: 'ops', name: 'OPS DECK', type: 'ops', agentCount: 1, status: 'active' },
    { id: 'etsy', name: 'ETSY STORE', type: 'business', revenue: 2100, agentCount: 1, status: 'active', icon: '🛍️' },
    { id: 'printify', name: 'PRINTIFY SHOP', type: 'business', revenue: 450, agentCount: 1, status: 'active', icon: '🖨️' },
    { id: 'solar', name: 'SOLAR PIPELINE', type: 'business', revenue: 0, agentCount: 0, status: 'idle', icon: '☀️' },
  ],
  agents: [
    { id: 'jarvis', name: 'JARVIS', room: 'command', status: 'working', currentTask: 'Orchestrating agents' },
    { id: 'hawk', name: 'HAWK', room: 'research', status: 'working', currentTask: 'Scraping leads' },
    { id: 'ghost', name: 'GHOST', room: 'marketing', status: 'idle' },
    { id: 'pulse', name: 'PULSE', room: 'ops', status: 'working', currentTask: 'Monitoring systems' },
    { id: 'forge', name: 'FORGE', room: 'etsy', status: 'working', currentTask: 'Creating listings' },
    { id: 'pixel', name: 'PIXEL', room: 'printify', status: 'working', currentTask: 'Designing products' },
  ],
};
