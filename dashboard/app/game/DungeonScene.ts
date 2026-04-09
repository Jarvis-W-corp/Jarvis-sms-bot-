import Phaser from 'phaser';
import { AgentState, AgentStatus, DungeonConfig, DEFAULT_CONFIG } from './types';

// Color constants
const COLORS = {
  bg: 0x0a0e1a,
  command: 0x00e5ff,
  research: 0xb388ff,
  marketing: 0x69f0ae,
  ops: 0xff9100,
  factory: 0xffd740,
  error: 0xff1744,
  offline: 0x424242,
  starDim: 0x334155,
  starBright: 0x94a3b8,
  roomFill: 0x111827,
  connectionLine: 0x1e293b,
};

interface RoomDef {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
}

interface AgentOrb {
  id: string;
  name: string;
  room: string;
  status: AgentStatus;
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  statusDot: Phaser.GameObjects.Graphics;
  baseX: number;
  baseY: number;
  phase: number;
  particles: Phaser.GameObjects.Graphics;
  particleData: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[];
  size: number;
}

export default class DungeonScene extends Phaser.Scene {
  private config: DungeonConfig = DEFAULT_CONFIG;
  private rooms: RoomDef[] = [];
  private agentOrbs: AgentOrb[] = [];
  private stars: { x: number; y: number; alpha: number; speed: number }[] = [];
  private starGraphics!: Phaser.GameObjects.Graphics;
  private connectionGraphics!: Phaser.GameObjects.Graphics;
  private roomGraphicsMap: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private roomGlowMap: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private roomTitles: Map<string, Phaser.GameObjects.Text> = new Map();
  private roomParticles: Map<string, { g: Phaser.GameObjects.Graphics; data: { x: number; y: number; vx: number; vy: number; alpha: number; speed: number }[] }> = new Map();
  private revenueTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private elapsed = 0;

