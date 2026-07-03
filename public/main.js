import * as THREE from 'three';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/OBJLoader.js';

// ---------- Socket & UI plumbing ----------
const socket = io();
let selfId = null;
let roomCode = null;
let isHost = false;
let currentIslandSize = 16;
let currentRound = 1;

// ---------- Character customization ----------
const BODY_SKINS = [
  { id: 'islander', label: '🌴 Islander', tag: 'ISL', name: 'Islander' },
  { id: 'islander-girl', label: '🏖️ Beach Girl', tag: 'BG', name: 'Beach Girl' },
  { id: 'ninja', label: '🥷 Ninja', tag: 'NIN', name: 'Ninja' },
  { id: 'princess', label: '👑 Princess', tag: 'PRI', name: 'Princess' },
  { id: 'pirate', label: '🏴‍☠️ Pirate', tag: 'PIR', name: 'Pirate' },
  { id: 'suitguy', label: '👔 Baby Boss', tag: 'BOSS', name: 'Baby Boss' },
  { id: 'dino', label: '🦖 Dino', tag: 'DINO', name: 'Dino' },
  { id: 'armedguy', label: '🕵️ Armed Guy', tag: 'AG', name: 'Armed Guy' }
];
const HERO_BY_ID = id => BODY_SKINS.find(h => h.id === id) || BODY_SKINS[0];

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6',
  '#e67e22', '#1abc9c', '#ff6fa3', '#95a5a6', '#34495e'
];
let selfBody = 'islander';
let selfColor = '#3498db';

// Uploaded AI-generated models. Visual-only; gameplay hitbox remains unchanged.
const MODEL_SKIN_SOURCES = {
  islander: { type: 'glb', path: 'assets/models/islander.glb' },
  'islander-girl': { type: 'glb', path: 'assets/models/islander-girl.glb' },
  ninja: { type: 'glb', path: 'assets/models/ninja.glb' },
  princess: { type: 'glb', path: 'assets/models/princess.glb' },
  pirate: { type: 'glb', path: 'assets/models/pirate.glb' },
  suitguy: { type: 'glb', path: 'assets/models/suitguy.glb' },
  dino: { type: 'glb', path: 'assets/models/dino.glb' },
  armedguy: {
    type: 'obj',
    path: 'assets/models/armedguy/base.obj',
    diffuse: 'assets/models/armedguy/texture_diffuse.png',
    normal: 'assets/models/armedguy/texture_normal.png',
    roughness: 'assets/models/armedguy/texture_roughness.png',
    metalness: 'assets/models/armedguy/texture_metallic.png'
  }
};
const CHARACTER_TARGET_HEIGHT = 1.46;
const CHARACTER_FOOT_Y = 0.16;
// Hyper3D models from this set point their gun toward local +Z.
// The game also fires along local +Z, so do not flip the model.
// If a future asset is reversed, add a per-skin rotation instead of changing game aim logic.
const CHARACTER_FRONT_ROTATION_Y = 0;
const modelLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();
const modelPromiseCache = new Map();

// ---------- Hats ----------
const HATS = [
  { id: 'none', emoji: '🚫' },
  { id: 'party', emoji: '🎉' },
  { id: 'tophat', emoji: '🎩' },
  { id: 'halo', emoji: '😇' },
  { id: 'horns', emoji: '😈' },
  { id: 'bunny', emoji: '🐰' },
  { id: 'crown', emoji: '👑' },
  { id: 'propeller', emoji: '🚁' },
  { id: 'chef', emoji: '👨‍🍳' }
];
let selfHat = 'none';

// ---------- Back decorations ----------
const BACKS = [
  { id: 'none', emoji: '🚫' },
  { id: 'devilwing', emoji: '😈' },
  { id: 'chickenwing', emoji: '🍗' },
  { id: 'angelwing', emoji: '👼' },
  { id: 'jetpack', emoji: '🚀' },
  { id: 'cape', emoji: '🦸' },
  { id: 'balloon', emoji: '🎈' }
];
let selfBack = 'none';

// ---------- Skill System V2 ----------
const PASSIVE_SKILLS = [
  { id: 'dodge', emoji: '💨', name: 'Dodge', desc: 'ทุกคนเริ่มต้นด้วย Dodge 1 ครั้ง กระสุนจะวิ่งผ่านไปโดยไม่ตาย' }
];
const ACTIVE_SKILLS = [
  { id: 'shotgun', emoji: '🔫', name: 'Shotgun', desc: 'ยิงกระสุนออกเป็นรูปกรวย ระยะไม่เกิน 3 ช่อง' },
  { id: 'sniper', emoji: '🎯', name: 'Sniper', desc: 'ยิงเป็นเส้นตรงยาว เห็นแนวยิงค่อย ๆ fade หายไปใน 2 วินาที' },
  { id: 'taser', emoji: '⚡', name: 'Taser', desc: 'ถ้าโดนเป้าหมาย รอบถัดไปเป้าหมายจะเดินไม่ได้' },
  { id: 'foresight', emoji: '👁️', name: 'Foresight', desc: 'มองเห็นผู้เล่นอื่นทั้งหมดแบบ spectator ในรอบนี้ แต่คุณจะไม่ยิง' },
  { id: 'shield', emoji: '🛡️', name: 'Shield', desc: 'เมื่อกดใช้ รอบนั้นจะรับกระสุนได้โดยไม่ตาย 1 ครั้ง' }
];
const passiveById = id => PASSIVE_SKILLS.find(c => c.id === id) || null;
const activeById = id => ACTIVE_SKILLS.find(c => c.id === id) || null;
let currentMode = 'classic';
let roster = [];
let myPassiveSkill = null;
let myActiveSkill = null;
let myActiveUsed = null;
let myMoveLocked = false;

// mirrors server.js timing constants for the sequential fire animation
const SHOT_START_DELAY = 4800;
const SHOT_INTERVAL = 1600;
const BULLET_SPEED = 16; // units/sec — medium travel speed for the bullet ball
const BULLET_SLOW_SPEED = 4.0; // slow-motion when a bullet is close to a victim

const $ = id => document.getElementById(id);
let centerAnnouncementTimer = null;

function showCenterAnnouncement(message, type = 'skill', duration = 2600) {
  const el = $('centerAnnouncement');
  if (!el) return;
  clearTimeout(centerAnnouncementTimer);
  el.textContent = message;
  el.className = `centerAnnouncement ${type}`;
  // force reflow so the pop animation restarts even for back-to-back messages
  el.getBoundingClientRect();
  el.classList.add('show');
  centerAnnouncementTimer = setTimeout(() => {
    el.classList.remove('show');
    el.classList.add('hidden');
  }, duration);
}

const hatPickerEl = $('hatPicker');
HATS.forEach(h => {
  const btn = document.createElement('button');
  btn.className = 'hatBtn';
  btn.textContent = h.emoji;
  btn.title = h.id;
  btn.addEventListener('click', () => socket.emit('setHat', { hat: h.id }));
  hatPickerEl.appendChild(btn);
});
function updateHatPickerUI() {
  [...hatPickerEl.children].forEach((btn, i) => btn.classList.toggle('active', HATS[i].id === selfHat));
  updateAvatarPreview();
}

const backPickerEl = $('backPicker');
BACKS.forEach(b => {
  const btn = document.createElement('button');
  btn.className = 'hatBtn';
  btn.textContent = b.emoji;
  btn.title = b.id;
  btn.addEventListener('click', () => socket.emit('setBack', { back: b.id }));
  backPickerEl.appendChild(btn);
});
function updateBackPickerUI() {
  [...backPickerEl.children].forEach((btn, i) => btn.classList.toggle('active', BACKS[i].id === selfBack));
  updateAvatarPreview();
}


const bodyPickerEl = $('bodyPicker');
BODY_SKINS.forEach(b => {
  const btn = document.createElement('button');
  btn.className = 'bodyBtn heroCard';
  btn.title = b.name;
  btn.innerHTML = `
    <span class="heroIcon">${b.label.split(' ')[0]}</span>
    <span class="heroName">${escapeHtml(b.name)}</span>`;
  btn.addEventListener('click', () => socket.emit('setBody', { body: b.id }));
  bodyPickerEl.appendChild(btn);
});
function updateBodyPickerUI() {
  [...bodyPickerEl.children].forEach((btn, i) => btn.classList.toggle('active', BODY_SKINS[i].id === selfBody));
  const hero = HERO_BY_ID(selfBody);
  const title = $('selectedHeroTitle');
  if (title) title.textContent = hero.name;
  updateAvatarPreview();
}

const colorPickerEl = $('colorPicker');
PLAYER_COLORS.forEach(c => {
  const btn = document.createElement('button');
  btn.className = 'colorBtn';
  btn.style.background = c;
  btn.title = c;
  btn.addEventListener('click', () => socket.emit('setColor', { color: c }));
  colorPickerEl.appendChild(btn);
});
function updateColorPickerUI() {
  [...colorPickerEl.children].forEach((btn, i) => btn.classList.toggle('active', PLAYER_COLORS[i] === selfColor));
  updateAvatarPreview();
}


