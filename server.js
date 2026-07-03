const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: res => res.setHeader('Cache-Control', 'no-cache')
}));

const PLACE_DURATION = 55000;
const PASSIVE_DURATION = 0;
const NEXT_ROUND_DELAY = 4000;
const HIT_WIDTH = 0.3;
const MIN_ISLAND_SIZE = 6;
const SHRINK_FACTOR = 0.8;

const PASSIVE_IDS = ['dodge'];
const ACTIVE_IDS = ['shotgun', 'sniper', 'taser', 'foresight', 'shield'];
const SHOTGUN_SPREAD = 0.34;
const SHOTGUN_RANGE = 3;

const HAT_IDS = ['none', 'party', 'tophat', 'halo', 'horns', 'bunny', 'crown', 'propeller', 'chef'];
const BACK_IDS = ['none', 'devilwing', 'chickenwing', 'angelwing', 'jetpack', 'cape', 'balloon'];
const BODY_IDS = ['islander', 'islander-girl', 'ninja', 'princess', 'pirate', 'suitguy', 'dino', 'armedguy'];

const SHOT_START_DELAY = 4800;
const SHOT_INTERVAL = 1600;
const SHOT_END_PAUSE = 1400;

const COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#ff6fa3', '#95a5a6', '#34495e'
];

const BOT_NAMES = [
  'บอทน้อย', 'โรบอทเทา', 'ไซบอร์กเป้', 'ลุงหุ่นยนต์', 'ป๋าเหล็ก',
  'จอมเงียบ', 'สไนเปอร์บอท', 'เจ้าเหล็กกล้า', 'มิสเตอร์บอท', 'น้องกลไก'
];