  constructor() {
    super({ key: 'DungeonScene' });
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Define room layout
    const pad = 20;
    const cw = 400, ch = 320; // command center size
    const rw = 360, rh = 220; // corner room size
    const cx = 600, cy = 400; // center point

    this.rooms = [
      { id: 'command', name: 'Command Center', x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, color: COLORS.command },
      { id: 'research', name: 'Research Lab', x: cx - cw / 2 - rw - pad, y: cy - ch / 2 - rh / 2 + 20, w: rw, h: rh, color: COLORS.research },
      { id: 'marketing', name: 'Marketing Bay', x: cx + cw / 2 + pad, y: cy - ch / 2 - rh / 2 + 20, w: rw, h: rh, color: COLORS.marketing },
      { id: 'ops', name: 'Ops Deck', x: cx - cw / 2 - rw - pad, y: cy + ch / 2 - rh / 2 - 20, w: rw, h: rh, color: COLORS.ops },
      { id: 'factory', name: 'Factory Floor', x: cx + cw / 2 + pad, y: cy + ch / 2 - rh / 2 - 20, w: rw, h: rh, color: COLORS.factory },
    ];

    // Create star field
    this.createStarField();

    // Draw connections between rooms
    this.connectionGraphics = this.add.graphics();
    this.drawConnections();

    // Draw rooms
    for (const room of this.rooms) {
      this.createRoom(room);
    }

    // Create agents
    this.createAgents();

    // Set up click handlers
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      for (const room of this.rooms) {
        if (
          pointer.x >= room.x && pointer.x <= room.x + room.w &&
          pointer.y >= room.y && pointer.y <= room.y + room.h
        ) {
          this.game.events.emit('room-click', room.id);
          this.flashRoom(room.id);
          break;
        }
      }
    });

    // Listen for external state updates
    this.game.events.on('update-agent', (agent: AgentState) => {
      this.updateAgentState(agent);
    });

    this.game.events.on('update-config', (config: DungeonConfig) => {
      this.config = config;
    });
  }

  private createStarField() {
    this.starGraphics = this.add.graphics();
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: Math.random() * 1200,
        y: Math.random() * 800,
        alpha: Math.random() * 0.5 + 0.1,
        speed: Math.random() * 0.3 + 0.1,
      });
    }
  }

  private drawStars() {
    this.starGraphics.clear();
    for (const star of this.stars) {
      const flicker = Math.sin(this.elapsed * star.speed * 2) * 0.2 + 0.8;
      const a = star.alpha * flicker;
      const color = a > 0.3 ? COLORS.starBright : COLORS.starDim;
      this.starGraphics.fillStyle(color, a);
      this.starGraphics.fillCircle(star.x, star.y, a > 0.4 ? 1.5 : 1);
    }
  }

  private drawConnections() {
    this.connectionGraphics.clear();
    const roomMap = new Map(this.rooms.map(r => [r.id, r]));
    const connections: [string, string][] = [
      ['command', 'research'],
      ['command', 'marketing'],
      ['command', 'ops'],
      ['command', 'factory'],
      ['research', 'ops'],
      ['marketing', 'factory'],
    ];

    for (const [aId, bId] of connections) {
      const a = roomMap.get(aId)!;
      const b = roomMap.get(bId)!;
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;

      // Dim connection line
      this.connectionGraphics.lineStyle(1, COLORS.connectionLine, 0.4);
      this.connectionGraphics.lineBetween(ax, ay, bx, by);

      // Glowing dots along the line
      const dots = 5;
      for (let i = 1; i < dots; i++) {
        const t = i / dots;
        const dx = ax + (bx - ax) * t;
        const dy = ay + (by - ay) * t;
        this.connectionGraphics.fillStyle(a.color, 0.15);
        this.connectionGraphics.fillCircle(dx, dy, 2);
      }
    }
  }

  private createRoom(room: RoomDef) {
    // Outer glow
    const glow = this.add.graphics();
    this.roomGlowMap.set(room.id, glow);

    // Room body
    const g = this.add.graphics();
    this.roomGraphicsMap.set(room.id, g);

    // Title
    const title = this.add.text(room.x + room.w / 2, room.y + 22, room.name, {
      fontFamily: '"Courier New", monospace',
      fontSize: room.id === 'command' ? '16px' : '13px',
      color: '#' + room.color.toString(16).padStart(6, '0'),
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);
    this.roomTitles.set(room.id, title);

    // Revenue text for business rooms
    if (room.id === 'marketing' || room.id === 'factory') {
      const rev = this.add.text(room.x + room.w / 2, room.y - 14, '$0.00', {
        fontFamily: '"Courier New", monospace',
        fontSize: '12px',
        color: '#' + room.color.toString(16).padStart(6, '0'),
      }).setOrigin(0.5, 0.5).setAlpha(0.7);
      this.revenueTexts.set(room.id, rev);
    }

    // Room dust particles
    const particleG = this.add.graphics();
    const pData: { x: number; y: number; vx: number; vy: number; alpha: number; speed: number }[] = [];
    for (let i = 0; i < 12; i++) {
      pData.push({
        x: room.x + Math.random() * room.w,
        y: room.y + Math.random() * room.h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.4 + 0.1,
        speed: Math.random() * 0.5 + 0.5,
      });
    }
    this.roomParticles.set(room.id, { g: particleG, data: pData });
  }

  private drawRoom(room: RoomDef, time: number) {
    const g = this.roomGraphicsMap.get(room.id)!;
    const glow = this.roomGlowMap.get(room.id)!;
    g.clear();
    glow.clear();

    const pulse = Math.sin(time * 1.5) * 0.15 + 0.85;

    // Outer glow effect
    glow.lineStyle(4, room.color, 0.08 * pulse);
    glow.strokeRoundedRect(room.x - 4, room.y - 4, room.w + 8, room.h + 8, 14);
    glow.lineStyle(2, room.color, 0.15 * pulse);
    glow.strokeRoundedRect(room.x - 2, room.y - 2, room.w + 4, room.h + 4, 12);

    // Room fill
    g.fillStyle(COLORS.roomFill, 0.85);
    g.fillRoundedRect(room.x, room.y, room.w, room.h, 10);

    // Border
    g.lineStyle(2, room.color, 0.6 * pulse);
    g.strokeRoundedRect(room.x, room.y, room.w, room.h, 10);

    // Inner corner accents
    const accentLen = 20;
    g.lineStyle(1, room.color, 0.3);
    // top-left
    g.lineBetween(room.x + 10, room.y + 6, room.x + 10 + accentLen, room.y + 6);
    g.lineBetween(room.x + 6, room.y + 10, room.x + 6, room.y + 10 + accentLen);
    // top-right
    g.lineBetween(room.x + room.w - 10, room.y + 6, room.x + room.w - 10 - accentLen, room.y + 6);
    g.lineBetween(room.x + room.w - 6, room.y + 10, room.x + room.w - 6, room.y + 10 + accentLen);
    // bottom-left
    g.lineBetween(room.x + 10, room.y + room.h - 6, room.x + 10 + accentLen, room.y + room.h - 6);
    g.lineBetween(room.x + 6, room.y + room.h - 10, room.x + 6, room.y + room.h - 10 - accentLen);
    // bottom-right
    g.lineBetween(room.x + room.w - 10, room.y + room.h - 6, room.x + room.w - 10 - accentLen, room.y + room.h - 6);
    g.lineBetween(room.x + room.w - 6, room.y + room.h - 10, room.x + room.w - 6, room.y + room.h - 10 - accentLen);

    // Draw room particles
    const rp = this.roomParticles.get(room.id);
    if (rp) {
      rp.g.clear();
      for (const p of rp.data) {
        p.x += p.vx;
        p.y += p.vy;
        // Wrap inside room
        if (p.x < room.x + 10) p.x = room.x + room.w - 10;
        if (p.x > room.x + room.w - 10) p.x = room.x + 10;
        if (p.y < room.y + 10) p.y = room.y + room.h - 10;
        if (p.y > room.y + room.h - 10) p.y = room.y + 10;

        const flicker = Math.sin(time * p.speed * 3 + p.x) * 0.3 + 0.7;
        rp.g.fillStyle(room.color, p.alpha * flicker * 0.5);
        rp.g.fillCircle(p.x, p.y, 1.5);
      }
    }

    // Update revenue
    const rev = this.revenueTexts.get(room.id);
    if (rev) {
      const roomState = this.config.rooms.find(r => r.id === room.id);
      if (roomState?.revenue !== undefined) {
        rev.setText('$' + roomState.revenue.toFixed(2));
      }
    }
  }

  private createAgents() {
    for (const agent of this.config.agents) {
      const room = this.rooms.find(r => r.id === agent.room);
      if (!room) continue;

      const isJarvis = agent.id === 'jarvis';
      const size = isJarvis ? 22 : 14;
      const baseX = room.x + room.w / 2 + (isJarvis ? 0 : (Math.random() - 0.5) * 80);
      const baseY = room.y + room.h / 2 + 15 + (isJarvis ? 0 : (Math.random() - 0.5) * 40);

      const graphics = this.add.graphics();
      const particles = this.add.graphics();

      const label = this.add.text(baseX, baseY + size + 12, agent.name, {
        fontFamily: '"Courier New", monospace',
        fontSize: isJarvis ? '12px' : '10px',
        color: '#94a3b8',
      }).setOrigin(0.5, 0.5);

      const statusDot = this.add.graphics();

      this.agentOrbs.push({
        id: agent.id,
        name: agent.name,
        room: agent.room,
        status: agent.status,
        graphics,
        label,
        statusDot,
        baseX,
        baseY,
        phase: Math.random() * Math.PI * 2,
        particles,
        particleData: [],
        size,
      });
    }

    // Factory floor business icons (simple geometric shapes)
    const factory = this.rooms.find(r => r.id === 'factory')!;
    const iconG = this.add.graphics();
    const icons = [
      { x: factory.x + factory.w * 0.3, y: factory.y + factory.h * 0.55 },
      { x: factory.x + factory.w * 0.5, y: factory.y + factory.h * 0.55 },
      { x: factory.x + factory.w * 0.7, y: factory.y + factory.h * 0.55 },
    ];
    for (const icon of icons) {
      iconG.fillStyle(COLORS.factory, 0.25);
      iconG.fillRoundedRect(icon.x - 12, icon.y - 12, 24, 24, 4);
      iconG.lineStyle(1, COLORS.factory, 0.4);
      iconG.strokeRoundedRect(icon.x - 12, icon.y - 12, 24, 24, 4);
      // Small inner detail
      iconG.fillStyle(COLORS.factory, 0.4);
      iconG.fillRect(icon.x - 5, icon.y - 5, 10, 4);
      iconG.fillRect(icon.x - 5, icon.y + 2, 10, 4);
    }
  }

  private drawAgents(time: number) {
    for (const orb of this.agentOrbs) {
      orb.graphics.clear();
      orb.statusDot.clear();
      orb.particles.clear();

      const room = this.rooms.find(r => r.id === orb.room);
      if (!room) continue;

      const color = this.getAgentColor(orb);
      const isWorking = orb.status === 'working';
      const isError = orb.status === 'error';
      const isOffline = orb.status === 'offline';

      // Bobbing animation
      const bobSpeed = isWorking ? 3 : 1.2;
      const bobAmp = isWorking ? 6 : 3;
      const bobY = Math.sin(time * bobSpeed + orb.phase) * bobAmp;
      const currentX = orb.baseX;
      const currentY = orb.baseY + bobY;

      // Update label position
      orb.label.setPosition(currentX, currentY + orb.size + 14);

      if (isOffline) {
        // Dim ring only
        orb.graphics.lineStyle(1, COLORS.offline, 0.3);
        orb.graphics.strokeCircle(currentX, currentY, orb.size);
        orb.label.setAlpha(0.3);
        continue;
      }

      orb.label.setAlpha(0.8);

      // Working particles
      if (isWorking) {
        // Spawn particles
        if (Math.random() < 0.3) {
          const angle = Math.random() * Math.PI * 2;
          orb.particleData.push({
            x: currentX + Math.cos(angle) * orb.size,
            y: currentY + Math.sin(angle) * orb.size,
            vx: Math.cos(angle) * (0.5 + Math.random()),
            vy: Math.sin(angle) * (0.5 + Math.random()),
            life: 1,
            maxLife: 40 + Math.random() * 30,
          });
        }

        // Draw and update particles
        for (let i = orb.particleData.length - 1; i >= 0; i--) {
          const p = orb.particleData[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life += 1;
          if (p.life > p.maxLife) {
            orb.particleData.splice(i, 1);
            continue;
          }
          const alpha = (1 - p.life / p.maxLife) * 0.6;
          orb.particles.fillStyle(color, alpha);
          orb.particles.fillCircle(p.x, p.y, 1.5 * (1 - p.life / p.maxLife));
        }
      } else {
        // Clear old particles
        if (orb.particleData.length > 0) orb.particleData = [];
      }

      // Outer glow
      const glowAlpha = isWorking ? 0.15 + Math.sin(time * 4) * 0.08 : 0.06;
      orb.graphics.fillStyle(color, glowAlpha);
      orb.graphics.fillCircle(currentX, currentY, orb.size * 2);
      orb.graphics.fillStyle(color, glowAlpha * 1.5);
      orb.graphics.fillCircle(currentX, currentY, orb.size * 1.5);

      // Core orb
      const coreAlpha = isWorking ? 0.7 + Math.sin(time * 5) * 0.2 : 0.4;
      orb.graphics.fillStyle(color, coreAlpha);
      orb.graphics.fillCircle(currentX, currentY, orb.size);

      // Bright center
      orb.graphics.fillStyle(0xffffff, isWorking ? 0.5 : 0.2);
      orb.graphics.fillCircle(currentX, currentY, orb.size * 0.4);

      // Highlight
      orb.graphics.fillStyle(0xffffff, 0.3);
      orb.graphics.fillCircle(currentX - orb.size * 0.25, currentY - orb.size * 0.25, orb.size * 0.2);

      // Status dot
      const dotColor = isError ? COLORS.error : isWorking ? 0x4ade80 : 0x64748b;
      const dotAlpha = isError ? (Math.sin(time * 8) * 0.4 + 0.6) : 0.8;
      orb.statusDot.fillStyle(dotColor, dotAlpha);
      orb.statusDot.fillCircle(currentX + orb.size + 4, currentY - orb.size + 2, 4);
    }
  }

  private getAgentColor(orb: AgentOrb): number {
    if (orb.status === 'error') return COLORS.error;
    if (orb.status === 'offline') return COLORS.offline;
    const room = this.rooms.find(r => r.id === orb.room);
    return room?.color ?? COLORS.command;
  }

  private flashRoom(roomId: string) {
    const room = this.rooms.find(r => r.id === roomId);
    if (!room) return;

    const flash = this.add.graphics();
    flash.fillStyle(room.color, 0.15);
    flash.fillRoundedRect(room.x, room.y, room.w, room.h, 10);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => flash.destroy(),
    });
  }

  private updateAgentState(agent: AgentState) {
    const orb = this.agentOrbs.find(a => a.id === agent.id);
    if (orb) {
      orb.status = agent.status;
      if (agent.room !== orb.room) {
        const newRoom = this.rooms.find(r => r.id === agent.room);
        if (newRoom) {
          orb.room = agent.room;
          orb.baseX = newRoom.x + newRoom.w / 2;
          orb.baseY = newRoom.y + newRoom.h / 2 + 15;
        }
      }
    }

    // Update config
    const existing = this.config.agents.find(a => a.id === agent.id);
    if (existing) {
      Object.assign(existing, agent);
    }
  }

  update(_time: number, delta: number) {
    this.elapsed += delta / 1000;
    const t = this.elapsed;

    // Redraw stars with twinkle
    this.drawStars();

    // Animate connection lines
    this.drawAnimatedConnections(t);

    // Redraw rooms
    for (const room of this.rooms) {
      this.drawRoom(room, t);
    }

    // Animate agents
    this.drawAgents(t);
  }

  private drawAnimatedConnections(time: number) {
    this.connectionGraphics.clear();
    const roomMap = new Map(this.rooms.map(r => [r.id, r]));
    const connections: [string, string][] = [
      ['command', 'research'],
      ['command', 'marketing'],
      ['command', 'ops'],
      ['command', 'factory'],
      ['research', 'ops'],
      ['marketing', 'factory'],
    ];

    for (const [aId, bId] of connections) {
      const a = roomMap.get(aId)!;
      const b = roomMap.get(bId)!;
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;

      // Base line
      this.connectionGraphics.lineStyle(1, COLORS.connectionLine, 0.3);
      this.connectionGraphics.lineBetween(ax, ay, bx, by);

      // Traveling pulse dot
      const speed = 0.3;
      const t = ((time * speed) % 1 + 1) % 1;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      this.connectionGraphics.fillStyle(a.color, 0.5);
      this.connectionGraphics.fillCircle(px, py, 2.5);
      this.connectionGraphics.fillStyle(a.color, 0.15);
      this.connectionGraphics.fillCircle(px, py, 6);
    }
  }
}