// ---------- 2.5D standee character art ----------
function normalizeHex(hex) {
  const value = String(hex || '#3498db').trim();
  return value.startsWith('#') ? value : `#${value}`;
}
function shadeHex(hex, amount) {
  hex = normalizeHex(hex).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
  const num = parseInt(hex, 16);
  const clamp = v => Math.max(0, Math.min(255, v));
  const r = clamp(((num >> 16) & 255) + amount);
  const g = clamp(((num >> 8) & 255) + amount);
  const b = clamp((num & 255) + amount);
  return `rgb(${r},${g},${b})`;
}
function drawEllipse(ctx, x, y, rx, ry, fill, stroke = '#20283a', line = 8) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawRoundRect(ctx, x, y, w, h, r, fill, stroke = '#20283a', line = 8) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawTriangle(ctx, pts, fill, stroke = '#20283a', line = 8) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.lineWidth = line; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function drawEye(ctx, x, y, glow = false) {
  drawEllipse(ctx, x, y, 9, 13, glow ? '#6ee7ff' : '#111827', null);
  drawEllipse(ctx, x + 3, y - 5, 3, 4, '#ffffff', null);
}
function drawSmile(ctx, x, y, w = 34) {
  ctx.beginPath();
  ctx.arc(x, y, w / 2, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#111827';
  ctx.stroke();
}
function drawBackArt(ctx, back, cx, cy) {
  switch (back) {
    case 'devilwing':
      drawTriangle(ctx, [[cx - 58, cy + 18], [cx - 118, cy + 6], [cx - 78, cy + 64]], '#8b1a1a');
      drawTriangle(ctx, [[cx + 58, cy + 18], [cx + 118, cy + 6], [cx + 78, cy + 64]], '#8b1a1a');
      break;
    case 'chickenwing':
      drawEllipse(ctx, cx - 70, cy + 42, 34, 42, '#f4c968');
      drawEllipse(ctx, cx + 70, cy + 42, 34, 42, '#f4c968');
      break;
    case 'angelwing':
      drawEllipse(ctx, cx - 72, cy + 34, 38, 55, '#ffffff');
      drawEllipse(ctx, cx + 72, cy + 34, 38, 55, '#ffffff');
      break;
    case 'jetpack':
      drawRoundRect(ctx, cx - 26, cy + 4, 52, 78, 12, '#697386');
      drawEllipse(ctx, cx - 17, cy + 91, 10, 20, '#ff8c1a', '#20283a', 5);
      drawEllipse(ctx, cx + 17, cy + 91, 10, 20, '#ff8c1a', '#20283a', 5);
      break;
    case 'cape':
      drawTriangle(ctx, [[cx - 58, cy + 0], [cx + 58, cy + 0], [cx + 34, cy + 116], [cx - 34, cy + 116]], '#d7263d');
      break;
    case 'balloon':
      ['#ff5fa2', '#ffe066', '#6ec4ff'].forEach((c, i) => {
        const bx = cx - 52 + i * 52;
        drawEllipse(ctx, bx, cy - 62 - (i % 2) * 10, 19, 25, c, '#20283a', 5);
        ctx.beginPath(); ctx.moveTo(bx, cy - 35); ctx.lineTo(cx, cy + 22);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(32,40,58,.65)'; ctx.stroke();
      });
      break;
  }
}
function drawHatArt(ctx, hat, cx, topY) {
  switch (hat) {
    case 'party':
      drawTriangle(ctx, [[cx - 27, topY + 18], [cx + 27, topY + 18], [cx + 5, topY - 56]], '#ff5fa2');
      drawEllipse(ctx, cx + 6, topY - 59, 8, 8, '#ffe066', '#20283a', 4);
      break;
    case 'tophat':
      drawRoundRect(ctx, cx - 33, topY - 50, 66, 50, 8, '#222222');
      drawRoundRect(ctx, cx - 48, topY - 6, 96, 18, 9, '#222222');
      break;
    case 'halo':
      ctx.beginPath();
      ctx.ellipse(cx, topY - 34, 45, 13, 0, 0, Math.PI * 2);
      ctx.lineWidth = 8; ctx.strokeStyle = '#ffe066'; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff8bd'; ctx.stroke();
      break;
    case 'horns':
      drawTriangle(ctx, [[cx - 44, topY + 6], [cx - 72, topY - 34], [cx - 24, topY - 6]], '#cc2b2b');
      drawTriangle(ctx, [[cx + 44, topY + 6], [cx + 72, topY - 34], [cx + 24, topY - 6]], '#cc2b2b');
      break;
    case 'bunny':
      drawRoundRect(ctx, cx - 48, topY - 74, 24, 72, 14, '#ffffff');
      drawRoundRect(ctx, cx + 24, topY - 74, 24, 72, 14, '#ffffff');
      break;
    case 'crown':
      drawTriangle(ctx, [[cx - 48, topY + 5], [cx - 32, topY - 44], [cx - 10, topY + 0], [cx, topY - 52], [cx + 10, topY + 0], [cx + 32, topY - 44], [cx + 48, topY + 5]], '#ffd23f');
      drawRoundRect(ctx, cx - 50, topY - 3, 100, 22, 8, '#ffd23f');
      break;
    case 'propeller':
      drawRoundRect(ctx, cx - 46, topY - 8, 92, 24, 14, '#ff9f43');
      drawRoundRect(ctx, cx - 6, topY - 36, 12, 38, 5, '#888888', '#20283a', 4);
      drawRoundRect(ctx, cx - 72, topY - 48, 144, 14, 7, '#ff5fa2', '#20283a', 4);
      break;
    case 'chef':
      drawRoundRect(ctx, cx - 44, topY - 2, 88, 30, 12, '#ffffff');
      drawEllipse(ctx, cx - 28, topY - 24, 28, 27, '#ffffff');
      drawEllipse(ctx, cx, topY - 34, 32, 32, '#ffffff');
      drawEllipse(ctx, cx + 30, topY - 24, 28, 27, '#ffffff');
      break;
  }
}
function drawStandeeArt(ctx, body, color, hat = 'none', back = 'none', w = 260, h = 320) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.shadowColor = 'rgba(20,40,70,0.22)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 9;
  const cx = w / 2;
  const accent = normalizeHex(color);
  const outline = '#20283a';
  drawBackArt(ctx, back, cx, 146);

  if (body === 'robot') {
    drawRoundRect(ctx, cx - 48, 122, 96, 105, 18, '#aeb9c8', outline, 8);
    drawRoundRect(ctx, cx - 58, 62, 116, 72, 18, '#d8e1ec', outline, 8);
    drawRoundRect(ctx, cx - 38, 88, 76, 26, 10, '#26384f', outline, 5);
    drawEye(ctx, cx - 18, 101, true); drawEye(ctx, cx + 18, 101, true);
    drawRoundRect(ctx, cx - 32, 153, 64, 30, 8, accent, outline, 5);
    drawRoundRect(ctx, cx - 68, 146, 28, 70, 14, '#b8c2d1', outline, 6);
    drawRoundRect(ctx, cx + 40, 146, 28, 70, 14, '#b8c2d1', outline, 6);
    ctx.beginPath(); ctx.moveTo(cx + 28, 62); ctx.lineTo(cx + 38, 30); ctx.lineWidth = 6; ctx.strokeStyle = outline; ctx.stroke();
    drawEllipse(ctx, cx + 41, 26, 10, 10, '#6ee7ff', outline, 4);
  } else if (body === 'ninja') {
    drawRoundRect(ctx, cx - 50, 130, 100, 96, 24, '#1f2937', outline, 8);
    drawEllipse(ctx, cx, 94, 55, 48, '#111827', outline, 8);
    drawRoundRect(ctx, cx - 45, 88, 90, 30, 12, '#f6d7aa', outline, 5);
    drawEye(ctx, cx - 18, 101); drawEye(ctx, cx + 18, 101);
    drawTriangle(ctx, [[cx + 42, 81], [cx + 91, 58], [cx + 58, 112]], accent, outline, 6);
    drawRoundRect(ctx, cx - 45, 158, 90, 22, 8, accent, null);
  } else if (body === 'wizard') {
    drawTriangle(ctx, [[cx - 62, 232], [cx + 62, 232], [cx + 34, 108], [cx - 34, 108]], '#5b3fb7', outline, 8);
    drawRoundRect(ctx, cx - 42, 132, 84, 44, 16, accent, outline, 6);
    drawEllipse(ctx, cx, 90, 49, 43, '#f6d7aa', outline, 8);
    drawEye(ctx, cx - 17, 96); drawEye(ctx, cx + 17, 96); drawSmile(ctx, cx, 104, 30);
    drawTriangle(ctx, [[cx - 54, 62], [cx + 54, 62], [cx + 8, 8]], '#5b3fb7', outline, 8);
    drawEllipse(ctx, cx, 188, 12, 12, '#ffe066', outline, 4);
  } else if (body === 'chicken') {
    drawEllipse(ctx, cx, 163, 58, 72, '#fff7e6', outline, 8);
    drawEllipse(ctx, cx, 91, 50, 46, '#fff7e6', outline, 8);
    drawTriangle(ctx, [[cx - 5, 102], [cx + 50, 113], [cx - 5, 127]], '#ffb648', outline, 6);
    drawEye(ctx, cx - 20, 91); drawEye(ctx, cx + 9, 94);
    drawEllipse(ctx, cx - 8, 46, 13, 20, '#e74c3c', outline, 4);
    drawEllipse(ctx, cx + 12, 43, 13, 20, '#e74c3c', outline, 4);
    drawRoundRect(ctx, cx - 43, 151, 86, 26, 10, accent, outline, 5);
    drawEllipse(ctx, cx - 62, 166, 25, 36, '#f4c968', outline, 6);
    drawEllipse(ctx, cx + 62, 166, 25, 36, '#f4c968', outline, 6);
  } else {
    drawRoundRect(ctx, cx - 46, 128, 92, 100, 26, accent, outline, 8);
    drawEllipse(ctx, cx, 89, 52, 48, '#f3c99f', outline, 8);
    drawEye(ctx, cx - 18, 92); drawEye(ctx, cx + 18, 92); drawSmile(ctx, cx, 105, 36);
    drawRoundRect(ctx, cx - 45, 158, 90, 20, 9, '#ffffff', null);
    drawTriangle(ctx, [[cx - 48, 160], [cx + 48, 160], [cx - 18, 194]], '#ffffff', outline, 5);
    drawRoundRect(ctx, cx - 70, 146, 28, 72, 14, shadeHex(accent, -15), outline, 6);
    drawRoundRect(ctx, cx + 42, 146, 28, 72, 14, shadeHex(accent, -15), outline, 6);
  }

  // Tiny toy gun, kept as cosmetic and not as hitbox.
  drawRoundRect(ctx, cx + 26, 168, 44, 20, 8, '#222222', outline, 5);
  drawRoundRect(ctx, cx + 58, 159, 48, 14, 7, '#2e3440', outline, 4);
  drawHatArt(ctx, hat, cx, 54);
  ctx.restore();
}
function makeStandeeTexture(body, color, hat, back) {
  const cvs = document.createElement('canvas');
  cvs.width = 260;
  cvs.height = 320;
  drawStandeeArt(cvs.getContext('2d'), body, color, hat, back, cvs.width, cvs.height);
  const texture = new THREE.CanvasTexture(cvs);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
let previewAngle = 0;
let previewAutoSpin = true;
let previewDrag = null;
let previewRenderer = null;
let previewScene = null;
let previewCamera = null;
let previewRoot = null;
let previewLoopStarted = false;
let previewFitDirty = true;
let previewLastFitState = '';
const PREVIEW_TARGET_FILL = 0.86;
const PREVIEW_MIN_SCALE = 1.25;
const PREVIEW_MAX_SCALE = 2.75;

function initModelPreview() {
  if (previewRenderer || !$('previewCanvas')) return;
  const canvasEl = $('previewCanvas');
  previewRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  previewScene = new THREE.Scene();
  previewCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  // Preview camera is intentionally closer than the gameplay camera so the hero is readable.
  previewCamera.position.set(0, 0.95, 3.55);
  previewScene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.6, 4.6, 3.4);
  previewScene.add(key);
  const fill = new THREE.DirectionalLight(0xccefff, 0.9);
  fill.position.set(-3, 2.4, -2);
  previewScene.add(fill);
  resizeModelPreview();
  if (!previewLoopStarted) {
    previewLoopStarted = true;
    requestAnimationFrame(renderModelPreview);
  }
}

function resizeModelPreview() {
  if (!previewRenderer || !$('previewCanvas')) return;
  const canvasEl = $('previewCanvas');
  const frameEl = $('avatarPreview') || canvasEl.parentElement || canvasEl;
  const rect = frameEl.getBoundingClientRect();
  const w = Math.max(120, Math.round(rect.width || canvasEl.clientWidth || 220));
  const h = Math.max(140, Math.round(rect.height || canvasEl.clientHeight || 240));
  previewRenderer.setSize(w, h, false);
  previewCamera.aspect = w / h;
  previewCamera.updateProjectionMatrix();
}


function fitModelPreviewToFrame(force = false) {
  if (!previewRoot || !previewCamera || !$('avatarPreview')) return;
  const frameEl = $('avatarPreview');
  const rect = frameEl.getBoundingClientRect();
  const modelReady = !!previewRoot.userData.modelWrapper || !!previewRoot.userData.placeholder;
  const state = [selfBody, Math.round(rect.width), Math.round(rect.height), modelReady ? 'ready' : 'loading'].join('|');
  if (!force && !previewFitDirty && state === previewLastFitState) return;

  const savedRotationY = previewRoot.rotation.y;
  previewRoot.rotation.y = 0;
  previewRoot.scale.setScalar(1);
  previewRoot.position.set(0, 0, 0);
  previewRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(previewRoot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  if (!isFinite(size.y) || size.y <= 0.01) {
    previewRoot.rotation.y = savedRotationY;
    return;
  }

  const cameraDistance = Math.max(0.1, Math.abs(previewCamera.position.z));
  const verticalWorld = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(previewCamera.fov * 0.5));
  const desiredHeight = verticalWorld * PREVIEW_TARGET_FILL;
  const fittedScale = THREE.MathUtils.clamp(desiredHeight / size.y, PREVIEW_MIN_SCALE, PREVIEW_MAX_SCALE);

  previewRoot.scale.setScalar(fittedScale);
  previewRoot.updateMatrixWorld(true);
  const fittedBox = new THREE.Box3().setFromObject(previewRoot);
  const fittedCenter = new THREE.Vector3();
  fittedBox.getCenter(fittedCenter);
  // Keep the character centered and slightly above the foot-ring/base inside the card.
  const targetCenterY = previewCamera.position.y - verticalWorld * 0.02;
  previewRoot.position.x -= fittedCenter.x;
  previewRoot.position.y += targetCenterY - fittedCenter.y;
  previewRoot.position.z -= fittedCenter.z;
  previewRoot.rotation.y = savedRotationY;
  previewRoot.updateMatrixWorld(true);

  previewFitDirty = false;
  previewLastFitState = state;
}

function renderModelPreview() {
  requestAnimationFrame(renderModelPreview);
  if (!previewRenderer || !previewScene || !previewCamera) return;
  resizeModelPreview();
  fitModelPreviewToFrame(false);
  if (previewRoot) {
    if (previewAutoSpin) previewAngle = (previewAngle + 0.55) % 360;
    previewRoot.rotation.y = THREE.MathUtils.degToRad(previewAngle);
  }
  previewRenderer.render(previewScene, previewCamera);
}

function updatePreviewTransform() {
  const stage = $('previewStage');
  if (stage) {
    stage.classList.remove('spinning');
    stage.style.transform = '';
  }
  if (previewRoot) previewRoot.rotation.y = THREE.MathUtils.degToRad(previewAngle);
  previewAutoSpin = true;
}

function updateAvatarPreview() {
  initModelPreview();
  previewAngle = 0;
  previewAutoSpin = true;
  if (!previewScene) return;
  if (previewRoot) {
    previewScene.remove(previewRoot);
    previewRoot.traverse(obj => {
      if (obj.geometry && obj.userData.previewDisposable) obj.geometry.dispose?.();
      if (obj.material && obj.userData.previewDisposable) obj.material.dispose?.();
    });
  }
  previewRoot = makePlayerMesh(selfColor, true, selfHat, selfBack, selfBody);
  // Scale is fitted dynamically from the preview frame so it stays readable without overflowing.
  previewRoot.scale.setScalar(1);
  previewRoot.position.set(0, 0, 0);
  previewScene.add(previewRoot);
  previewFitDirty = true;
  previewLastFitState = '';
  fitModelPreviewToFrame(true);
  const base = $('previewBase');
  if (base) base.style.background = `linear-gradient(180deg, ${shadeHex(selfColor, 20)}, ${selfColor})`;
  updatePreviewTransform();
}