const MAX_PLAYERS = 10;
const rooms = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function computeIslandSize(playerCount) {
  const base = Math.min(30, Math.max(12, 10 + Math.ceil(playerCount * 1.6)));
  return Math.max(MIN_ISLAND_SIZE, Math.round(base * 0.75));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function skillDisplayName(skillId) {
  const names = {
    shotgun: 'Shotgun',
    sniper: 'Sniper',
    taser: 'Taser',
    foresight: 'Foresight',
    shield: 'Shield'
  };
  return names[skillId] || 'Active Skill';
}

function rayExitDetail(ox, oz, dx, dz, half, maxDist = 40) {
  let t = maxDist;
  let wall = null;
  if (dx > 1e-6) {
    const tx = (half - ox) / dx;
    if (tx < t) { t = tx; wall = 'x'; }
  } else if (dx < -1e-6) {
    const tx = (-half - ox) / dx;
    if (tx < t) { t = tx; wall = 'x'; }
  }
  if (dz > 1e-6) {
    const tz = (half - oz) / dz;
    if (tz < t) { t = tz; wall = 'z'; }
  } else if (dz < -1e-6) {
    const tz = (-half - oz) / dz;
    if (tz < t) { t = tz; wall = 'z'; }
  }
  return { dist: Math.max(0.1, t), wall, exited: wall !== null && t < maxDist };
}

function reflectAngle(ang, wall) {
  const dx = Math.sin(ang);
  const dz = Math.cos(ang);
  const ndx = wall === 'x' ? -dx : dx;
  const ndz = wall === 'z' ? -dz : dz;
  return Math.atan2(ndx, ndz);
}

function angleDiff(a, b) {
  let d = (a - b + Math.PI) % (Math.PI * 2) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function logSafeName(name) {
  return (name || 'Player').slice(0, 16);
}

class Room {
  constructor(code, hostId, mode = 'classic') {
    this.code = code;
    this.hostId = hostId;
    this.mode = mode === 'skill' ? 'skill' : 'classic';
    this.state = 'lobby';
    this.players = new Map();
    this.locked = false;
    this.round = 0;
    this.islandSize = 12;
    this.timer = null;
    this.roundEndsAt = 0;
    this.passiveEndsAt = 0;
    this.botCounter = 0;
    this.eventLog = [];
    this.spectatorRoom = `${code}::spectators`;
  }

  isSkillMode() { return this.mode === 'skill'; }

  joinSpectators(id) {
    const sock = io.sockets.sockets.get(id);
    if (sock) sock.join(this.spectatorRoom);
  }

  leaveSpectators(id) {
    const sock = io.sockets.sockets.get(id);
    if (sock) sock.leave(this.spectatorRoom);
  }

  addEvent(text, type = 'info') {
    this.eventLog.unshift({ text, type, ts: Date.now() });
    this.eventLog = this.eventLog.slice(0, 12);
    io.to(this.code).emit('eventLogUpdate', { events: this.eventLog });
  }

  publicPlayers() {
    const revealSkills = this.isSkillMode() && this.state !== 'lobby' && this.state !== 'passive';
    return [...this.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      alive: p.alive,
      isBot: !!p.isBot,
      hat: p.hat,
      back: p.back,
      body: p.body,
      passiveSkill: revealSkills ? p.passiveSkill : null,
      activeSkill: revealSkills ? p.activeSkill : null,
      kills: p.kills || 0
    }));
  }

  realPlayerCount() {
    return [...this.players.values()].filter(p => !p.isBot).length;
  }

  addBot() {
    if (this.state !== 'lobby') return;
    if (this.players.size >= MAX_PLAYERS) return;
    const id = `bot-${Date.now()}-${this.botCounter}`;
    const name = BOT_NAMES[this.botCounter % BOT_NAMES.length];
    this.botCounter += 1;
    const color = COLORS[this.players.size % COLORS.length];
    this.players.set(id, {
      id, name, color, x: 0, z: 0, angle: 0,
      alive: true, ready: false, isBot: true,
      hat: 'none',
      back: 'none',
      body: BODY_IDS[Math.floor(Math.random() * BODY_IDS.length)],
      passiveSkill: null,
      activeSkill: null,
      kills: 0
    });
  }

  removeBot(id) {
    const p = this.players.get(id);
    if (p && p.isBot) this.players.delete(id);
  }

  setMode(mode) {
    if (this.state !== 'lobby') return;
    this.mode = mode === 'skill' ? 'skill' : 'classic';
    this.broadcastRoom();
  }

  setLocked(locked) {
    if (this.state !== 'lobby') return;
    this.locked = !!locked;
    this.addEvent(this.locked ? 'ห้องถูกล็อกแล้ว' : 'ห้องถูกปลดล็อกแล้ว', 'system');
    this.broadcastRoom();
  }

  broadcastReady() {
    const alive = [...this.players.values()].filter(p => p.alive);
    const readyCount = alive.filter(p => p.ready).length;
    io.to(this.code).emit('readyUpdate', { ready: readyCount, total: alive.length });
  }

  broadcastSkillState(extra = {}) {
    if (!this.isSkillMode()) {
      io.to(this.code).emit('skillState', { mode: this.mode, players: [], ...extra });
      return;
    }
    const revealSkills = this.state !== 'passive' && this.state !== 'lobby';
    io.to(this.code).emit('skillState', {
      mode: this.mode,
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        hat: p.hat,
        back: p.back,
        body: p.body,
        alive: p.alive,
        passiveSkill: revealSkills ? p.passiveSkill : null,
        activeSkill: revealSkills ? p.activeSkill : null,
        moveLocked: !!p.moveLocked,
        passiveSelected: !!p.passiveSkill
      })),
      ...extra
    });
  }

  setReady(id) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.state !== 'placing' || p.ready) return;
    p.ready = true;
    this.addEvent(`${p.name} ยืนยันตำแหน่งและทิศยิงแล้ว`, 'move');
    this.broadcastReady();
    const alive = [...this.players.values()].filter(pl => pl.alive);
    if (alive.length > 0 && alive.every(pl => pl.ready)) {
      clearTimeout(this.timer);
      this.resolveRound();
    }
  }

  setPassiveSkill(id, skillId) {
    if (!this.isSkillMode() || this.state !== 'passive') return;
    if (!PASSIVE_IDS.includes(skillId)) return;
    const p = this.players.get(id);
    if (!p || p.isBot || !p.alive || p.passiveSkill) return;
    p.passiveSkill = skillId;
    this.addEvent(`${p.name} เลือก Passive Skill แล้ว`, 'skill');
    io.to(id).emit('passiveConfirmed', { skillId });
    this.broadcastSkillState({ passivePicking: true, endsAt: this.passiveEndsAt });
    this.maybeFinishPassiveSelection();
  }

  maybeFinishPassiveSelection() {
    const realAlive = [...this.players.values()].filter(p => !p.isBot && p.alive);
    if (realAlive.length > 0 && realAlive.every(p => p.passiveSkill)) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.finishPassiveSelection(), 350);
    }
  }

  finishPassiveSelection() {
    if (!this.isSkillMode() || this.state !== 'passive') return;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (!p.passiveSkill) {
        p.passiveSkill = 'dodge';
        this.addEvent(`${p.name} ไม่เลือกทันเวลา ระบบสุ่ม Passive Skill ให้`, 'skill');
      }
    }
    io.to(this.code).emit('passiveReveal', {
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, back: p.back, body: p.body, passiveSkill: p.passiveSkill }))
    });
    this.addEvent('เปิดเผย Passive Skill ของทุกคนแล้ว', 'skill');
    this.startRound();
  }

  useActiveSkill(id, skillId) {
    if (!this.isSkillMode() || this.state !== 'placing') return;
    if (!ACTIVE_IDS.includes(skillId)) return;
    const p = this.players.get(id);
    if (!p || !p.alive || p.ready) return;
    if (p.activeSkill !== skillId) return;
    p.activeUsed = skillId;
    p.activeSkill = null;
    if (skillId === 'foresight') p.skipShot = true;
    const skillName = skillDisplayName(skillId);
    this.addEvent(`${p.name} ใช้ Active Skill: ${skillName}`, 'skill');
    io.to(id).emit('activeUsedConfirmed', { skillId });
    io.to(this.code).emit('activeSkillUsed', { playerId: p.id, playerName: p.name, skillId, skillName });
    this.broadcastSkillState();
  }

  decideBotMove(bot, half) {
    if (!bot.moveLocked) {
      bot.x = (Math.random() * 2 - 1) * half;
      bot.z = (Math.random() * 2 - 1) * half;
    }
    const towardCenter = Math.atan2(-bot.x, -bot.z);
    if (Math.random() < 0.6) {
      bot.angle = towardCenter + (Math.random() - 0.5) * 0.9;
    } else {
      bot.angle = Math.random() * Math.PI * 2;
    }
  }

  broadcastRoom() {
    io.to(this.code).emit('roomUpdate', {
      code: this.code,
      hostId: this.hostId,
      state: this.state,
      mode: this.mode,
      locked: this.locked,
      round: this.round,
      players: this.publicPlayers()
    });
    broadcastRoomList();
  }

  aliveIds() {
    return [...this.players.values()].filter(p => p.alive).map(p => p.id);
  }

  startGame() {
    if (this.players.size < 2) return;
    this.round = 0;
    this.eventLog = [];
    for (const p of this.players.values()) {
      p.alive = true;
      p.ready = false;
      p.passiveSkill = this.isSkillMode() ? 'dodge' : null;
      p.activeSkill = null;
      p.activeUsed = null;
      p.kills = 0;
      p.dodgeUsed = false;
      p.secondChanceUsed = false;
      p.moveLocked = false;
      p.nextMoveLocked = false;
      p.skipShot = false;
      this.leaveSpectators(p.id);
    }
    this.islandSize = computeIslandSize(this.players.size);
    this.addEvent(this.isSkillMode() ? 'เริ่มเกม Skill Mode: ทุกคนได้รับ Dodge 1 ครั้ง' : 'เริ่มเกม Classic Mode', 'system');
    this.startRound();
  }

  startPassiveSelection() {
    this.state = 'passive';
    this.passiveEndsAt = Date.now() + PASSIVE_DURATION;
    for (const p of this.players.values()) {
      if (p.isBot) p.passiveSkill = 'dodge';
    }
    io.to(this.code).emit('passiveSelectStart', {
      duration: PASSIVE_DURATION,
      endsAt: this.passiveEndsAt,
      skills: PASSIVE_IDS
    });
    this.broadcastRoom();
    this.broadcastSkillState({ passivePicking: true, endsAt: this.passiveEndsAt });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finishPassiveSelection(), PASSIVE_DURATION);
  }

  startRound() {
    this.round += 1;
    this.state = 'placing';
    const half = this.islandSize / 2 - 0.6;
    const aliveList = [...this.players.values()].filter(p => p.alive);
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      p.ready = false;
      p.activeUsed = null;
      p.skipShot = false;
      p.moveLocked = !!p.nextMoveLocked;
      p.nextMoveLocked = false;
      if (this.isSkillMode() && p.activeSkill && Math.random() < 0.35 && p.isBot) {
        p.activeUsed = p.activeSkill;
        p.activeSkill = null;
        if (p.activeUsed === 'foresight') p.skipShot = true;
        const skillName = skillDisplayName(p.activeUsed);
        this.addEvent(`${p.name} ใช้ Active Skill: ${skillName}`, 'skill');
        io.to(this.code).emit('activeSkillUsed', { playerId: p.id, playerName: p.name, skillId: p.activeUsed, skillName });
      }
      if (p.isBot) {
        this.decideBotMove(p, half);
        p.ready = true;
      } else {
        if (!p.moveLocked) {
          p.x = (Math.random() - 0.5) * 1.5;
          p.z = (Math.random() - 0.5) * 1.5;
        }
        p.angle = Math.random() * Math.PI * 2;
      }
    }
    this.roundEndsAt = Date.now() + PLACE_DURATION;
    const roster = aliveList.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      hat: p.hat,
      back: p.back,
      body: p.body,
      passiveSkill: this.isSkillMode() ? p.passiveSkill : null,
      activeSkill: this.isSkillMode() ? p.activeSkill : null,
      moveLocked: !!p.moveLocked,
      x: p.x,
      z: p.z,
      angle: p.angle
    }));
    io.to(this.code).emit('roundStart', {
      mode: this.mode,
      round: this.round,
      islandSize: this.islandSize,
      duration: PLACE_DURATION,
      endsAt: this.roundEndsAt,
      bounds: half,
      roster
    });
    for (const p of aliveList) {
      if (!p.isBot) io.to(p.id).emit('yourSkillState', {
        passiveSkill: this.isSkillMode() ? p.passiveSkill : null,
        activeSkill: this.isSkillMode() ? p.activeSkill : null,
        moveLocked: !!p.moveLocked
      });
    }
    io.to(this.spectatorRoom).emit('spectateSnapshot', {
      round: this.round,
      players: [...this.players.values()].filter(p => p.alive).map(p => ({
        id: p.id, name: p.name, color: p.color, hat: p.hat, back: p.back, body: p.body,
        x: p.x, z: p.z, angle: p.angle
      }))
    });
    this.addEvent(`เริ่มรอบ ${this.round}`, 'system');
    this.broadcastReady();
    this.broadcastSkillState();
    this.broadcastRoom();
    clearTimeout(this.timer);
    const alive = [...this.players.values()].filter(p => p.alive);
    if (alive.length > 0 && alive.every(p => p.ready)) {
      this.timer = setTimeout(() => this.resolveRound(), 400);
    } else {
      this.timer = setTimeout(() => this.resolveRound(), PLACE_DURATION);
    }
  }

  handleMove(id, x, z, angle) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.state !== 'placing' || p.ready) return;
    const half = this.islandSize / 2 - 0.6;
    if (!p.moveLocked) {
      p.x = Math.max(-half, Math.min(half, x));
      p.z = Math.max(-half, Math.min(half, z));
    }
    p.angle = angle;
    io.to(this.spectatorRoom).emit('spectateMove', { id: p.id, x: p.x, z: p.z, angle: p.angle });
  }

  resolveRound() {
    if (this.state !== 'placing') return;
    this.state = 'reveal';
    clearTimeout(this.timer);

    const skillMode = this.isSkillMode();
    const alive = [...this.players.values()].filter(p => p.alive);
    const aliveMap = new Map(alive.map(p => [p.id, p]));
    const fieldHalf = this.islandSize / 2;
    const firingOrder = shuffle(alive);
    const stillAlive = new Set(alive.map(p => p.id));
    const shots = [];
    const firedIds = new Set();
    const eliminated = [];
    const protectedIds = new Set();
    const secondChanceCounterIds = new Set();

    const castSegment = (ox, oz, ang, shooter, excludeIds, ev, options = {}) => {
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const cands = [];
      const maxDist = options.maxDist || 40;
      const width = options.hitWidth || HIT_WIDTH;
      for (const t of alive) {
        if (t.id === shooter.id || !stillAlive.has(t.id) || excludeIds.has(t.id)) continue;
        const vx = t.x - ox, vz = t.z - oz;
        const fwd = vx * dx + vz * dz;
        if (fwd <= 0.05 || fwd > maxDist) continue;
        const perp = Math.abs(vx * dz - vz * dx);
        if (perp <= width) cands.push({ t, fwd });
      }
      cands.sort((a, b) => a.fwd - b.fwd);
      const exit = rayExitDetail(ox, oz, dx, dz, fieldHalf, maxDist);
      for (const c of cands) {
        if (c.fwd > exit.dist) break;
        const t = c.t;
        const hitX = t.x;
        const hitZ = t.z;

        if (skillMode && t.activeUsed === 'foresight') {
          ev.foresightDodges.push(t.id);
          excludeIds.add(t.id);
          continue;
        }
        if (skillMode && t.activeUsed === 'shield' && !protectedIds.has(t.id)) {
          protectedIds.add(t.id);
          ev.shieldBlocks.push({ id: t.id, source: 'active' });
          return { hitId: null, x: hitX, z: hitZ, exited: false, blocked: true, blockId: t.id };
        }
        if (skillMode && t.passiveSkill === 'dodge' && !t.dodgeUsed) {
          t.dodgeUsed = true;
          ev.dodges.push(t.id);
          excludeIds.add(t.id);
          continue;
        }
        if (skillMode && t.passiveSkill === 'secondchance' && !t.secondChanceUsed) {
          t.secondChanceUsed = true;
          const bx = t.x - Math.sin(t.angle) * 3;
          const bz = t.z - Math.cos(t.angle) * 3;
          if (Math.abs(bx) <= fieldHalf && Math.abs(bz) <= fieldHalf) {
            t.x = bx; t.z = bz;
            ev.secondChance.push({ id: t.id, x: bx, z: bz, counter: !firedIds.has(t.id) });
            if (!firedIds.has(t.id)) secondChanceCounterIds.add(t.id);
            excludeIds.add(t.id);
            continue;
          }
          ev.secondChanceFail.push(t.id);
        }
        return { hitId: t.id, x: hitX, z: hitZ, exited: false };
      }
      return { hitId: null, x: ox + dx * exit.dist, z: oz + dz * exit.dist, exited: exit.exited, wall: exit.wall };
    };

    const fireBullet = (shooter, a0, bounces, shooterHits, ev, options = {}) => {
      const segments = [];
      let ox = shooter.x, oz = shooter.z, ang = a0, bouncesLeft = bounces;
      for (let step = 0; step < 5; step++) {
        const r = castSegment(ox, oz, ang, shooter, shooterHits, ev, options);
        const seg = { x1: ox, z1: oz, x2: r.x, z2: r.z, hitId: null };
        if (r.blockId) seg.blockId = r.blockId;
        segments.push(seg);
        if (r.hitId) {
          seg.hitId = r.hitId;
          shooterHits.add(r.hitId);
          break;
        }
        if (r.exited && bouncesLeft > 0 && r.wall) {
          bouncesLeft--;
          ox = r.x; oz = r.z;
          ang = reflectAngle(ang, r.wall);
          continue;
        }
        break;
      }
      return segments;
    };

    const processShooter = (shooter, opts = {}) => {
      const isCounter = !!opts.counter;
      if (!stillAlive.has(shooter.id)) {
        shots.push({ shooterId: shooter.id, type: 'skip', skipped: true, hitIds: [] });
        return;
      }
      firedIds.add(shooter.id);
      if (skillMode && shooter.skipShot && !isCounter) {
        shots.push({ shooterId: shooter.id, type: 'foresight', skipped: true, activeUsed: 'foresight', hitIds: [], bullets: [] });
        return;
      }

      const active = skillMode && !isCounter ? shooter.activeUsed : null;
      const baseAngle = shooter.angle;
      const shooterHits = new Set();
      const ev = { dodges: [], shieldBlocks: [], secondChance: [], secondChanceFail: [], foresightDodges: [], taserLocks: [] };
      let bullets = [];
      let type = 'shot';

      if (active === 'shotgun') {
        type = 'shotgun';
        const angles = [baseAngle - SHOTGUN_SPREAD, baseAngle, baseAngle + SHOTGUN_SPREAD];
        bullets = angles.map(a => ({ segments: fireBullet(shooter, a, 0, shooterHits, ev, { maxDist: SHOTGUN_RANGE, hitWidth: HIT_WIDTH + 0.08 }) }));
      } else if (active === 'sniper') {
        type = 'sniper';
        bullets = [{ segments: fireBullet(shooter, baseAngle, 0, shooterHits, ev, { maxDist: 60, hitWidth: HIT_WIDTH * 0.6 }) }];
      } else if (active === 'taser') {
        type = 'taser';
        bullets = [{ segments: fireBullet(shooter, baseAngle, 0, shooterHits, ev, { maxDist: 40, hitWidth: HIT_WIDTH }) }];
        shooterHits.forEach(id => {
          const victim = aliveMap.get(id);
          if (victim && stillAlive.has(id)) {
            victim.nextMoveLocked = true;
            ev.taserLocks.push(id);
          }
        });
        shooterHits.clear(); // taser stuns, it does not kill
      } else {
        const bounces = skillMode && shooter.passiveSkill === 'bounce' ? 1 : 0;
        bullets = [{ segments: fireBullet(shooter, baseAngle, bounces, shooterHits, ev) }];
      }

      shooterHits.forEach(id => stillAlive.delete(id));
      shots.push({
        shooterId: shooter.id,
        type,
        activeUsed: active,
        counter: isCounter,
        bullets,
        hitIds: [...shooterHits],
        dodges: ev.dodges,
        shieldBlocks: ev.shieldBlocks,
        secondChance: ev.secondChance,
        secondChanceFail: ev.secondChanceFail,
        foresightDodges: ev.foresightDodges,
        taserLocks: ev.taserLocks
      });
    };

    for (const shooter of firingOrder) {
      processShooter(shooter);
      const counters = [...secondChanceCounterIds].filter(id => !firedIds.has(id) && stillAlive.has(id));
      secondChanceCounterIds.clear();
      counters.forEach(id => processShooter(aliveMap.get(id), { counter: true }));
    }

    for (const p of alive) {
      if (!stillAlive.has(p.id)) {
        p.alive = false;
        eliminated.push(p.id);
        if (!p.isBot) this.joinSpectators(p.id);
      }
    }

    const eliminatedSet = new Set(eliminated);
    shots.forEach(s => {
      const shooter = aliveMap.get(s.shooterId);
      if (!shooter) return;
      const uniqueKills = new Set((s.hitIds || []).filter(id => eliminatedSet.has(id)));
      shooter.kills = (shooter.kills || 0) + uniqueKills.size;
    });

    let angelGrant = null;
    if (skillMode && this.aliveIds().length > 1 && firingOrder.length >= 2) {
      const hitCountByShooter = new Map();
      shots.forEach(s => {
        if (!s.counter && s.shooterId) hitCountByShooter.set(s.shooterId, (s.hitIds || []).length);
      });
      let startIndex = firingOrder.length - 1;
      const lastShooter = firingOrder[startIndex];
      if (lastShooter && (hitCountByShooter.get(lastShooter.id) || 0) > 0) startIndex = firingOrder.length - 2;

      // Active Skill capacity rule: each player can hold only 1 Active Skill.
      // If the eligible player already has one, pass the blessing upward in the firing order.
      let candidate = null;
      for (let i = startIndex; i >= 0; i--) {
        const p = firingOrder[i];
        if (!p || !p.alive) continue;
        if (p.activeSkill) {
          this.addEvent(`${p.name} มี Active Skill อยู่แล้ว นางฟ้าเลื่อนไปยังลำดับถัดขึ้นไป`, 'angel');
          continue;
        }
        candidate = p;
        break;
      }

      if (candidate) {
        const skillId = pickRandom(ACTIVE_IDS);
        candidate.activeSkill = skillId;
        const skillName = skillDisplayName(skillId);
        angelGrant = { playerId: candidate.id, playerName: candidate.name, skillId, skillName };
        this.addEvent(`นางฟ้ามอบ ${skillName} ให้ ${candidate.name}`, 'angel');
      } else {
        this.addEvent('นางฟ้าไม่ได้มอบ Active Skill เพราะผู้เล่นที่มีสิทธิ์ถือสกิลครบแล้ว', 'angel');
      }
    }

    shots.forEach(s => {
      const p = aliveMap.get(s.shooterId);
      if (!p) return;
      if (s.type === 'skip' || s.skipped) this.addEvent(`${p.name} ไม่ได้ยิงในรอบนี้`, 'shot');
      else if ((s.hitIds || []).length) this.addEvent(`${p.name} ยิงโดน ${(s.hitIds || []).length} เป้าหมาย`, 'shot');
      else if ((s.taserLocks || []).length) this.addEvent(`${p.name} ยิง Taser โดนเป้าหมาย`, 'skill');
      else this.addEvent(`${p.name} ยิงพลาด`, 'shot');
    });

    const payload = {
      mode: this.mode,
      round: this.round,
      islandSize: this.islandSize,
      players: [...this.players.values()]
        .filter(p => alive.includes(p) || eliminated.includes(p.id))
        .map(p => ({
          id: p.id, name: p.name, color: p.color, hat: p.hat, back: p.back, body: p.body,
          x: p.x, z: p.z, angle: p.angle,
          alive: p.alive,
          wasHit: eliminated.includes(p.id),
          size: 1,
          passiveSkill: skillMode ? p.passiveSkill : null,
          activeSkill: skillMode ? p.activeSkill : null,
          activeUsed: skillMode ? p.activeUsed : null,
          moveLocked: !!p.moveLocked,
          kills: p.kills || 0
        })),
      shots,
      cards: [],
      eliminated,
      survivors: this.aliveIds(),
      angelGrant,
      skillState: skillMode ? [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color, hat: p.hat, back: p.back, body: p.body, alive: p.alive,
        passiveSkill: p.passiveSkill,
        activeSkill: p.activeSkill,
        moveLocked: !!p.moveLocked,
        kills: p.kills || 0
      })) : []
    };
    io.to(this.code).emit('roundResult', payload);
    this.broadcastSkillState();

    const revealDuration = SHOT_START_DELAY + shots.length * SHOT_INTERVAL + SHOT_END_PAUSE;
    this.timer = setTimeout(() => this.afterReveal(), revealDuration);
  }

  afterReveal() {
    const survivors = this.aliveIds();
    if (survivors.length <= 1) {
      this.state = 'ended';
      const winner = survivors[0] ? this.players.get(survivors[0]) : null;
      io.to(this.code).emit('gameOver', {
        winnerId: winner ? winner.id : null,
        winnerName: winner ? winner.name : null,
        winner: winner ? {
          id: winner.id,
          name: winner.name,
          color: winner.color,
          body: winner.body,
          hat: winner.hat,
          back: winner.back,
          kills: winner.kills || 0
        } : null,
        players: [...this.players.values()].map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          body: p.body,
          hat: p.hat,
          back: p.back,
          alive: p.alive,
          kills: p.kills || 0
        }))
      });
      return;
    }
    this.islandSize = Math.max(MIN_ISLAND_SIZE, Math.round(this.islandSize * SHRINK_FACTOR));
    this.timer = setTimeout(() => this.startRound(), NEXT_ROUND_DELAY);
    io.to(this.code).emit('nextRoundCountdown', { delay: NEXT_ROUND_DELAY, islandSize: this.islandSize });
  }

  resetToLobby() {
    clearTimeout(this.timer);
    this.state = 'lobby';
    this.round = 0;
    this.eventLog = [];
    for (const p of this.players.values()) {
      p.alive = true;
      p.ready = false;
      p.passiveSkill = null;
      p.activeSkill = null;
      p.activeUsed = null;
      p.kills = 0;
      p.dodgeUsed = false;
      p.secondChanceUsed = false;
      p.moveLocked = false;
      p.nextMoveLocked = false;
      this.leaveSpectators(p.id);
    }
    this.broadcastRoom();
    io.to(this.code).emit('eventLogUpdate', { events: [] });
    this.broadcastSkillState();
  }
}

