import Phaser from 'phaser';
import { AgentState, AgentStatus, DungeonConfig, DEFAULT_CONFIG } from './types';

const C = {
  bg: 0x080b14,
  command: 0x00e5ff, research: 0xb388ff, marketing: 0x69f0ae,
  ops: 0xff9100, etsy: 0xf5641e, printify: 0x39d4a5, solar: 0xffd740,
  error: 0xff1744, offline: 0x2a2a3a, dim: 0x1a2030,
  roomFill: 0x0c1220, wallLine: 0x1a2744,
  desk: 0x1e293b, screen: 0x0f172a, screenGlow: 0x00e5ff,
};

interface RoomDef { id: string; name: string; x: number; y: number; w: number; h: number; color: number; icon?: string; }
interface AgentSprite {
  id: string; name: string; room: string; status: AgentStatus; task?: string;
  x: number; y: number; phase: number; walkPhase: number; facing: number;
  deskX: number; deskY: number; // where their desk is
}

export default class DungeonScene extends Phaser.Scene {
  private config: DungeonConfig = DEFAULT_CONFIG;
  private rooms: RoomDef[] = [];
  private agents: AgentSprite[] = [];
  private t = 0;
  private g!: Phaser.GameObjects.Graphics; // main draw surface
  private stars: { x: number; y: number; a: number; s: number }[] = [];

  constructor() { super({ key: 'DungeonScene' }); }