// Preview is intentionally auto-rotating only. No manual rotate/stop controls.
previewAutoSpin = true;
window.addEventListener('resize', () => requestAnimationFrame(resizeModelPreview));
updateAvatarPreview();

const homeScreen = $('homeScreen');
const lobbyScreen = $('lobbyScreen');
const hud = $('hud');
const gameOverPanel = $('gameOverPanel');
const canvas = $('gameCanvas');

// --- home screen tabs ---
$('tabCreate').addEventListener('click', () => setTab('create'));
$('tabJoin').addEventListener('click', () => setTab('join'));
function setTab(which) {
  $('tabCreate').classList.toggle('active', which === 'create');
  $('tabJoin').classList.toggle('active', which === 'join');
  $('createForm').classList.toggle('hidden', which !== 'create');
  $('joinForm').classList.toggle('hidden', which !== 'join');
  $('homeErr').textContent = '';
}

$('btnCreate').addEventListener('click', () => {
  const name = $('nameCreate').value.trim() || 'Player';
  const mode = document.querySelector('input[name="gameMode"]:checked')?.value || 'classic';
  socket.emit('createRoom', { name, mode });
});
$('btnJoin').addEventListener('click', () => {
  const code = $('roomCodeInput').value.trim().toUpperCase();
  const name = $('nameJoin').value.trim() || 'Player';
  if (!code) { $('homeErr').textContent = 'กรอกรหัสห้องก่อนนะ'; return; }
  socket.emit('joinRoom', { code, name });
});
$('btnStart').addEventListener('click', () => socket.emit('startGame'));
$('btnPlayAgain').addEventListener('click', () => socket.emit('playAgain'));
$('btnEndGame').addEventListener('click', () => {
  if (confirm('จบเกมตอนนี้แล้วพาทุกคนกลับไปที่ล็อบบี้?')) socket.emit('endToLobby');
});
$('btnAddBot').addEventListener('click', () => socket.emit('addBot'));

socket.on('errorMsg', ({ message }) => {
  $('homeErr').textContent = message;
  $('lobbyErr').textContent = message;
});

function renderRoomList(rooms = []) {
  const el = $('roomList');
  if (!el) return;
  el.innerHTML = '';
  if (!rooms.length) {
    const empty = document.createElement('div');
    empty.className = 'emptyRooms';
    empty.textContent = 'ยังไม่มีห้องที่เปิดอยู่';
    el.appendChild(empty);
    return;
  }
  rooms.forEach(room => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'roomCard';
    btn.disabled = !!room.locked || room.playerCount >= room.maxPlayers;
    const modeText = room.mode === 'skill' ? 'Skill' : 'Classic';
    const lockText = room.locked ? '🔒 ล็อก' : `${room.playerCount}/${room.maxPlayers}`;
    btn.innerHTML = `
      <span>
        <span class="roomCardCode">${escapeHtml(room.code)}</span>
        <span class="roomCardMeta">(${escapeHtml(room.hostName || 'Host')}) • ${modeText}</span>
      </span>
      <span class="roomCardBadge">${lockText}</span>`;
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      $('roomCodeInput').value = room.code;
      const name = $('nameJoin').value.trim() || $('nameCreate').value.trim() || 'Player';
      $('nameJoin').value = name;
      socket.emit('joinRoom', { code: room.code, name });
    });
    el.appendChild(btn);
  });
}

socket.on('roomListUpdate', ({ rooms }) => renderRoomList(rooms || []));

socket.on('joined', data => {
  selfId = data.selfId;
  roomCode = data.code;
});

socket.on('roomUpdate', data => {
  roomCode = data.code;
  isHost = data.hostId === selfId;
  currentMode = data.mode || 'classic';
  if (data.state === 'lobby') {
    revealActive = false;
    spectating = false;
    $('btnEndGame').classList.add('hidden');
    $('passiveOverlay').classList.add('hidden');
    $('skillPanel').classList.add('hidden');
    $('eventLog').classList.add('hidden');
    showScreen('lobby');
    $('lobbyCode').textContent = data.code;
    const modeBox = $('lobbyModeBox');
    if (modeBox) {
      const modeLabel = currentMode === 'skill' ? 'Skill mode — Dodge + Active Skill' : 'Classic mode — ยิงกันธรรมดา';
      modeBox.innerHTML = `<div>โหมดปัจจุบัน: <b>${modeLabel}</b></div>` + (isHost ? `
        <div class="lobbyModeOptions">
          <button class="${currentMode === 'classic' ? 'active' : ''}" data-mode="classic">Classic</button>
          <button class="${currentMode === 'skill' ? 'active' : ''}" data-mode="skill">Skill</button>
        </div>` : '');
      if (isHost) {
        modeBox.querySelectorAll('button[data-mode]').forEach(btn => {
          btn.addEventListener('click', () => socket.emit('setMode', { mode: btn.dataset.mode }));
        });
      }
    }
    const lockRow = $('lobbyLockRow');
    if (lockRow) {
      lockRow.classList.toggle('hidden', !isHost);
      lockRow.innerHTML = '';
      if (isHost) {
        const lockBtn = document.createElement('button');
        lockBtn.type = 'button';
        lockBtn.className = `lockRoomBtn ${data.locked ? 'locked' : ''}`;
        lockBtn.textContent = data.locked ? '🔒 ห้องล็อกอยู่' : '🔓 เปิดให้เข้าร่วม';
        lockBtn.title = 'ล็อก/ปลดล็อกห้องไม่ให้ผู้เล่นใหม่เข้าร่วม';
        lockBtn.addEventListener('click', () => socket.emit('toggleRoomLock'));
        lockRow.appendChild(lockBtn);
      }
    }

    const list = $('lobbyPlayers');
    list.innerHTML = '';
    data.players.forEach(p => {
      if (p.id === selfId) {
        selfHat = p.hat || 'none'; updateHatPickerUI();
        selfBack = p.back || 'none'; updateBackPickerUI();
        selfBody = p.body || 'islander'; updateBodyPickerUI();
        selfColor = p.color || selfColor; updateColorPickerUI();
        selfAlive = true;
        myPassiveSkill = p.passiveSkill || null;
        myActiveSkill = p.activeSkill || null;
      }
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'lobbyNameOnly';
      label.innerHTML = `<span class="dot" style="background:${p.color}"></span>
        <span class="playerNameText">${p.isBot ? '🤖 ' : ''}${escapeHtml(p.name)}${p.id === data.hostId ? ' 👑' : ''}${p.id === selfId ? ' (คุณ)' : ''}</span>`;
      li.appendChild(label);
      if (p.isBot && isHost) {
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.className = 'removeBotBtn';
        removeBtn.addEventListener('click', () => socket.emit('removeBot', { id: p.id }));
        li.appendChild(removeBtn);
      }
      list.appendChild(li);
    });
    $('btnStart').classList.toggle('hidden', !isHost);
    $('btnStart').disabled = data.players.length < 2;
    $('btnAddBot').classList.toggle('hidden', !isHost || data.players.length >= 10);
  }
});

socket.on('gameOver', data => {
  const { winnerId, winnerName } = data;
  showScreen('gameover');
  if (winnerId) {
    $('gameOverTitle').textContent = winnerId === selfId ? '🏆 คุณชนะ!' : `🏆 ${winnerName} ชนะ!`;
    $('gameOverSubtitle').textContent = 'ผู้เหลือรอดยืนบนเวทีแห่งชัยชนะ';
  } else {
    $('gameOverTitle').textContent = '💥 เสมอ ไม่มีผู้รอด';
    $('gameOverSubtitle').textContent = 'ทุกคนยิงโดนกันหมด';
  }
  renderGameOverSummary(data);
  $('btnPlayAgain').classList.toggle('hidden', !isHost);
});


// ---------- Skill UI ----------
function skillInfo(type, id) {
  return type === 'passive' ? passiveById(id) : activeById(id);
}

function renderSkillPanel(players = []) {
  const el = $('skillPanel');
  if (!el) return;
  if (currentMode !== 'skill' || !players.length) { el.classList.add('hidden'); return; }
  let html = '<div class="skillPanelTitle">🧩 Skill Table</div>';
  players.forEach(p => {
    const passive = passiveById(p.passiveSkill);
    const active = activeById(p.activeSkill);
    html += `<div class="skillRow" data-id="${p.id}">
      <span class="orderDot" style="background:${p.color}"></span>
      <span class="skillName">${escapeHtml(p.name)}${p.id === selfId ? ' (คุณ)' : ''}${p.moveLocked ? ' <span class="skillLocked">ล็อกเดิน</span>' : ''}</span>
      <span class="skillIcon ${passive ? '' : 'empty'}" title="${passive ? passive.name + ' — ' + passive.desc : 'ไม่มี Passive'}">${passive ? passive.emoji : '–'}</span>
      <span class="skillIcon ${active ? '' : 'empty'}" title="${active ? active.name + ' — ' + active.desc : 'ไม่มี Active'}">${active ? active.emoji : '–'}</span>
    </div>`;
  });
  el.innerHTML = html;
  el.classList.remove('hidden');
}

function renderEventLog(events = []) {
  const el = $('eventLog');
  if (!el) return;
  if (!events.length) { el.classList.add('hidden'); return; }
  el.innerHTML = '<div class="eventLogTitle">📜 Event Log</div>' + events.map(e =>
    `<div class="eventLogRow">${escapeHtml(e.text || '')}</div>`
  ).join('');
  el.classList.remove('hidden');
}