function publicRoomList() {
  return [...rooms.values()]
    .filter(room => room.state === 'lobby')
    .map(room => {
      const host = room.players.get(room.hostId);
      return {
        code: room.code,
        hostName: host ? host.name : 'Host',
        playerCount: room.players.size,
        maxPlayers: MAX_PLAYERS,
        mode: room.mode,
        locked: !!room.locked
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

function broadcastRoomList(target = io) {
  target.emit('roomListUpdate', { rooms: publicRoomList() });
}

io.on('connection', socket => {
  let currentRoomCode = null;
  broadcastRoomList(socket);

  socket.on('createRoom', ({ name, mode }) => {
    const code = genCode();
    const room = new Room(code, socket.id, mode);
    rooms.set(code, room);
    joinRoomInternal(room, name);
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) {
      socket.emit('errorMsg', { message: 'ไม่พบห้องนี้' });
      return;
    }
    if (room.state !== 'lobby') {
      socket.emit('errorMsg', { message: 'เกมเริ่มไปแล้ว รอรอบหน้าหรือสร้างห้องใหม่' });
      return;
    }
    if (room.locked) {
      socket.emit('errorMsg', { message: 'ห้องนี้ถูกล็อกแล้ว ไม่สามารถเข้าร่วมเพิ่มได้' });
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      socket.emit('errorMsg', { message: 'ห้องเต็มแล้ว' });
      return;
    }
    joinRoomInternal(room, name);
  });

  function joinRoomInternal(room, name) {
    currentRoomCode = room.code;
    socket.join(room.code);
    const color = COLORS[room.players.size % COLORS.length];
    room.players.set(socket.id, {
      id: socket.id,
      name: logSafeName(name || 'Player'),
      color,
      x: 0, z: 0, angle: 0,
      alive: true,
      ready: false,
      hat: 'none',
      back: 'none',
      body: 'islander',
      passiveSkill: null,
      activeSkill: null,
      kills: 0
    });
    socket.emit('joined', { code: room.code, selfId: socket.id });
    socket.emit('eventLogUpdate', { events: room.eventLog });
    room.broadcastRoom();
  }

  socket.on('setMode', ({ mode }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.setMode(mode);
  });

  socket.on('toggleRoomLock', () => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.setLocked(!room.locked);
  });

  socket.on('startGame', () => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    if (room.players.size < 2) return;
    room.startGame();
    room.broadcastRoom();
  });

  socket.on('addBot', () => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.addBot();
    room.broadcastRoom();
  });

  socket.on('setHat', ({ hat }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'lobby') return;
    const p = room.players.get(socket.id);
    if (!p || !HAT_IDS.includes(hat)) return;
    p.hat = hat;
    room.broadcastRoom();
  });

  socket.on('setBack', ({ back }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'lobby') return;
    const p = room.players.get(socket.id);
    if (!p || !BACK_IDS.includes(back)) return;
    p.back = back;
    room.broadcastRoom();
  });



  socket.on('setBody', ({ body }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'lobby') return;
    const p = room.players.get(socket.id);
    if (!p || !BODY_IDS.includes(body)) return;
    p.body = body;
    room.broadcastRoom();
  });

  socket.on('setColor', ({ color }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.state !== 'lobby') return;
    const p = room.players.get(socket.id);
    if (!p || !COLORS.includes(color)) return;
    p.color = color;
    room.broadcastRoom();
  });

  socket.on('removeBot', ({ id }) => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id || room.state !== 'lobby') return;
    room.removeBot(id);
    room.broadcastRoom();
  });

  socket.on('setPassiveSkill', ({ skillId }) => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    room.setPassiveSkill(socket.id, skillId);
  });

  socket.on('useActiveSkill', ({ skillId }) => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    room.useActiveSkill(socket.id, skillId);
  });

  socket.on('move', ({ x, z, angle }) => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    room.handleMove(socket.id, x, z, angle);
  });

  socket.on('ready', () => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    room.setReady(socket.id);
  });

  socket.on('playAgain', () => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    room.resetToLobby();
  });

  socket.on('endToLobby', () => {
    const room = rooms.get(currentRoomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.state === 'lobby') return;
    room.resetToLobby();
  });

  socket.on('disconnect', () => {
    const room = rooms.get(currentRoomCode);
    if (!room) return;
    room.players.delete(socket.id);
    if (room.realPlayerCount() === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.code);
      broadcastRoomList();
      return;
    }
    if (room.hostId === socket.id) {
      const nextHost = [...room.players.values()].find(p => !p.isBot);
      room.hostId = nextHost ? nextHost.id : null;
    }
    room.broadcastRoom();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Duel Island running at http://localhost:${PORT}`);
});