  create() {
    this.g = this.add.graphics();
    // Stars
    for (let i = 0; i < 300; i++) {
      this.stars.push({ x: Math.random() * 1400, y: Math.random() * 900, a: Math.random() * 0.6 + 0.1, s: Math.random() * 2 + 0.5 });
    }

    // 8 rooms — command center large in middle, 3 left, 4 right
    const cx = 700, cy = 420;
    this.rooms = [
      { id: 'command', name: 'COMMAND CENTER', x: cx - 180, y: cy - 130, w: 360, h: 260, color: C.command },
      { id: 'research', name: 'RESEARCH LAB', x: 30, y: 30, w: 280, h: 200, color: C.research },
      { id: 'marketing', name: 'MARKETING BAY', x: 30, y: 270, w: 280, h: 200, color: C.marketing },
      { id: 'ops', name: 'OPS DECK', x: 30, y: 510, w: 280, h: 200, color: C.ops },
      { id: 'etsy', name: 'ETSY STORE', x: 1090, y: 20, w: 280, h: 160, color: C.etsy, icon: '🛍️' },
      { id: 'printify', name: 'PRINTIFY SHOP', x: 1090, y: 200, w: 280, h: 160, color: C.printify, icon: '🖨️' },
      { id: 'solar', name: 'SOLAR PIPELINE', x: 1090, y: 380, w: 280, h: 160, color: C.solar, icon: '☀️' },
      { id: 'roofing', name: 'PREMIUM ROOFING', x: 1090, y: 560, w: 280, h: 160, color: 0x1a3a6b, icon: '🏠' },
    ];

    // Create agents at their desks
    for (const a of this.config.agents) {
      const room = this.rooms.find(r => r.id === a.room);
      if (!room) continue;
      const deskX = room.x + room.w / 2 + (Math.random() - 0.5) * (room.w * 0.4);
      const deskY = room.y + room.h * 0.55 + (Math.random() - 0.5) * 30;
      this.agents.push({
        id: a.id, name: a.name, room: a.room, status: a.status, task: a.currentTask,
        x: deskX, y: deskY, phase: Math.random() * Math.PI * 2,
        walkPhase: Math.random() * Math.PI * 2, facing: 1,
        deskX, deskY,
      });
    }

    // Click handler
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      for (const room of this.rooms) {
        if (p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h) {
          this.game.events.emit('room-click', room.id);
          break;
        }
      }
    });

    this.game.events.on('update-agent', (a: AgentState) => {
      const sprite = this.agents.find(s => s.id === a.id);
      if (sprite) { sprite.status = a.status; sprite.task = a.currentTask; }
    });
    this.game.events.on('update-config', (c: DungeonConfig) => { this.config = c; });
  }

  update(_time: number, delta: number) {
    this.t += delta / 1000;
    this.g.clear();
    this.drawBackground();
    this.drawConnections();
    for (const room of this.rooms) this.drawRoom(room);
    for (const agent of this.agents) this.drawAgent(agent);
  }

  private drawBackground() {
    this.g.fillStyle(C.bg, 1);
    this.g.fillRect(0, 0, 1400, 900);
    // Stars
    for (const s of this.stars) {
      const flicker = Math.sin(this.t * s.s + s.x) * 0.3 + 0.7;
      this.g.fillStyle(0x94a3b8, s.a * flicker);
      this.g.fillCircle(s.x, s.y, flicker > 0.8 ? 1.5 : 0.8);
    }
    // Grid lines
    this.g.lineStyle(1, 0x0f1a2e, 0.15);
    for (let x = 0; x < 1400; x += 50) this.g.lineBetween(x, 0, x, 900);
    for (let y = 0; y < 900; y += 50) this.g.lineBetween(0, y, 1400, y);
  }

  private drawConnections() {
    const rm = new Map(this.rooms.map(r => [r.id, r]));
    const conns: [string, string][] = [
      ['command', 'research'], ['command', 'marketing'], ['command', 'ops'],
      ['command', 'etsy'], ['command', 'printify'], ['command', 'solar'],
      ['research', 'marketing'], ['etsy', 'printify'],
    ];
    for (const [a, b] of conns) {
      const ra = rm.get(a)!, rb = rm.get(b)!;
      const ax = ra.x + ra.w / 2, ay = ra.y + ra.h / 2;
      const bx = rb.x + rb.w / 2, by = rb.y + rb.h / 2;
      // Line
      this.g.lineStyle(1, C.wallLine, 0.25);
      this.g.lineBetween(ax, ay, bx, by);
      // Traveling pulse
      const spd = 0.25 + conns.indexOf([a, b] as any) * 0.03;
      const tt = ((this.t * spd) % 1 + 1) % 1;
      const px = ax + (bx - ax) * tt, py = ay + (by - ay) * tt;
      this.g.fillStyle(ra.color, 0.6);
      this.g.fillCircle(px, py, 2.5);
      this.g.fillStyle(ra.color, 0.12);
      this.g.fillCircle(px, py, 8);
    }
  }

  private drawRoom(r: RoomDef) {
    const pulse = Math.sin(this.t * 1.5 + r.x * 0.01) * 0.15 + 0.85;
    const isCommand = r.id === 'command';

    // Floor shadow
    this.g.fillStyle(0x000000, 0.3);
    this.g.fillRoundedRect(r.x + 4, r.y + 4, r.w, r.h, 8);

    // Room fill — darker interior
    this.g.fillStyle(C.roomFill, 0.92);
    this.g.fillRoundedRect(r.x, r.y, r.w, r.h, 8);

    // Floor tiles (perspective grid)
    this.g.lineStyle(1, r.color, 0.04);
    for (let y = r.y + 40; y < r.y + r.h; y += 20) {
      this.g.lineBetween(r.x + 8, y, r.x + r.w - 8, y);
    }

    // Neon border
    this.g.lineStyle(2, r.color, 0.5 * pulse);
    this.g.strokeRoundedRect(r.x, r.y, r.w, r.h, 8);
    // Outer glow
    this.g.lineStyle(6, r.color, 0.06 * pulse);
    this.g.strokeRoundedRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 11);

    // Corner brackets
    const bl = 18;
    this.g.lineStyle(2, r.color, 0.4);
    // TL
    this.g.lineBetween(r.x + 4, r.y + 4, r.x + 4 + bl, r.y + 4);
    this.g.lineBetween(r.x + 4, r.y + 4, r.x + 4, r.y + 4 + bl);
    // TR
    this.g.lineBetween(r.x + r.w - 4, r.y + 4, r.x + r.w - 4 - bl, r.y + 4);
    this.g.lineBetween(r.x + r.w - 4, r.y + 4, r.x + r.w - 4, r.y + 4 + bl);
    // BL
    this.g.lineBetween(r.x + 4, r.y + r.h - 4, r.x + 4 + bl, r.y + r.h - 4);
    this.g.lineBetween(r.x + 4, r.y + r.h - 4, r.x + 4, r.y + r.h - 4 - bl);
    // BR
    this.g.lineBetween(r.x + r.w - 4, r.y + r.h - 4, r.x + r.w - 4 - bl, r.y + r.h - 4);
    this.g.lineBetween(r.x + r.w - 4, r.y + r.h - 4, r.x + r.w - 4, r.y + r.h - 4 - bl);

    // Room title bar
    this.g.fillStyle(r.color, 0.08);
    this.g.fillRoundedRect(r.x + 8, r.y + 6, r.w - 16, 22, 4);
    // Status dot in title
    const roomCfg = this.config.rooms.find(rc => rc.id === r.id);
    const dotColor = roomCfg?.status === 'active' ? 0x4ade80 : roomCfg?.status === 'alert' ? C.error : 0x64748b;
    this.g.fillStyle(dotColor, 0.9);
    this.g.fillCircle(r.x + 20, r.y + 17, 3);

    // Revenue display for business rooms
    if (roomCfg?.revenue !== undefined && roomCfg.revenue > 0) {
      this.g.fillStyle(0x4ade80, 0.12);
      this.g.fillRoundedRect(r.x + r.w - 90, r.y + 8, 80, 18, 4);
    }

    // Desk/workstation in each room
    this.drawDesk(r.x + r.w * 0.35, r.y + r.h * 0.5, r.color);
    if (!isCommand) {
      this.drawDesk(r.x + r.w * 0.65, r.y + r.h * 0.5, r.color);
    } else {
      // Command center gets a big center console
      this.drawCommandConsole(r.x + r.w / 2, r.y + r.h * 0.45, r.color);
    }

    // Ambient particles
    for (let i = 0; i < 6; i++) {
      const px = r.x + 20 + ((this.t * 8 + i * 47) % (r.w - 40));
      const py = r.y + 35 + Math.sin(this.t * 0.8 + i * 1.7) * (r.h * 0.3);
      this.g.fillStyle(r.color, 0.08 + Math.sin(this.t + i) * 0.04);
      this.g.fillCircle(px, py, 1.2);
    }
  }

  private drawDesk(x: number, y: number, color: number) {
    // Desk surface
    this.g.fillStyle(C.desk, 0.7);
    this.g.fillRoundedRect(x - 22, y + 10, 44, 8, 2);
    // Desk legs
    this.g.fillStyle(C.desk, 0.5);
    this.g.fillRect(x - 18, y + 18, 3, 12);
    this.g.fillRect(x + 16, y + 18, 3, 12);
    // Monitor
    this.g.fillStyle(C.screen, 0.9);
    this.g.fillRoundedRect(x - 14, y - 12, 28, 22, 2);
    // Screen glow
    const flicker = Math.sin(this.t * 3 + x) * 0.1 + 0.9;
    this.g.fillStyle(color, 0.15 * flicker);
    this.g.fillRoundedRect(x - 12, y - 10, 24, 18, 1);
    // Screen lines (code/data)
    for (let i = 0; i < 4; i++) {
      const lw = 8 + Math.sin(this.t * 2 + i + x) * 6;
      this.g.fillStyle(color, 0.3);
      this.g.fillRect(x - 9, y - 7 + i * 4, lw, 2);
    }
    // Monitor stand
    this.g.fillStyle(C.desk, 0.6);
    this.g.fillRect(x - 2, y + 10, 4, -2);
  }

  private drawCommandConsole(x: number, y: number, color: number) {
    // Large curved console
    this.g.fillStyle(C.desk, 0.6);
    this.g.fillRoundedRect(x - 60, y + 15, 120, 10, 4);
    // 3 monitors
    for (let i = -1; i <= 1; i++) {
      const mx = x + i * 42;
      this.g.fillStyle(C.screen, 0.9);
      this.g.fillRoundedRect(mx - 16, y - 20, 32, 34, 3);
      const flicker = Math.sin(this.t * 2.5 + i * 1.3) * 0.1 + 0.9;
      this.g.fillStyle(color, 0.12 * flicker);
      this.g.fillRoundedRect(mx - 14, y - 18, 28, 30, 2);
      // Data on screens
      for (let j = 0; j < 5; j++) {
        const lw = 6 + Math.sin(this.t * 1.5 + j + i) * 8;
        this.g.fillStyle(color, 0.25);
        this.g.fillRect(mx - 10, y - 14 + j * 5, lw, 2);
      }
    }
    // Holographic projection above center monitor
    const haloAlpha = Math.sin(this.t * 2) * 0.1 + 0.15;
    this.g.fillStyle(color, haloAlpha);
    this.g.fillTriangle(x, y - 55, x - 20, y - 22, x + 20, y - 22);
    this.g.lineStyle(1, color, haloAlpha * 2);
    this.g.strokeTriangle(x, y - 55, x - 20, y - 22, x + 20, y - 22);
  }

  private drawAgent(a: AgentSprite) {
    const isWorking = a.status === 'working';
    const isOffline = a.status === 'offline';
    const isError = a.status === 'error';
    const room = this.rooms.find(r => r.id === a.room);
    if (!room) return;
    const color = room.color;

    if (isOffline) {
      // Just a faded silhouette
      this.drawStickFigure(a.deskX, a.deskY, 0x3a3a4a, 0.3, 0, false);
      return;
    }

    let x = a.x, y = a.y;

    if (isWorking) {
      // Seated at desk, typing animation
      x = a.deskX;
      y = a.deskY;
      const typing = Math.sin(this.t * 8 + a.phase) * 1.5;
      this.drawStickFigure(x, y, color, 0.9, typing, true);
      // Typing sparks
      if (Math.sin(this.t * 12 + a.phase) > 0.7) {
        this.g.fillStyle(color, 0.5);
        this.g.fillCircle(x + (Math.random() - 0.5) * 16, y - 4 + (Math.random() - 0.5) * 6, 1);
      }
      // Work aura
      const auraA = Math.sin(this.t * 3 + a.phase) * 0.05 + 0.08;
      this.g.fillStyle(color, auraA);
      this.g.fillCircle(x, y - 8, 25);
    } else if (a.status === 'idle') {
      // Wandering slowly in room
      a.walkPhase += 0.02;
      const wanderX = room.x + room.w * 0.3 + Math.sin(a.walkPhase * 0.7 + a.phase) * (room.w * 0.2);
      const wanderY = room.y + room.h * 0.55 + Math.cos(a.walkPhase * 0.5 + a.phase) * (room.h * 0.15);
      a.x = wanderX;
      a.y = wanderY;
      x = wanderX;
      y = wanderY;
      // Walking animation
      const step = Math.sin(this.t * 4 + a.phase) * 3;
      this.drawStickFigure(x, y, color, 0.5, step, false);
    } else if (isError) {
      x = a.deskX;
      y = a.deskY;
      const shake = Math.sin(this.t * 15) * 2;
      this.drawStickFigure(x + shake, y, C.error, 0.8, 0, true);
      // Error sparks
      this.g.fillStyle(C.error, 0.6);
      this.g.fillCircle(x + (Math.random() - 0.5) * 20, y - 15 + (Math.random() - 0.5) * 10, 1.5);
    }
  }

  private drawStickFigure(x: number, y: number, color: number, alpha: number, armAngle: number, seated: boolean) {
    const headY = y - 22;
    const bodyTop = y - 16;
    const bodyBot = seated ? y : y + 4;

    // Head
    this.g.lineStyle(2, color, alpha);
    this.g.strokeCircle(x, headY, 5);
    this.g.fillStyle(color, alpha * 0.3);
    this.g.fillCircle(x, headY, 5);

    // Eyes (tiny dots)
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(x - 2, headY - 1, 0.8);
    this.g.fillCircle(x + 2, headY - 1, 0.8);

    // Body
    this.g.lineStyle(2, color, alpha * 0.8);
    this.g.lineBetween(x, bodyTop, x, bodyBot);

    // Arms
    const armY = bodyTop + 4;
    if (seated) {
      // Arms forward (typing)
      this.g.lineBetween(x, armY, x - 8 + armAngle, armY + 6);
      this.g.lineBetween(x, armY, x + 8 - armAngle, armY + 6);
    } else {
      // Arms swinging
      this.g.lineBetween(x, armY, x - 7, armY + 5 + armAngle);
      this.g.lineBetween(x, armY, x + 7, armY + 5 - armAngle);
    }

    // Legs
    if (seated) {
      // Legs forward (seated)
      this.g.lineBetween(x, bodyBot, x - 5, bodyBot + 8);
      this.g.lineBetween(x, bodyBot, x + 5, bodyBot + 8);
    } else {
      // Walking legs
      this.g.lineBetween(x, bodyBot, x - 4 + armAngle * 0.5, bodyBot + 10);
      this.g.lineBetween(x, bodyBot, x + 4 - armAngle * 0.5, bodyBot + 10);
    }

    // Name glow behind text
    this.g.fillStyle(color, alpha * 0.06);
    this.g.fillRoundedRect(x - 22, y + 14, 44, 12, 3);
  }

  // We draw text as part of the render loop via Phaser text objects
  // But since we're using a single Graphics object, we need text objects created once
  // Let's add them in create and position in update
  private textObjects: Map<string, Phaser.GameObjects.Text> = new Map();
  private ensureText(key: string, text: string, x: number, y: number, size: string, color: string, bold = false): void {
    let obj = this.textObjects.get(key);
    if (!obj) {
      obj = this.add.text(x, y, text, {
        fontFamily: '"SF Mono", "Courier New", monospace',
        fontSize: size,
        color,
        fontStyle: bold ? 'bold' : 'normal',
      }).setOrigin(0.5, 0.5);
      this.textObjects.set(key, obj);
    }
    obj.setText(text);
    obj.setPosition(x, y);
    obj.setStyle({ color, fontSize: size, fontStyle: bold ? 'bold' : 'normal' });
  }

  // Override update to also handle text
  private firstFrame = true;
  private updateTexts() {
    // Room titles + revenue
    for (const r of this.rooms) {
      const colorHex = '#' + r.color.toString(16).padStart(6, '0');
      this.ensureText('room_' + r.id, r.name, r.x + r.w / 2, r.y + 17, r.id === 'command' ? '11px' : '9px', colorHex, true);

      // Revenue
      const rc = this.config.rooms.find(rc => rc.id === r.id);
      if (rc?.revenue !== undefined && rc.revenue > 0) {
        this.ensureText('rev_' + r.id, '$' + rc.revenue.toLocaleString(), r.x + r.w - 50, r.y + 17, '9px', '#4ade80', true);
      }
    }

    // Agent names + task
    for (const a of this.agents) {
      if (a.status === 'offline') continue;
      const room = this.rooms.find(r => r.id === a.room);
      const colorHex = room ? '#' + room.color.toString(16).padStart(6, '0') : '#94a3b8';
      this.ensureText('agent_' + a.id, a.name, a.x, a.y + 20, '8px', colorHex, true);

      if (a.task && a.status === 'working') {
        this.ensureText('task_' + a.id, a.task.substring(0, 25), a.x, a.y + 30, '7px', '#64748b');
      } else {
        const taskText = this.textObjects.get('task_' + a.id);
        if (taskText) taskText.setText('');
      }
    }
  }

  // Patch the update method to include text
  private origUpdate = this.update;
}

// Monkey-patch update to include text rendering
const origCreate = DungeonScene.prototype.create;
DungeonScene.prototype.create = function(this: any) {
  origCreate.call(this);
};

const origUpdate = DungeonScene.prototype.update;
DungeonScene.prototype.update = function(this: any, time: number, delta: number) {
  origUpdate.call(this, time, delta);
  this.updateTexts();
};