function renderStatusNotice() {
  const el = $('statusNotice');
  if (!el) return;
  if (currentMode === 'skill' && myMoveLocked && !spectating) {
    el.textContent = '⚡ คุณไม่สามารถเดินได้ในรอบนี้ เนื่องจากโดน Taser';
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

socket.on('eventLogUpdate', ({ events }) => renderEventLog(events || []));

socket.on('skillState', data => {
  currentMode = data.mode || currentMode;
  renderSkillPanel(data.players || []);
  const me = (data.players || []).find(p => p.id === selfId);
  if (me) {
    myPassiveSkill = me.passiveSkill || myPassiveSkill;
    myActiveSkill = me.activeSkill || null;
    myMoveLocked = !!me.moveLocked;
    renderStatusNotice();
    if (placing && !spectating) buildActivePanel();
  }
});

let passiveSelectEndsAt = 0;
let passiveTimerHandle = null;
let passiveChosen = null;

function showPassiveOverlay(skills) {
  passiveChosen = null;
  const overlay = $('passiveOverlay');
  const cards = $('passiveCards');
  cards.innerHTML = '';
  skills.forEach(id => {
    const sk = passiveById(id);
    if (!sk) return;
    const card = document.createElement('div');
    card.className = 'passiveCard';
    card.innerHTML = `<div class="emoji">${sk.emoji}</div><div class="name">${sk.name}</div><div class="desc">${sk.desc}</div>`;
    card.addEventListener('click', () => {
      if (passiveChosen) return;
      passiveChosen = id;
      card.classList.add('selected');
      $('passiveStatus').textContent = `เลือก ${sk.name} แล้ว รอผู้เล่นคนอื่น...`;
      socket.emit('setPassiveSkill', { skillId: id });
      [...cards.children].forEach(c => { if (c !== card) c.style.opacity = '0.45'; });
    });
    cards.appendChild(card);
  });
  $('passiveStatus').textContent = '';
  overlay.classList.remove('hidden');
}

function updatePassiveTimer() {
  const remain = Math.max(0, passiveSelectEndsAt - Date.now());
  $('passiveTimer').textContent = Math.ceil(remain / 1000);
  if (remain <= 0) clearInterval(passiveTimerHandle);
}

socket.on('passiveSelectStart', data => {
  currentMode = 'skill';
  showScreen('game');
  $('hud').classList.add('hidden');
  $('gameCanvas').classList.add('hidden');
  showPassiveOverlay(data.skills || PASSIVE_SKILLS.map(s => s.id));
  passiveSelectEndsAt = data.endsAt || (Date.now() + 15000);
  clearInterval(passiveTimerHandle);
  updatePassiveTimer();
  passiveTimerHandle = setInterval(updatePassiveTimer, 250);
});

socket.on('passiveConfirmed', ({ skillId }) => {
  const sk = passiveById(skillId);
  if (sk) $('passiveStatus').textContent = `เลือก ${sk.name} แล้ว รอผู้เล่นคนอื่น...`;
});

socket.on('passiveReveal', data => {
  clearInterval(passiveTimerHandle);
  $('passiveOverlay').classList.add('hidden');
  renderSkillPanel(data.players || []);
});

socket.on('yourSkillState', data => {
  myPassiveSkill = data.passiveSkill || null;
  myActiveSkill = data.activeSkill || null;
  myActiveUsed = null;
  foresightVisionActive = false;
  myMoveLocked = !!data.moveLocked;
  renderStatusNotice();
  if (placing && !spectating) buildActivePanel();
});

socket.on('activeUsedConfirmed', ({ skillId }) => {
  myActiveUsed = skillId;
  myActiveSkill = null;
  if (skillId === 'foresight' && placing && !selfReady) {
    $('instructions').textContent = '👁️ Foresight: กำลังเปิดมุมมอง spectator • เดิน/หมุนเพื่อหลบได้ • รอบนี้จะไม่ยิง';
  }
  buildActivePanel();
});

socket.on('activeSkillUsed', data => {
  const skill = activeById(data.skillId);
  const skillName = data.skillName || (skill ? skill.name : 'Active Skill');
  showCenterAnnouncement(`${skill ? skill.emoji + ' ' : ''}${data.playerName || 'ผู้เล่น'} ใช้ ${skillName}!`, 'skill', 2600);
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showScreen(name) {
  homeScreen.classList.toggle('hidden', name !== 'home');
  lobbyScreen.classList.toggle('hidden', name !== 'lobby');
  hud.classList.toggle('hidden', name !== 'game');
  gameOverPanel.classList.toggle('hidden', name !== 'gameover');
  canvas.classList.toggle('hidden', name !== 'game');
}

// ---------- Three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 25, 60);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x1a2340, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(10, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
scene.add(sun);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Island ----------
let islandGroup = new THREE.Group();
scene.add(islandGroup);

function buildIsland(size) {
  scene.remove(islandGroup);
  islandGroup = new THREE.Group();
  const n = Math.round(size);
  const topGeo = new THREE.BoxGeometry(1, 1, 1);
  const grassMatA = new THREE.MeshStandardMaterial({ color: 0x5cbf5c, roughness: 0.9 });
  const grassMatB = new THREE.MeshStandardMaterial({ color: 0x4fae4f, roughness: 0.9 });
  const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8a6035, roughness: 1 });

  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      const x = ix - (n - 1) / 2;
      const z = iz - (n - 1) / 2;
      const mat = ((ix + iz) % 2 === 0) ? grassMatA : grassMatB;
      const block = new THREE.Mesh(topGeo, mat);
      block.position.set(x, -0.5, z);
      block.receiveShadow = true;
      block.castShadow = false;
      islandGroup.add(block);
      // underside skirt for a floating-island look at the border
      const isEdge = ix === 0 || iz === 0 || ix === n - 1 || iz === n - 1;
      if (isEdge) {
        for (let d = 1; d <= 2; d++) {
          const skirt = new THREE.Mesh(topGeo, dirtMat);
          skirt.position.set(x, -0.5 - d, z);
          islandGroup.add(skirt);
        }
      }
    }
  }
  scene.add(islandGroup);
  return n;
}

const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// ---------- Player visuals ----------
function addHatDecoration(group, hat) {
  const topY = 0.85 + 0.42; // top of the head cube
  switch (hat) {
    case 'party': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 16), new THREE.MeshStandardMaterial({ color: 0xff5fa2 }));
      cone.position.y = topY + 0.19;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe066 }));
      pom.position.y = topY + 0.42;
      group.add(cone, pom);
      break;
    }
    case 'tophat': {
      const black = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 16), black);
      brim.position.y = topY + 0.02;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.32, 16), black);
      top.position.y = topY + 0.2;
      group.add(brim, top);
      break;
    }
    case 'halo': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0xfff2a8, emissive: 0xffe066, emissiveIntensity: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = topY + 0.22;
      group.add(ring);
      break;
    }
    case 'horns': {
      const mat = new THREE.MeshStandardMaterial({ color: 0xcc2b2b });
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 8), mat);
      l.position.set(-0.14, topY + 0.06, 0);
      l.rotation.z = 0.5;
      const r = l.clone();
      r.position.x = 0.14;
      r.rotation.z = -0.5;
      group.add(l, r);
      break;
    }
    case 'bunny': {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 8), mat);
      l.position.set(-0.12, topY + 0.16, 0);
      l.rotation.z = 0.25;
      const r = l.clone();
      r.position.x = 0.12;
      r.rotation.z = -0.25;
      group.add(l, r);
      break;
    }
    case 'crown': {
      const gold = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.4, roughness: 0.3 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 8), gold);
      band.position.y = topY + 0.08;
      group.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), gold);
        spike.position.set(Math.sin(a) * 0.2, topY + 0.22, Math.cos(a) * 0.2);
        group.add(spike);
      }
      break;
    }
    case 'propeller': {
      const capMat = new THREE.MeshStandardMaterial({ color: 0xff9f43 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.position.y = topY;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x888888 }));
      stem.position.y = topY + 0.24;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.06), new THREE.MeshStandardMaterial({ color: 0xff5fa2 }));
      blade.position.y = topY + 0.3;
      group.add(cap, stem, blade);
      break;
    }
    case 'chef': {
      const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), white);
      band.position.y = topY + 0.06;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), white);
      puff.position.y = topY + 0.28;
      puff.scale.y = 1.2;
      group.add(band, puff);
      break;
    }
    default:
      break;
  }
}

function addBackDecoration(group, back) {
  const midY = 0.55; // roughly shoulder height on the body
  const backZ = -0.22; // just behind the body
  switch (back) {
    case 'devilwing': {
      const mat = new THREE.MeshStandardMaterial({ color: 0x8b1a1a, roughness: 0.6, side: THREE.DoubleSide });
      const makeWing = sign => {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4, 1, true), mat);
        wing.scale.set(1, 0.5, 0.35);
        wing.rotation.z = sign * Math.PI / 2.1;
        wing.rotation.y = sign * 0.5;
        wing.position.set(sign * 0.32, midY, backZ);
        return wing;
      };
      group.add(makeWing(-1), makeWing(1));
      break;
    }
    case 'chickenwing': {
      const mat = new THREE.MeshStandardMaterial({ color: 0xf4c968, roughness: 0.8 });
      const makeWing = sign => {
        const wing = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat);
        wing.scale.set(0.55, 1, 0.4);
        wing.rotation.z = sign * 0.5;
        wing.position.set(sign * 0.28, midY - 0.05, backZ + 0.02);
        return wing;
      };
      group.add(makeWing(-1), makeWing(1));
      break;
    }
    case 'angelwing': {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
      const makeWing = sign => {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.55, 4, 1, true), mat);
        wing.scale.set(1, 0.55, 0.3);
        wing.rotation.z = sign * Math.PI / 2.1;
        wing.rotation.y = sign * 0.4;
        wing.position.set(sign * 0.33, midY + 0.05, backZ);
        return wing;
      };
      group.add(makeWing(-1), makeWing(1));
      break;
    }
    case 'jetpack': {
      const bodyMat2 = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.3, roughness: 0.5 });
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.16), bodyMat2);
      pack.position.set(0, midY, backZ - 0.02);
      const flameMat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff5500, emissiveIntensity: 0.8 });
      const makeThruster = sign => {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), bodyMat2);
        t.position.set(sign * 0.1, midY - 0.28, backZ - 0.02);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), flameMat);
        flame.position.set(sign * 0.1, midY - 0.42, backZ - 0.02);
        flame.rotation.x = Math.PI;
        group.add(t, flame);
      };
      group.add(pack);
      makeThruster(-1);
      makeThruster(1);
      break;
    }
    case 'cape': {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd7263d, roughness: 0.7, side: THREE.DoubleSide });
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.03), mat);
      cape.position.set(0, midY - 0.1, backZ);
      cape.rotation.x = 0.15;
      group.add(cape);
      break;
    }
    case 'balloon': {
      const colors = [0xff5fa2, 0xffe066, 0x6ec4ff];
      colors.forEach((c, i) => {
        const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshStandardMaterial({ color: c }));
        const ox = (i - 1) * 0.14;
        balloon.position.set(ox, midY + 0.55, backZ);
        const stringMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), stringMat);
        string.position.set(ox * 0.3, midY + 0.3, backZ);
        string.rotation.z = ox * -0.6;
        group.add(balloon, string);
      });
      break;
    }
    default:
      break;
  }
}


function addSkinDetails(group, body, mainColor) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 });
  if (body === 'robot') {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.035), new THREE.MeshStandardMaterial({ color: 0x26384f, emissive: 0x0b223d, emissiveIntensity: 0.35 }));
    panel.position.set(0, 0.63, 0.235);
    group.add(panel);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 8), dark);
    antenna.position.set(0.13, 1.42, -0.02);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), new THREE.MeshStandardMaterial({ color: 0x6ec4ff, emissive: 0x3fa0f0, emissiveIntensity: 0.7 }));
    tip.position.set(0.13, 1.58, -0.02);
    group.add(antenna, tip);
  } else if (body === 'ninja') {
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.16, 0.035), dark);
    mask.position.set(0, 1.12, 0.245);
    group.add(mask);
  } else if (body === 'wizard') {
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.78, 18), new THREE.MeshStandardMaterial({ color: 0x5b3fb7, roughness: 0.75 }));
    robe.position.y = 0.38;
    group.add(robe);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffcc33, emissiveIntensity: 0.5 }));
    star.position.set(0, 0.76, 0.34);
    group.add(star);
  } else if (body === 'chicken') {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 12), new THREE.MeshStandardMaterial({ color: 0xffb648 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 1.03, 0.34);
    const comb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe74c3c }));
    comb.scale.set(0.8, 1.5, 0.55);
    comb.position.set(0, 1.34, 0.02);
    group.add(beak, comb);
  } else {
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.035), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
    sash.position.set(0, 0.64, 0.235);
    sash.rotation.z = -0.35;
    group.add(sash);
  }
}

function addChibiFace(group, body) {
  const eyeMat = new THREE.MeshBasicMaterial({ color: body === 'robot' ? 0x6ec4ff : 0x111827 });
  const eyeGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.09, 1.1, 0.255);
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.09;
  group.add(leftEye, rightEye);
}



function loadBodyModel(body) {
  const source = MODEL_SKIN_SOURCES[body];
  if (!source) return null;
  if (!modelPromiseCache.has(body)) {
    modelPromiseCache.set(body, new Promise((resolve, reject) => {
      if (source.type === 'obj') {
        objLoader.load(source.path, obj => {
          const diffuse = source.diffuse ? textureLoader.load(source.diffuse) : null;
          const normal = source.normal ? textureLoader.load(source.normal) : null;
          const roughness = source.roughness ? textureLoader.load(source.roughness) : null;
          const metalness = source.metalness ? textureLoader.load(source.metalness) : null;
          obj.traverse(child => {
            if (!child.isMesh) return;
            child.material = new THREE.MeshStandardMaterial({
              map: diffuse,
              normalMap: normal,
              roughnessMap: roughness,
              metalnessMap: metalness,
              roughness: 0.82,
              metalness: 0.05
            });
          });
          resolve(obj);
        }, undefined, err => {
          console.warn('Failed to load OBJ character model', body, err);
          reject(err);
        });
        return;
      }
      modelLoader.load(source.path, gltf => resolve(gltf.scene), undefined, err => {
        console.warn('Failed to load GLB character model', body, err);
        reject(err);
      });
    }));
  }
  return modelPromiseCache.get(body);
}

function cloneAndFitModel(source, targetHeight = CHARACTER_TARGET_HEIGHT) {
  const model = source.clone(true);
  model.rotation.y = CHARACTER_FRONT_ROTATION_Y;
  model.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        obj.material = Array.isArray(obj.material)
          ? obj.material.map(m => m.clone())
          : obj.material.clone();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if ('roughness' in m) m.roughness = Math.min(1, m.roughness ?? 0.75);
          if ('metalness' in m) m.metalness = Math.min(0.25, m.metalness ?? 0.05);
        });
      }
    }
  });
  const wrapper = new THREE.Group();
  wrapper.add(model);
  wrapper.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(wrapper);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = targetHeight / Math.max(0.01, size.y);
  model.scale.setScalar(scale);
  wrapper.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(wrapper);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  // Put the lowest point just above the colored foot ring so legs do not sink into the ground.
  model.position.y += CHARACTER_FOOT_Y - box.min.y;
  return wrapper;
}

// Preload the uploaded models so they appear quickly when the lobby/game opens.
Object.keys(MODEL_SKIN_SOURCES).forEach(id => loadBodyModel(id));

function makePlayerMesh(color, isSelf, hat, back, body = 'islander') {
  const group = new THREE.Group();
  const baseColor = new THREE.Color(color);

  // AI 3D model on a colored player ring. Visual-only; gameplay hitbox stays fixed.
  const baseMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.6, metalness: 0.05 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.11, 36), baseMat);
  base.position.y = 0.055;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(0.43, 0.035, 8, 36),
    new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.85 })
  );
  edge.position.y = 0.12;
  edge.rotation.x = Math.PI / 2;
  group.add(edge);

  const placeholder = new THREE.Group();
  const texture = makeStandeeTexture(body, color, hat, back);
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true });
  const standee = new THREE.Sprite(mat);
  standee.position.set(0, 0.9, 0.03);
  standee.scale.set(0.92, 1.14, 1);
  placeholder.add(standee);
  group.userData.standee = standee;

  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.34, 10),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.2, roughness: 0.45 })
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0.22, 0.66, 0.42);
  placeholder.add(muzzle);
  group.add(placeholder);
  group.userData.placeholder = placeholder;
  group.userData.body = body;

  const modelPromise = loadBodyModel(body);
  if (modelPromise) {
    modelPromise.then(source => {
      if (group.userData.body !== body) return;
      const modelWrapper = cloneAndFitModel(source, CHARACTER_TARGET_HEIGHT);
      modelWrapper.userData.modelSkin = body;
      group.add(modelWrapper);
      group.userData.modelWrapper = modelWrapper;
      if (group === previewRoot) { previewFitDirty = true; previewLastFitState = ''; }
      if (group.userData.placeholder) {
        group.remove(group.userData.placeholder);
        group.userData.placeholder = null;
      }
    }).catch(() => {
      // Keep the generated standee placeholder if the GLB fails to load.
    });
  }

  // A clear front pointer shows aiming direction and also helps if a model import orientation is imperfect.
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.22, 3),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
  );
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.15, 0.52);
  group.add(arrow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(isSelf ? 0.55 : 0.50, isSelf ? 0.67 : 0.62, 40),
    new THREE.MeshBasicMaterial({ color: baseColor, side: THREE.DoubleSide, transparent: true, opacity: isSelf ? 0.82 : 0.66 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.022;
  group.add(ring);
  group.userData.ring = ring;
  return group;
}

function makeNameSprite(text, color) {
  const cvs = document.createElement('canvas');
  cvs.width = 512; cvs.height = 128;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px Mitr, Segoe UI, sans-serif';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.96)';
  ctx.lineWidth = 9;
  ctx.strokeText(text, cvs.width / 2, 62);
  ctx.strokeStyle = 'rgba(10,16,32,0.38)';
  ctx.lineWidth = 3;
  ctx.strokeText(text, cvs.width / 2, 62);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, cvs.width / 2, 62);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.52, 1);
  return sprite;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Game over winner stage ----------
let endRenderer = null;
let endScene = null;
let endCamera = null;
let endRoot = null;
let endLoopStarted = false;

function initWinnerStage() {
  const canvasEl = $('winnerStageCanvas');
  if (!canvasEl || endRenderer) return;
  endRenderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
  endRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  endScene = new THREE.Scene();
  endCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  endCamera.position.set(0, 1.25, 4.2);
  endCamera.lookAt(0, 0.72, 0);
  endScene.add(new THREE.AmbientLight(0xffffff, 1.45));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2.5, 4.2, 3.6);
  endScene.add(key);
  const rim = new THREE.DirectionalLight(0xffe6a8, 1.0);
  rim.position.set(-3, 2.2, -2.5);
  endScene.add(rim);
  resizeWinnerStage();
  if (!endLoopStarted) {
    endLoopStarted = true;
    requestAnimationFrame(renderWinnerStage);
  }
}

function resizeWinnerStage() {
  if (!endRenderer || !$('winnerStageCanvas')) return;
  const canvasEl = $('winnerStageCanvas');
  const w = canvasEl.clientWidth || 360;
  const h = canvasEl.clientHeight || 260;
  endRenderer.setSize(w, h, false);
  endCamera.aspect = w / h;
  endCamera.updateProjectionMatrix();
}

function renderWinnerStage() {
  requestAnimationFrame(renderWinnerStage);
  if (!endRenderer || !endScene || !endCamera) return;
  resizeWinnerStage();
  if (endRoot) endRoot.rotation.y += 0.012;
  endRenderer.render(endScene, endCamera);
}

function renderGameOverSummary(data = {}) {
  const players = (data.players || []).slice().sort((a, b) => (b.kills || 0) - (a.kills || 0) || String(a.name).localeCompare(String(b.name)));
  const summary = $('killSummary');
  if (summary) {
    const rows = players.map((p, i) => `
      <tr class="${p.id === data.winnerId ? 'killWinner' : ''}">
        <td>${i + 1}</td>
        <td>${escapeHtml(p.name)}${p.id === data.winnerId ? ' 🏆' : ''}</td>
        <td>${p.alive ? 'รอด' : 'ตกรอบ'}</td>
        <td>${p.kills || 0}</td>
      </tr>`).join('');
    summary.innerHTML = `
      <div class="killSummaryTitle">สรุปจำนวน Kill</div>
      <table class="killTable">
        <thead><tr><th>#</th><th>ผู้เล่น</th><th>สถานะ</th><th>Kill</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">ไม่มีข้อมูล</td></tr>'}</tbody>
      </table>`;
  }

  initWinnerStage();
  if (!endScene) return;
  if (endRoot) {
    endScene.remove(endRoot);
    endRoot = null;
  }
  endRoot = new THREE.Group();
  const podium = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.08, 0.24, 48),
    new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.55, metalness: 0.08 })
  );
  podium.position.y = -0.12;
  endRoot.add(podium);
  const stageRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.035, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 })
  );
  stageRing.position.y = 0.02;
  stageRing.rotation.x = Math.PI / 2;
  endRoot.add(stageRing);
  if (data.winner) {
    const hero = makePlayerMesh(data.winner.color || '#ff9f43', false, data.winner.hat || 'none', data.winner.back || 'none', data.winner.body || 'islander');
    hero.position.set(0, 0, 0);
    hero.scale.setScalar(1.55);
    endRoot.add(hero);
  }
  endScene.add(endRoot);
}


let aimSkillFx = null;
function clearAimSkillFx() {
  if (aimSkillFx) {
    scene.remove(aimSkillFx);
    if (aimSkillFx.geometry) aimSkillFx.geometry.dispose();
    if (aimSkillFx.material) aimSkillFx.material.dispose();
    aimSkillFx = null;
  }
}
function makeShotgunConeMesh(color) {
  const spread = 0.34;
  const range = 3;
  const segments = 28;
  const verts = [0, 0, 0];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = -spread + (spread * 2 * i / segments);
    verts.push(Math.sin(a) * range, 0, Math.cos(a) * range);
    if (i > 0) indices.push(0, i, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  return mesh;
}
function makeSniperLineMesh(color) {
  const geo = new THREE.CylinderGeometry(0.028, 0.028, 1, 10);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 0.5);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.82 });
  return new THREE.Mesh(geo, mat);
}
function updateSkillAimPreview() {
  if (!placing || !selfMesh || selfReady || myActiveUsed === 'foresight') { clearAimSkillFx(); return; }
  const skill = myActiveUsed || null;
  if (skill !== 'shotgun' && skill !== 'sniper') { clearAimSkillFx(); return; }
  if (!aimSkillFx || aimSkillFx.userData.skill !== skill) {
    clearAimSkillFx();
    aimSkillFx = skill === 'shotgun' ? makeShotgunConeMesh(selfColor) : makeSniperLineMesh(selfColor);
    aimSkillFx.userData.skill = skill;
    scene.add(aimSkillFx);
  }
  aimSkillFx.position.set(selfPos.x, skill === 'sniper' ? 0.09 : 0.034, selfPos.z);
  aimSkillFx.rotation.y = selfAngle;
  if (skill === 'sniper') {
    aimSkillFx.scale.z = bounds * 2;
  } else {
    aimSkillFx.scale.set(1, 1, 1);
  }
}

function makeLaser(color) {
  const geo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, 0.5); // pivot at base, extend along +z locally
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  return new THREE.Mesh(geo, mat);
}

// ---------- Muzzle flash / bullet / blood FX ----------
let flareTextureCache = null;
function getFlareTexture() {
  if (flareTextureCache) return flareTextureCache;
  const cvs = document.createElement('canvas');
  cvs.width = 64; cvs.height = 64;
  const ctx = cvs.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,220,120,0.9)');
  grad.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  flareTextureCache = new THREE.CanvasTexture(cvs);
  return flareTextureCache;
}

let bloodTextureCache = null;
function getBloodTexture() {
  if (bloodTextureCache) return bloodTextureCache;
  const cvs = document.createElement('canvas');
  cvs.width = 128; cvs.height = 128;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(150,10,10,0.88)';
  for (let i = 0; i < 10; i++) {
    const cx = 64 + (Math.random() - 0.5) * 70;
    const cy = 64 + (Math.random() - 0.5) * 70;
    const r = 8 + Math.random() * 20;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(90,0,0,0.9)';
  ctx.beginPath(); ctx.arc(64, 64, 16, 0, Math.PI * 2); ctx.fill();
  bloodTextureCache = new THREE.CanvasTexture(cvs);
  return bloodTextureCache;
}

let fxSprites = [], fxBeams = [], fxParticles = [], revealDecals = [], fxBullets = [], fxLabels = [], fxBubbles = [];

// short labels that float above players when a skill fires
const SKILL_LABEL = {
  bounce: '🎾 BOUNCE!',
  dodge: '💨 DODGE!',
  secondchance: '🔁 SECOND CHANCE!',
  shotgun: '🔫 SHOTGUN!',
  sniper: '🎯 SNIPER!',
  taser: '⚡ TASER!',
  foresight: '👁️ FORESIGHT!',
  shield: '🛡️ SHIELD!'
};
let zoomFocus = null;
let playerInfo = new Map();
let revealedPowers = new Map(); // kept only for backward compatibility with old UI; hidden in V2

function revealPower() {}
function renderPowerLog() { const el = $('powerLog'); if (el) el.classList.add('hidden'); }
function buildCardLog() { const el = $('cardLog'); if (el) el.classList.add('hidden'); }

function floatLabel(x, z, y, text, color) {
  const cvs = document.createElement('canvas');
  cvs.width = 512; cvs.height = 96;
  const ctx = cvs.getContext('2d');
  ctx.font = "bold 54px 'Baloo 2', sans-serif";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.strokeText(text, 256, 48);
  ctx.fillStyle = color || '#ffffff';
  ctx.fillText(text, 256, 48);
  const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cvs), transparent: true, depthWrite: false, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(4.2, 0.8, 1);
  sp.position.set(x, y, z);
  scene.add(sp);
  fxLabels.push({ sp, life: 0, duration: 2.9, baseY: y });
}

function spawnMuzzleFlash(entry) {
  const dx = Math.sin(entry.angle), dz = Math.cos(entry.angle);
  const mat = new THREE.SpriteMaterial({
    map: getFlareTexture(), transparent: true, opacity: 1,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(entry.x + dx * 0.6, 0.55, entry.z + dz * 0.6);
  sprite.scale.set(0.8, 0.8, 0.8);
  scene.add(sprite);
  fxSprites.push({ sprite, life: 0, duration: 0.18 });
}

const THUNDER_RADIUS_C = 1.6; // mirrors server THUNDER_RADIUS

// an additive glow flash (muzzle / lightning / spark), fades and grows
function spawnFlash(x, y, z, baseScale, color, duration) {
  const mat = new THREE.SpriteMaterial({
    map: getFlareTexture(), color: color || 0xffffff, transparent: true, opacity: 1,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z);
  sprite.scale.setScalar(baseScale);
  scene.add(sprite);
  fxSprites.push({ sprite, life: 0, duration: duration || 0.4, baseScale });
}

// a round bullet that travels along a poly-line path (multiple segments = a bounce),
// killing any victim tagged on a segment endpoint as it passes.
function spawnSegmentBullet(color, segments, radius) {
  if (!segments || !segments.length) return;
  const pts = [new THREE.Vector3(segments[0].x1, 0.55, segments[0].z1)];
  const hitAt = [null];
  segments.forEach(sg => { pts.push(new THREE.Vector3(sg.x2, 0.55, sg.z2)); hitAt.push(sg.hitId || null); });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const geo = new THREE.SphereGeometry(radius, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.98 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pts[0]);
  scene.add(mesh);
  const glowMat = new THREE.SpriteMaterial({
    map: getFlareTexture(), color, transparent: true, opacity: 0.7,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(radius * 4);
  glow.position.copy(pts[0]);
  scene.add(glow);
  const trailGeo = new THREE.BufferGeometry().setFromPoints([pts[0], pts[0]]);
  const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
  const trail = new THREE.Line(trailGeo, trailMat);
  scene.add(trail);
  fxBullets.push({ mesh, glow, trail, trailPoints: [pts[0].clone()], pts, cum, hitAt, total: cum[cum.length - 1], dist: 0, nextIdx: 1 });
}

// The Thunder VFX: bright bolt glow at the caster plus sparks across the kill radius
function spawnLightning(entry) {
  spawnFlash(entry.x, 1.5, entry.z, 2.4, 0xaad4ff, 0.55);
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * THUNDER_RADIUS_C;
    spawnFlash(entry.x + Math.cos(a) * r, 0.4, entry.z + Math.sin(a) * r, 0.6, 0xdff0ff, 0.4);
  }
}


function spawnShieldBubble(entry, color = 0x9fd3ff, duration = 0.9) {
  const geo = new THREE.SphereGeometry(0.72 * (entry.size || 1), 24, 16);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, wireframe: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(entry.x, 0.78 * (entry.size || 1), entry.z);
  scene.add(mesh);
  fxBubbles.push({ mesh, life: 0, duration, base: 1 });
}

function spawnDodgeAfterimage(entry, color = 0x9fe0ff) {
  for (let i = 0; i < 3; i++) {
    const ghost = entry.mesh.clone(true);
    ghost.position.set(entry.x + (i - 1) * 0.18, 0, entry.z - i * 0.12);
    ghost.rotation.copy(entry.mesh.rotation);
    ghost.traverse(obj => {
      if (obj.isMesh) obj.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false });
      if (obj.isSprite) obj.material = new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, depthTest: true });
    });
    scene.add(ghost);
    fxBubbles.push({ mesh: ghost, life: 0, duration: 0.75 + i * 0.12, base: 1 });
  }
}

function spawnShotgunConeAt(entry) {
  const mesh = makeShotgunConeMesh(entry.color || 0xffffff);
  mesh.position.set(entry.x, 0.045, entry.z);
  mesh.rotation.y = entry.angle;
  scene.add(mesh);
  fxBubbles.push({ mesh, life: 0, duration: 0.9, base: 1 });
}

function spawnSniperLineAt(entry) {
  const mesh = makeSniperLineMesh(entry.color || 0xfff2a8);
  mesh.position.set(entry.x, 0.13, entry.z);
  mesh.rotation.y = entry.angle;
  mesh.scale.z = currentIslandSize * 2.4;
  scene.add(mesh);
  fxBubbles.push({ mesh, life: 0, duration: 0.8, base: 1 });
}

function makeBeamBetween(p1, p2, color = 0xfff2a8, radius = 0.045, opacity = 0.95) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = Math.max(0.001, dir.length());
  const geo = new THREE.CylinderGeometry(radius, radius, len, 12);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(p1).add(p2).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function spawnSniperFadeShot(color, segments) {
  if (!segments || !segments.length) return;
  segments.forEach(sg => {
    const p1 = new THREE.Vector3(sg.x1, 0.66, sg.z1);
    const p2 = new THREE.Vector3(sg.x2, 0.66, sg.z2);
    const beam = makeBeamBetween(p1, p2, 0xfff2a8, 0.052, 0.96);
    scene.add(beam);
    fxBeams.push({ mesh: beam, life: 0, duration: 2.0, startOpacity: 0.96 });
    spawnFlash(sg.x1, 0.65, sg.z1, 0.9, 0xfff2a8, 0.28);
    if (sg.hitId) {
      setTimeout(() => killVictim(sg.hitId), 850);
    }
  });
}

function makeBloodDecal() {
  const geo = new THREE.PlaneGeometry(1.1 + Math.random() * 0.7, 1.1 + Math.random() * 0.7);
  const mat = new THREE.MeshBasicMaterial({ map: getBloodTexture(), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.random() * Math.PI * 2;
  return mesh;
}

function spawnImpact(pos) {
  const count = 14;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
    const theta = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2.5;
    velocities.push(new THREE.Vector3(Math.cos(theta) * speed, 2 + Math.random() * 2, Math.sin(theta) * speed));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xdd1e1e, size: 0.15, transparent: true, opacity: 1 });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  fxParticles.push({ points, velocities, life: 0, duration: 0.7 });

  const decal = makeBloodDecal();
  decal.position.set(pos.x, 0.015, pos.z);
  scene.add(decal);
  revealDecals.push(decal);
}

function updateFx(dt) {
  for (let i = fxSprites.length - 1; i >= 0; i--) {
    const f = fxSprites[i];
    f.life += dt;
    const t = f.life / f.duration;
    const base = f.baseScale || 0.8;
    f.sprite.scale.setScalar(base * (1 + t * 1.5));
    f.sprite.material.opacity = Math.max(0, 1 - t);
    if (t >= 1) { scene.remove(f.sprite); fxSprites.splice(i, 1); }
  }
  for (let i = fxBeams.length - 1; i >= 0; i--) {
    const b = fxBeams[i];
    b.life += dt;
    const t = b.life / b.duration;
    b.mesh.material.opacity = Math.max(0, (b.startOpacity || 0.95) * (1 - t));
    if (t >= 1) { scene.remove(b.mesh); fxBeams.splice(i, 1); }
  }
  for (let i = fxBullets.length - 1; i >= 0; i--) {
    const b = fxBullets[i];
    const remainingToNext = b.nextIdx < b.cum.length ? (b.cum[b.nextIdx] - b.dist) : Infinity;
    const nextIsVictim = b.nextIdx < b.hitAt.length && !!b.hitAt[b.nextIdx];
    const speed = nextIsVictim && remainingToNext < 4.0 ? BULLET_SLOW_SPEED : BULLET_SPEED;
    b.dist += speed * dt;
    // trigger the kill on any victim tagged at a vertex we've now passed
    while (b.nextIdx < b.pts.length && b.dist >= b.cum[b.nextIdx]) {
      if (b.hitAt[b.nextIdx]) killVictim(b.hitAt[b.nextIdx]);
      b.nextIdx++;
    }
    if (b.dist >= b.total) { scene.remove(b.mesh); scene.remove(b.glow); if (b.trail) scene.remove(b.trail); fxBullets.splice(i, 1); continue; }
    let seg = 1;
    while (seg < b.cum.length && b.cum[seg] < b.dist) seg++;
    const s0 = b.cum[seg - 1], s1 = b.cum[seg];
    const tt = s1 > s0 ? (b.dist - s0) / (s1 - s0) : 0;
    b.mesh.position.lerpVectors(b.pts[seg - 1], b.pts[seg], tt);
    b.glow.position.copy(b.mesh.position);
  }
  for (let i = fxBubbles.length - 1; i >= 0; i--) {
    const f = fxBubbles[i];
    f.life += dt;
    const t = f.life / f.duration;
    f.mesh.scale.setScalar((f.base || 1) * (1 + t * 0.55));
    f.mesh.traverse(obj => { if (obj.material && typeof obj.material.opacity === 'number') obj.material.opacity = Math.max(0, obj.material.opacity * 0.94); });
    if (f.mesh.material && typeof f.mesh.material.opacity === 'number') f.mesh.material.opacity = Math.max(0, 0.38 * (1 - t));
    if (t >= 1) { scene.remove(f.mesh); fxBubbles.splice(i, 1); }
  }
  for (let i = fxParticles.length - 1; i >= 0; i--) {
    const p = fxParticles[i];
    p.life += dt;
    const t = p.life / p.duration;
    const posAttr = p.points.geometry.attributes.position;
    for (let j = 0; j < p.velocities.length; j++) {
      const v = p.velocities[j];
      posAttr.array[j * 3] += v.x * dt;
      posAttr.array[j * 3 + 1] += v.y * dt;
      posAttr.array[j * 3 + 2] += v.z * dt;
      v.y -= 9 * dt;
    }
    posAttr.needsUpdate = true;
    p.points.material.opacity = Math.max(0, 1 - t);
    if (t >= 1) { scene.remove(p.points); fxParticles.splice(i, 1); }
  }
  for (let i = fxLabels.length - 1; i >= 0; i--) {
    const l = fxLabels[i];
    l.life += dt;
    const t = l.life / l.duration;
    l.sp.position.y = l.baseY + t * 1.3;
    l.sp.material.opacity = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
    if (t >= 1) { scene.remove(l.sp); fxLabels.splice(i, 1); }
  }
}

// ---------- Placement phase state ----------
let selfMesh = null;
let selfLaser = null;
let selfPos = new THREE.Vector3(0, 0, 0);
let selfAngle = 0;
let bounds = 7;
let mouseNdc = new THREE.Vector2(0, 0);
const raycaster = new THREE.Raycaster();
const keys = { w: false, a: false, s: false, d: false };

// ---------- Spectator state (dead players watch the rest of the match) ----------
let selfAlive = true;
let spectating = false;
let spectatorMeshes = new Map(); // id -> { mesh, x, z, angle, targetX, targetZ, targetAngle }
const spectateCamTarget = new THREE.Vector3(0, 14, 10);
let foresightVisionActive = false;
const foresightCamTarget = new THREE.Vector3(0, 16, 11);

function clearSpectatorMeshes() {
  spectatorMeshes.forEach(s => scene.remove(s.mesh));
  spectatorMeshes.clear();
}

function buildVisionMeshEntry(p) {
  const mesh = makePlayerMesh(p.color, false, p.hat, p.back, p.body);
  mesh.position.set(p.x, 0, p.z);
  mesh.rotation.y = p.angle;
  scene.add(mesh);
  return { mesh, x: p.x, z: p.z, angle: p.angle, targetX: p.x, targetZ: p.z, targetAngle: p.angle };
}

socket.on('spectateSnapshot', data => {
  clearSpectatorMeshes();
  data.players.forEach(p => {
    if (p.id === selfId) return;
    spectatorMeshes.set(p.id, buildVisionMeshEntry(p));
  });
});

function updateVisionTarget({ id, x, z, angle }) {
  const s = spectatorMeshes.get(id);
  if (s) { s.targetX = x; s.targetZ = z; s.targetAngle = angle; }
}

socket.on('spectateMove', updateVisionTarget);
socket.on('foresightMove', updateVisionTarget);

socket.on('foresightVisionStart', data => {
  foresightVisionActive = true;
  clearSpectatorMeshes();
  (data.players || []).forEach(p => {
    if (p.id === selfId) return;
    spectatorMeshes.set(p.id, buildVisionMeshEntry(p));
  });
  if (typeof data.islandSize === 'number') {
    foresightCamTarget.set(0, data.islandSize * 0.95 + 6, data.islandSize * 0.65 + 5);
  }
  showCenterAnnouncement('👁️ Foresight: มองเห็นผู้เล่นทุกคนแล้ว รอบนี้คุณจะไม่ยิง', 'skill', 3200);
  if (placing && !selfReady) {
    $('instructions').textContent = '👁️ Foresight: เห็นผู้เล่นทุกคนแบบ spectator • เดิน/หมุนเพื่อหลบได้ • รอบนี้จะไม่ยิง • SPACE ยืนยัน';
  }
});

socket.on('foresightVisionEnd', () => {
  foresightVisionActive = false;
  if (!spectating) clearSpectatorMeshes();
});

function updateVisionMeshes(dt) {
  spectatorMeshes.forEach(s => {
    s.x = THREE.MathUtils.lerp(s.x, s.targetX, Math.min(1, dt * 8));
    s.z = THREE.MathUtils.lerp(s.z, s.targetZ, Math.min(1, dt * 8));
    s.angle = THREE.MathUtils.lerp(s.angle, s.targetAngle, Math.min(1, dt * 8));
    s.mesh.position.set(s.x, 0, s.z);
    s.mesh.rotation.y = s.angle;
  });
}

function updateSpectate(dt) {
  if (!spectating) return;
  updateVisionMeshes(dt);

  camera.position.lerp(spectateCamTarget, 0.04);
  camera.lookAt(0, 0, 0);

  const remain = Math.max(0, roundEndsAt - Date.now());
  const secs = Math.ceil(remain / 1000);
  const tEl = $('timerValue');
  tEl.textContent = secs;
  tEl.classList.toggle('warn', secs <= 6);
}

window.addEventListener('keydown', e => setKey(e.code, true));
window.addEventListener('keyup', e => setKey(e.code, false));
// use physical key codes so movement works on any keyboard layout (Thai, etc.)
function setKey(code, val) {
  if (code === 'KeyW' || code === 'ArrowUp') keys.w = val;
  if (code === 'KeyS' || code === 'ArrowDown') keys.s = val;
  if (code === 'KeyA' || code === 'ArrowLeft') keys.a = val;
  if (code === 'KeyD' || code === 'ArrowRight') keys.d = val;
}

let selfReady = false;
let readyCount = 0;
let readyTotal = 0;
window.addEventListener('keydown', e => {
  if ((e.code === 'Space' || e.key === ' ') && placing && !spectating) {
    e.preventDefault();
    if (!selfReady) {
      selfReady = true;
      socket.emit('ready');
      updateReadyUI();
    }
  }
});

socket.on('readyUpdate', ({ ready, total }) => {
  readyCount = ready;
  readyTotal = total;
  updateReadyUI();
});

function updateReadyUI() {
  if (!placing || spectating) return;
  const inst = $('instructions');
  if (selfReady) {
    inst.textContent = `✅ พร้อมแล้ว! รอเพื่อน... (${readyCount}/${readyTotal})`;
  } else {
    inst.textContent = `WASD เดิน • เมาส์หมุนทิศเลเซอร์ • กด SPACE ยืนยันพร้อมยิง (${readyCount}/${readyTotal})`;
  }
  if (selfMesh && selfMesh.userData.ring) {
    selfMesh.userData.ring.material.color.set(selfReady ? 0x6dff8a : 0xffffff);
  }
}
window.addEventListener('mousemove', e => {
  mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

let placing = false;

socket.on('roundStart', data => {
  currentIslandSize = buildIsland(data.islandSize);
  bounds = data.bounds;
  currentRound = data.round;
  $('roundValue').textContent = data.round;
  $('islandValue').textContent = Math.round(data.islandSize);

  // clear previous reveal meshes
  clearRevealMeshes();
  clearSpectatorMeshes();

  if (selfMesh) { scene.remove(selfMesh); selfMesh = null; }
  if (selfLaser) { scene.remove(selfLaser); selfLaser = null; }
  clearAimSkillFx();
  foresightVisionActive = false;

  spectating = !selfAlive;
  placing = true;
  selfReady = false;
  readyCount = 0;
  readyTotal = 0;
  showScreen('game');
  $('btnEndGame').classList.toggle('hidden', !isHost);
  $('banner').classList.add('hidden');
  $('centerAnnouncement').classList.add('hidden');
  $('centerAnnouncement').classList.remove('show');
  $('eliminatedList').classList.add('hidden');
  $('orderPanel').classList.add('hidden');
  clearTimeout(orderShuffleTimer);
  roundEndsAt = data.endsAt;

  currentMode = data.mode || currentMode;
  $('passiveOverlay').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('gameCanvas').classList.remove('hidden');
  showCenterAnnouncement('🚶 Phase 1: เดิน • วางตำแหน่ง • หมุน • ใช้สกิล', 'phase', 3000);
  roster = data.roster || [];
  roster.forEach(pl => playerInfo.set(pl.id, { name: pl.name, color: pl.color }));
  renderSkillPanel(roster);
  $('cardLog').classList.add('hidden');
  renderPowerLog();

  if (spectating) {
    renderStatusNotice();
    $('orderPanel').classList.add('hidden');
    spectateCamTarget.set(0, data.islandSize * 0.85 + 6, data.islandSize * 0.6 + 4);
    $('instructions').textContent = '👻 คุณตกรอบแล้ว กำลังดูผู้เล่นที่เหลือหาที่กำบัง...';
  } else {
    const me = roster.find(p => p.id === selfId);
    myPassiveSkill = me ? me.passiveSkill : myPassiveSkill;
    myActiveSkill = me ? me.activeSkill : myActiveSkill;
    selfBody = me ? (me.body || selfBody) : selfBody;
    selfHat = me ? (me.hat || selfHat) : selfHat;
    selfBack = me ? (me.back || selfBack) : selfBack;
    selfColor = me ? (me.color || selfColor) : selfColor;
    myMoveLocked = !!(me && me.moveLocked);
    renderStatusNotice();
    $('instructions').textContent = myMoveLocked
      ? '⚡ รอบนี้โดน Taser: เดินไม่ได้ แต่ยังหมุนเล็ง/ยิง/ใช้สกิลได้ • SPACE ยืนยัน'
      : 'WASD เดิน • เมาส์เล็งทิศ • กด Active Skill ได้ถ้ามี • SPACE ยืนยัน';
    // find own color from last roomUpdate players list (fallback)
    if (me && typeof me.x === 'number') {
      selfPos.set(me.x, 0, me.z);
      selfAngle = me.angle || 0;
    } else {
      selfPos.set((Math.random() - 0.5) * 1, 0, (Math.random() - 0.5) * 1);
      selfAngle = Math.random() * Math.PI * 2;
    }

    selfMesh = makePlayerMesh(selfColor, true, selfHat, selfBack, selfBody);
    scene.add(selfMesh);
    selfLaser = makeLaser(selfColor);
    selfLaser.material.opacity = 0.5;
    scene.add(selfLaser);
    updateReadyUI();
    buildActivePanel();
  }
});

// Old card events are intentionally unused in Skill System V2.

// track color for self via roomUpdate
socket.on('roomUpdate', data => {
  const me = data.players.find(p => p.id === selfId);
  if (me) {
    selfColor = me.color || selfColor;
    selfHat = me.hat || selfHat;
    selfBack = me.back || selfBack;
    selfBody = me.body || selfBody;
    updateColorPickerUI(); updateHatPickerUI(); updateBackPickerUI(); updateBodyPickerUI();
  }
  $('aliveValue').textContent = data.players.filter(p => p.alive).length + '/' + data.players.length;
});

let roundEndsAt = 0;
let lastSent = 0;

function updatePlacement(dt) {
  if (!placing || !selfMesh) return;
  if (!selfReady) {
    const speed = 4.2;
    let mx = 0, mz = 0;
    if (keys.w) mz -= 1;
    if (keys.s) mz += 1;
    if (keys.a) mx -= 1;
    if (keys.d) mx += 1;
    if ((mx || mz) && !myMoveLocked) {
      const len = Math.hypot(mx, mz);
      selfPos.x += (mx / len) * speed * dt;
      selfPos.z += (mz / len) * speed * dt;
      selfPos.x = Math.max(-bounds, Math.min(bounds, selfPos.x));
      selfPos.z = Math.max(-bounds, Math.min(bounds, selfPos.z));
    }

    // aim via mouse -> ground plane
    raycaster.setFromCamera(mouseNdc, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      const dx = hit.x - selfPos.x;
      const dz = hit.z - selfPos.z;
      if (Math.hypot(dx, dz) > 0.05) selfAngle = Math.atan2(dx, dz);
    }

    const now = performance.now();
    if (now - lastSent > 80) {
      lastSent = now;
      socket.emit('move', { x: selfPos.x, z: selfPos.z, angle: selfAngle });
    }
  }

  selfMesh.position.set(selfPos.x, 0, selfPos.z);
  selfMesh.rotation.y = selfAngle;
  selfLaser.position.set(selfPos.x, 0.55, selfPos.z);
  selfLaser.rotation.y = selfAngle;
  selfLaser.visible = myActiveUsed !== 'foresight';
  selfLaser.scale.z = myActiveUsed === 'shotgun' ? 3 : bounds * 2;
  selfLaser.material.opacity = myActiveUsed === 'sniper' ? 0.95 : (myActiveUsed === 'shotgun' ? 0.25 : 0.5);
  selfLaser.material.color.set(myActiveUsed === 'sniper' ? 0xfff2a8 : selfColor);
  updateSkillAimPreview();

  // camera follow, high-angle chase view. Foresight uses a temporary spectator-style overview.
  if (foresightVisionActive) {
    updateVisionMeshes(dt);
    camera.position.lerp(foresightCamTarget, 0.08);
    camera.lookAt(0, 0, 0);
  } else {
    const camOffset = new THREE.Vector3(0, 11, 7);
    camera.position.set(selfPos.x + camOffset.x, camOffset.y, selfPos.z + camOffset.z);
    camera.lookAt(selfPos.x, 0.4, selfPos.z);
  }

  const remain = Math.max(0, roundEndsAt - Date.now());
  const secs = Math.ceil(remain / 1000);
  const tEl = $('timerValue');
  tEl.textContent = secs;
  tEl.classList.toggle('warn', secs <= 6);
}

// ---------- Reveal phase ----------
let revealMeshes = []; // {mesh, sprite, id, x, z, angle, color, wasHit, hitTime, bloodSpawned}
let revealMeshMap = new Map();
let revealShots = [];
let revealClock = 0;
let revealActive = false;

function clearRevealMeshes() {
  revealMeshes.forEach(r => {
    scene.remove(r.mesh);
    scene.remove(r.sprite);
  });
  revealMeshes = [];
  revealMeshMap = new Map();
  revealShots = [];
  fxSprites.forEach(f => scene.remove(f.sprite)); fxSprites = [];
  fxBeams.forEach(f => scene.remove(f.mesh)); fxBeams = [];
  fxParticles.forEach(f => scene.remove(f.points)); fxParticles = [];
  fxBullets.forEach(f => { scene.remove(f.mesh); scene.remove(f.glow); if (f.trail) scene.remove(f.trail); }); fxBullets = [];
  fxBubbles.forEach(f => scene.remove(f.mesh)); fxBubbles = [];
  fxLabels.forEach(l => scene.remove(l.sp)); fxLabels = [];
  revealDecals.forEach(d => scene.remove(d)); revealDecals = [];
  zoomFocus = null;
  revealActive = false;
}

// ---------- Active skill panel (placement phase) ----------
function updateCardHeader() { buildActivePanel(); }
function refreshPickHighlight() {}

function buildActivePanel() {
  const panel = $('orderPanel');
  const listEl = $('orderList');
  const header = $('cardHeader');
  if (!placing || spectating || currentMode !== 'skill') {
    panel.classList.add('hidden');
    header.classList.add('hidden');
    return;
  }
  listEl.innerHTML = '';
  clearTimeout(orderShuffleTimer);
  $('orderPanelTitle').textContent = '✨ Active Skill';
  const active = activeById(myActiveSkill);
  if (!active) {
    header.classList.remove('hidden');
    header.classList.add('skillActive');
    header.innerHTML = `<div class="cardEmoji">–</div>
      <div class="cardName">ยังไม่มี Active Skill</div>
      <div class="cardDesc">รอ Angel Blessing หลังจบรอบ เพื่อรับสกิลแบบสุ่ม</div>`;
    panel.classList.remove('hidden');
    return;
  }
  header.classList.remove('hidden');
  header.classList.add('skillActive');
  const used = myActiveUsed === active.id;
  header.innerHTML = `<div class="cardEmoji">${active.emoji}</div>
    <div class="cardName">${active.name}</div>
    <div class="cardDesc">${active.desc}</div>
    <button id="btnUseActive" class="useActiveBtn ${used ? 'used' : ''}" ${used || selfReady ? 'disabled' : ''}>${used ? 'ใช้แล้วในรอบนี้' : 'กดใช้ Active Skill'}</button>`;
  const btn = $('btnUseActive');
  if (btn) btn.addEventListener('click', () => {
    if (!placing || selfReady || !myActiveSkill) return;
    myActiveUsed = myActiveSkill;
    socket.emit('useActiveSkill', { skillId: myActiveSkill });
    buildActivePanel();
  });
  panel.classList.remove('hidden');
}

function buildCardPicker() { buildActivePanel(); }

// ---------- Firing order table ----------
let orderRowMap = new Map();
let orderShuffleTimer = null;

function shuffleIds(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// FLIP: smoothly slide each row from its old position to the new DOM order
function reorderRows(idList) {
  const listEl = $('orderList');
  const firstTops = new Map();
  orderRowMap.forEach((row, id) => firstTops.set(id, row.li.getBoundingClientRect().top));
  idList.forEach(id => { const r = orderRowMap.get(id); if (r) listEl.appendChild(r.li); });
  orderRowMap.forEach((row, id) => {
    const dy = firstTops.get(id) - row.li.getBoundingClientRect().top;
    if (!dy) return;
    row.li.style.transition = 'none';
    row.li.style.transform = `translateY(${dy}px)`;
    row.li.getBoundingClientRect(); // force reflow to lock the inverted start
    row.li.style.transition = 'transform .28s cubic-bezier(.2,.8,.3,1)';
    row.li.style.transform = '';
  });
}

function buildOrderTable(data) {
  const listEl = $('orderList');
  listEl.innerHTML = '';
  orderRowMap.clear();
  clearTimeout(orderShuffleTimer);
  $('orderPanelTitle').textContent = '🎲 ลำดับการยิง';
  $('cardHeader').classList.add('hidden');

  const trueOrder = data.shots.map(s => s.shooterId); // firing order = shot order
  data.shots.forEach(s => {
    const shooter = data.players.find(p => p.id === s.shooterId);
    if (!shooter) return;
    const active = activeById(s.activeUsed || shooter.activeUsed);
    const li = document.createElement('li');
    li.className = 'orderRow';
    li.innerHTML = `<span class="orderDot" style="background:${shooter.color}"></span>
      <span class="orderName">${escapeHtml(shooter.name)}${s.counter ? ' ↩' : ''}</span>
      <span class="orderCard" title="${active ? active.name : ''}">${active ? active.emoji : ''}</span>
      <span class="orderResult"></span>`;
    orderRowMap.set(s.shooterId, { li, resultEl: li.querySelector('.orderResult') });
  });

  // start in a random visible order; the true firing order stays hidden until it settles
  shuffleIds(trueOrder.slice()).forEach(id => listEl.appendChild(orderRowMap.get(id).li));
  $('orderPanel').classList.remove('hidden');

  // shuffle fast at first, then gradually slow down before settling on the true order
  // just before the first shot goes off. This feels like a real spinning roll.
  if (trueOrder.length > 1) {
    const start = performance.now();
    const settleAt = Math.max(900, SHOT_START_DELAY - 450);
    const spin = () => {
      const elapsed = performance.now() - start;
      const progress = Math.min(1, elapsed / settleAt);
      if (progress >= 1) {
        orderRowMap.forEach(row => row.li.classList.remove('rolling'));
        reorderRows(trueOrder);
        orderShuffleTimer = null;
        return;
      }
      orderRowMap.forEach(row => row.li.classList.add('rolling'));
      reorderRows(shuffleIds(trueOrder.slice()));
      const nextDelay = 55 + Math.pow(progress, 2.4) * 430;
      orderShuffleTimer = setTimeout(spin, nextDelay);
    };
    clearTimeout(orderShuffleTimer);
    orderShuffleTimer = setTimeout(spin, 55);
  }
}

function shotResultIcon(shot) {
  if (shot.type === 'foresight') return '👁️';
  if (shot.type === 'skip' || shot.skipped) return '💀';
  if ((shot.taserLocks || []).length) return '⚡';
  const hits = (shot.hitIds || []).length;
  if (shot.type === 'shotgun') return hits ? '🔫🎯' : '🔫❌';
  if (shot.type === 'sniper') return hits ? '🎯💥' : '🎯❌';
  return hits ? (hits > 1 ? '🎯🎯' : '🎯') : '❌';
}

function revealOrderRow(shot) {
  const row = orderRowMap.get(shot.shooterId);
  if (!row) return;
  row.li.classList.add('active');
  setTimeout(() => {
    row.li.classList.remove('active');
    row.li.classList.add('done');
    row.resultEl.textContent = shotResultIcon(shot);
  }, 400);
}

socket.on('roundResult', data => {
  placing = false;
  spectating = false;
  const me = data.players.find(p => p.id === selfId);
  if (me) selfAlive = me.alive;
  if (selfMesh) { scene.remove(selfMesh); selfMesh = null; }
  if (selfLaser) { scene.remove(selfLaser); selfLaser = null; }
  clearAimSkillFx();
  clearRevealMeshes();
  foresightVisionActive = false;
  clearSpectatorMeshes();

  data.players.forEach(p => playerInfo.set(p.id, { name: p.name, color: p.color }));
  renderSkillPanel(data.skillState || data.players);
  buildCardLog(data);
  renderPowerLog();

  data.players.forEach(p => {
    const size = p.size || 1;
    const mesh = makePlayerMesh(p.color, p.id === selfId, p.hat, p.back, p.body);
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.angle;
    mesh.scale.setScalar(size);
    scene.add(mesh);
    const sprite = makeNameSprite(p.name, p.color);
    sprite.position.set(p.x, 1.7 * size + 0.2, p.z);
    scene.add(sprite);
    const entry = {
      mesh, sprite, id: p.id, x: p.x, z: p.z, angle: p.angle, color: p.color, size,
      wasHit: p.wasHit, dying: false, bloodSpawned: false
    };
    revealMeshes.push(entry);
    revealMeshMap.set(p.id, entry);
  });

  // blood/deaths are now triggered as the travelling bullets (or thunder) actually reach victims
  revealShots = data.shots.map((s, i) => ({ ...s, fireTime: SHOT_START_DELAY + i * SHOT_INTERVAL, triggered: false }));

  buildOrderTable(data);
  showCenterAnnouncement('🎲 Phase 2: จัดลำดับการยิง', 'phase', 3200);
  setTimeout(() => showCenterAnnouncement('🔫 Phase 3: ยิง', 'phase', 2200), Math.max(400, SHOT_START_DELAY - 700));

  // camera pulls back to see whole island
  const size = data.islandSize;
  overviewCamTarget.set(0, size * 0.85 + 6, size * 0.6 + 4);

  revealClock = 0;
  revealActive = true;

  const bannerDelay = SHOT_START_DELAY + data.shots.length * SHOT_INTERVAL + 900;
  setTimeout(() => {
    const names = data.eliminated.map(id => {
      const pl = data.players.find(p => p.id === id);
      return pl ? pl.name : '?';
    });
    const banner = $('banner');
    const elimEl = $('eliminatedList');
    if (data.angelGrant) {
      const grantPlayer = data.players.find(p => p.id === data.angelGrant.playerId);
      const grantSkill = activeById(data.angelGrant.skillId);
      const grantName = grantPlayer ? grantPlayer.name : (data.angelGrant.playerName || 'ผู้เล่น');
      const skillName = data.angelGrant.skillName || (grantSkill ? grantSkill.name : 'Active Skill');
      banner.textContent = `😇 Angel Blessing: ${grantName} ได้รับ ${skillName}`;
      showCenterAnnouncement(`😇 ${grantName} ได้รับ ${grantSkill ? grantSkill.emoji + ' ' : ''}${skillName}!`, 'angel', 3600);
      $('skillPanel').classList.add('angelFlash');
      setTimeout(() => $('skillPanel').classList.remove('angelFlash'), 3200);
    } else if (names.length) {
      banner.textContent = `📋 สรุปการตายรอบนี้: ${names.join(', ')}`;
      showCenterAnnouncement(`📋 สรุปรอบนี้: ตกรอบ ${names.length} คน`, 'summary', 3000);
    } else {
      banner.textContent = '📋 สรุปการตายรอบนี้: ไม่มีใครโดนยิง';
      showCenterAnnouncement('📋 สรุปรอบนี้: ไม่มีใครตกรอบ', 'summary', 3000);
    }
    elimEl.textContent = data.survivors.length + ' คนยังรอด';
    banner.classList.remove('hidden');
    elimEl.classList.remove('hidden');
  }, bannerDelay);
});

socket.on('nextRoundCountdown', () => {
  // handled implicitly, next 'roundStart' will fire
});

const overviewCamTarget = new THREE.Vector3(0, 14, 10);
const zoomCamPos = new THREE.Vector3();

function updateReveal(dt) {
  if (!revealActive) return;
  revealClock += dt * 1000;

  // pull the camera in on a player whose hidden power is firing, else the wide overview
  if (zoomFocus && revealClock < zoomFocus.until) {
    zoomCamPos.set(zoomFocus.x, 5.5, zoomFocus.z + 5);
    camera.position.lerp(zoomCamPos, 0.09);
    camera.lookAt(zoomFocus.x, 0.6, zoomFocus.z);
  } else {
    if (zoomFocus) zoomFocus = null;
    camera.position.lerp(overviewCamTarget, 0.04);
    camera.lookAt(0, 0, 0);
  }

  revealShots.forEach(s => {
    if (s.triggered || revealClock < s.fireTime) return;
    s.triggered = true;
    revealOrderRow(s);
    triggerShot(s);
  });

  revealMeshes.forEach(entry => {
    if (entry.dying) {
      entry.mesh.rotation.z = THREE.MathUtils.lerp(entry.mesh.rotation.z, Math.PI / 2, dt * 4);
      entry.mesh.position.y = THREE.MathUtils.lerp(entry.mesh.position.y, -0.4 * entry.size, dt * 4);
    } else if (entry.dodgeUntil && revealClock < entry.dodgeUntil) {
      entry.mesh.rotation.x = THREE.MathUtils.lerp(entry.mesh.rotation.x, -1.1, dt * 8); // Matrix lean-back
    } else if (entry.mesh.rotation.x !== 0) {
      entry.mesh.rotation.x = THREE.MathUtils.lerp(entry.mesh.rotation.x, 0, dt * 6);
    }
  });

  updateFx(dt);
}

function focusOn(entry, ms) {
  zoomFocus = { x: entry.x, z: entry.z, until: revealClock + ms };
}

// reveal triggered skills: zoom in + a floating label
function handlePowerEvents(s) {
  const shooter = revealMeshMap.get(s.shooterId);
  if (shooter && s.activeUsed) {
    focusOn(shooter, 1600);
    floatLabel(shooter.x, shooter.z, 2.5 * shooter.size, SKILL_LABEL[s.activeUsed] || s.activeUsed, '#e7d6ff');
    if (s.activeUsed === 'shotgun') spawnShotgunConeAt(shooter);
    if (s.activeUsed === 'shield') spawnShieldBubble(shooter);
  }
  if (shooter && s.counter) {
    focusOn(shooter, 1500);
    floatLabel(shooter.x, shooter.z, 2.4 * shooter.size, '↩ COUNTER!', '#ffd980');
  }
  (s.dodges || []).forEach(id => {
    const e = revealMeshMap.get(id);
    if (!e) return;
    focusOn(e, 2200);
    e.dodgeUntil = revealClock + 1400;
    spawnDodgeAfterimage(e);
    floatLabel(e.x, e.z, 2.6 * e.size, '💨 DODGE!', '#9fe0ff');
  });
  (s.foresightDodges || []).forEach(id => {
    const e = revealMeshMap.get(id);
    if (!e) return;
    focusOn(e, 2200);
    e.dodgeUntil = revealClock + 1400;
    spawnDodgeAfterimage(e, 0xd9c5ff);
    floatLabel(e.x, e.z, 2.6 * e.size, '👁️ FORESIGHT!', '#d9c5ff');
  });
  (s.shieldBlocks || []).forEach(b => {
    const e = revealMeshMap.get(b.id);
    if (!e) return;
    focusOn(e, 2200);
    spawnFlash(e.x, 1.1, e.z, 1.5, 0x9fd3ff, 0.5);
    spawnShieldBubble(e);
    floatLabel(e.x, e.z, 2.6 * e.size, '🛡️ SHIELD!', '#bfe6ff');
  });
  (s.secondChance || []).forEach(sc => {
    const e = revealMeshMap.get(sc.id);
    if (!e) return;
    focusOn(e, 2400);
    e.mesh.position.set(sc.x, 0, sc.z);
    e.sprite.position.set(sc.x, 1.7 * e.size + 0.2, sc.z);
    e.x = sc.x; e.z = sc.z;
    floatLabel(e.x, e.z, 2.6 * e.size, '🔁 SECOND CHANCE!', '#ffd980');
  });
  (s.secondChanceFail || []).forEach(id => {
    const e = revealMeshMap.get(id);
    if (!e) return;
    focusOn(e, 1800);
    floatLabel(e.x, e.z, 2.6 * e.size, '🔁 ตกแมพ!', '#ff9f9f');
  });
  (s.taserLocks || []).forEach(id => {
    const e = revealMeshMap.get(id);
    if (!e) return;
    focusOn(e, 2200);
    spawnFlash(e.x, 1.0, e.z, 1.4, 0xaad4ff, 0.6);
    floatLabel(e.x, e.z, 2.6 * e.size, '⚡ STUN!', '#bfe0ff');
  });
}

// a victim goes down: spatter blood once and start the fall animation
function killVictim(id) {
  const entry = revealMeshMap.get(id);
  if (!entry || entry.dying) return;
  entry.dying = true;
  if (!entry.bloodSpawned) {
    entry.bloodSpawned = true;
    spawnImpact(new THREE.Vector3(entry.x, 0.5, entry.z));
  }
}

function triggerShot(s) {
  if (s.type === 'skip' || s.skipped) return; // already down before their turn
  const shooterEntry = revealMeshMap.get(s.shooterId);
  if (!shooterEntry) return;

  handlePowerEvents(s);

  spawnMuzzleFlash(shooterEntry);
  if (s.type === 'sniper') {
    (s.bullets || []).forEach(b => spawnSniperFadeShot(shooterEntry.color, b.segments));
    return;
  }
  const bulletR = s.type === 'shotgun' ? 0.1 : 0.12;
  (s.bullets || []).forEach(b => spawnSegmentBullet(shooterEntry.color, b.segments, bulletR));
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  updatePlacement(dt);
  updateSpectate(dt);
  updateReveal(dt);
  renderer.render(scene, camera);
}
animate();

// initial camera position
camera.position.set(0, 11, 8);
camera.lookAt(0, 0, 0);
buildIsland(16);
