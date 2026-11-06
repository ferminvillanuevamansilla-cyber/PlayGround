import * as THREE from 'three';
import './style.css';
import {
  BLOCK, BLOCKS, PLACEABLE, TILE_UV, makeBlockIcon, isCross, isLiquid, isSolid,
} from './blocks.js';
import { VoxelWorld, SX, SZ, SY, SEA, CHUNK, CHUNKS_X, CHUNKS_Z } from './world.js';
import { SkySystem } from './sky.js';
import { PigManager } from './entities.js';
import { GameAudio } from './audio.js';

const SAVE_KEY = 'blockisle.save.v1';
const PENDING_SEED_KEY = 'blockisle.pendingSeed';
const DEFAULT_SEED = 884213;
const DEFAULT_HOTBAR = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.PLANKS,
  BLOCK.LOG, BLOCK.LEAVES, BLOCK.GLASS, BLOCK.BRICK,
];
const PLAYER_HALF = 0.3;
const PLAYER_HEIGHT = 1.72;
const EYE_HEIGHT = 1.62;
const DAY_SECONDS = 540;
const REACH = 6.2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.seed !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

const save = loadSave();
const pendingSeed = Number(localStorage.getItem(PENDING_SEED_KEY));
const newSeed = Number.isFinite(pendingSeed) && pendingSeed > 0 ? pendingSeed : DEFAULT_SEED;
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle('touch', isTouch);
document.body.classList.toggle('desktop', !isTouch);

// ---------------------------------------------------------------------------
// Scene and renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
  alpha: false,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x88c9ef, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfeafc, 48, 155);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 420);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = new VoxelWorld(save?.seed ?? newSeed);
if (save?.edits?.length) world.applyEdits(save.edits);
scene.add(world.group);

// A far ocean plane hides the finite edge of the chunk grid and gives the
// island a proper horizon when seen from the title-screen camera.
const oceanCanvas = document.createElement('canvas');
oceanCanvas.width = 64;
oceanCanvas.height = 64;
const oceanCtx = oceanCanvas.getContext('2d');
oceanCtx.fillStyle = '#4a90c8';
oceanCtx.fillRect(0, 0, 64, 64);
for (let i = 0; i < 22; i++) {
  oceanCtx.fillStyle = i % 3 === 0 ? 'rgba(176,222,245,0.4)' : 'rgba(44,99,156,0.32)';
  oceanCtx.fillRect((i * 23) % 64, (i * 17) % 64, 8 + (i % 4) * 5, 1);
}
const oceanTexture = new THREE.CanvasTexture(oceanCanvas);
oceanTexture.colorSpace = THREE.SRGBColorSpace;
oceanTexture.wrapS = THREE.RepeatWrapping;
oceanTexture.wrapT = THREE.RepeatWrapping;
oceanTexture.repeat.set(400, 400);
oceanTexture.magFilter = THREE.LinearFilter;
oceanTexture.minFilter = THREE.LinearMipmapLinearFilter;
oceanTexture.generateMipmaps = true;
oceanTexture.anisotropy = 4;
const oceanMaterial = new THREE.MeshBasicMaterial({ map: oceanTexture, color: 0xd8ecff });
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), oceanMaterial);
ocean.name = 'ocean';
ocean.rotation.x = -Math.PI / 2;
ocean.position.set(SX / 2, SEA + 0.925, SZ / 2);
ocean.renderOrder = 1;
scene.add(ocean);

const sky = new SkySystem(scene, world.seed);
const hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x526b43, 1.5);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xfff1c9, 1.4);
scene.add(sunLight);

const spawn = world.findSpawn();
const pigs = new PigManager(scene, world, spawn);

let player = {
  pos: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
  vel: new THREE.Vector3(),
  yaw: Math.PI * 0.78,
  pitch: -0.06,
  onGround: true,
  inWater: false,
  walkPhase: 0,
  stepDistance: 0,
  coyote: 0,
  wasInWater: false,
};

const stats = {
  mined: save?.stats?.mined ?? 0,
  placed: save?.stats?.placed ?? 0,
  logs: save?.stats?.logs ?? 0,
  glassPlaced: save?.stats?.glassPlaced ?? 0,
  questIndex: save?.stats?.questIndex ?? 0,
  day: save?.stats?.day ?? 1,
};
let timeOfDay = typeof save?.timeOfDay === 'number' ? save.timeOfDay : 0.335;

if (save?.player) {
  const p = save.player;
  if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
    player.pos.set(clamp(p.x, 0.4, SX - 0.4), clamp(p.y, 1, SY - 3), clamp(p.z, 0.4, SZ - 0.4));
    player.yaw = Number.isFinite(p.yaw) ? p.yaw : player.yaw;
    player.pitch = Number.isFinite(p.pitch) ? clamp(p.pitch, -1.55, 1.55) : player.pitch;
  }
}
if (collides(player.pos)) {
  player.pos.set(spawn.x, spawn.y, spawn.z);
  player.vel.set(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Held block
// ---------------------------------------------------------------------------
const hand = new THREE.Group();
camera.add(hand);
const HAND_BASE = new THREE.Vector3(0.39, -0.25, -0.8);
const HAND_ROT = new THREE.Euler(0.16, -0.45, 0.1);
let handMesh = null;
let handMaterial = null;
let swingTime = 0;
const SWING_LENGTH = 0.26;
const handSway = { x: 0, y: 0 };

// A chunky first-person arm makes the held block read as an item rather than
// part of the terrain. It shares the camera so it is always in view.
const ARM_BASE = new THREE.Color(0xd39a76);
const ARM_DARK = new THREE.Color(0xb57a5b);
const armMaterial = new THREE.MeshBasicMaterial({ color: ARM_BASE.clone() });
const armMaterialDark = new THREE.MeshBasicMaterial({ color: ARM_DARK.clone() });
const armGroup = new THREE.Group();
const palm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), armMaterial);
palm.position.set(0.46, -0.47, -0.7);
palm.rotation.set(0.2, -0.3, 0.15);
armGroup.add(palm);
const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.3), armMaterialDark);
forearm.position.set(0.56, -0.59, -0.57);
forearm.rotation.set(-0.24, 0.18, -0.5);
armGroup.add(forearm);
const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.13), new THREE.MeshBasicMaterial({ color: 0x4d7f9e }));
sleeve.position.set(0.66, -0.67, -0.44);
sleeve.rotation.set(-0.24, 0.18, -0.5);
armGroup.add(sleeve);
hand.add(armGroup);

const heldEdgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
const heldEdgeMat = new THREE.LineBasicMaterial({ color: 0x1a2a20, transparent: true, opacity: 0.32 });

const HELD_FACES = [
  { n: [1, 0, 0], c: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]], key: 'side', shade: 0.83 },
  { n: [-1, 0, 0], c: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]], key: 'side', shade: 0.75 },
  { n: [0, 1, 0], c: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]], key: 'top', shade: 1 },
  { n: [0, -1, 0], c: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]], key: 'bottom', shade: 0.54 },
  { n: [0, 0, 1], c: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]], key: 'side', shade: 0.9 },
  { n: [0, 0, -1], c: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]], key: 'side', shade: 0.78 },
];

function makeHeldGeometry(id) {
  const block = BLOCKS[id];
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];
  for (const face of HELD_FACES) {
    const tile = block.tiles[face.key];
    const u = TILE_UV[tile];
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(...face.c[i]);
      nrm.push(...face.n);
      uv.push(...(i === 1 || i === 2 ? [u.u1, i === 2 ? u.v1 : u.v0] : [u.u0, i === 3 ? u.v1 : u.v0]));
      col.push(face.shade, face.shade, face.shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function setHandBlock(id) {
  if (handMesh) {
    hand.remove(handMesh);
    handMesh.geometry.dispose();
  }
  handMaterial = id === BLOCK.GLASS ? world.materials.glass
    : id === BLOCK.LEAVES ? world.materials.cutout
      : world.materials.opaque;
  handMesh = new THREE.Mesh(makeHeldGeometry(id), handMaterial);
  handMesh.scale.setScalar(0.23);
  handMesh.position.copy(HAND_BASE);
  handMesh.rotation.copy(HAND_ROT);
  handMesh.renderOrder = 5;
  handMesh.frustumCulled = false;
  const edge = new THREE.LineSegments(heldEdgesGeo, heldEdgeMat);
  edge.renderOrder = 6;
  handMesh.add(edge);
  hand.add(handMesh);
  hand.visible = state === 'playing' && !isTouch;
}

function swing() {
  swingTime = SWING_LENGTH;
}

// ---------------------------------------------------------------------------
// Highlight and particles
// ---------------------------------------------------------------------------
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008, 1.008, 1.008)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, depthTest: true }),
);
outline.visible = false;
outline.renderOrder = 4;
scene.add(outline);

const partCount = 180;
const partGeo = new THREE.BoxGeometry(0.105, 0.105, 0.105);
const partMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1 });
const particles = new THREE.InstancedMesh(partGeo, partMat, partCount);
particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
particles.frustumCulled = false;
scene.add(particles);
const partDummy = new THREE.Object3D();
const particleData = Array.from({ length: partCount }, () => ({
  active: false, life: 0, maxLife: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), size: 0.1, spin: 0,
}));
for (let i = 0; i < partCount; i++) {
  partDummy.position.set(0, -100, 0);
  partDummy.scale.setScalar(0);
  partDummy.updateMatrix();
  particles.setMatrixAt(i, partDummy.matrix);
  particles.setColorAt(i, new THREE.Color(0xffffff));
}
particles.instanceMatrix.needsUpdate = true;
particles.instanceColor.needsUpdate = true;
let partCursor = 0;

const confettiColors = [0xffd45e, 0x9ae65e, 0xff7f66, 0x72d7ff, 0xffffff, 0xff9ad5];

function spawnParticles(x, y, z, color, count = 8, confetti = false) {
  const c = new THREE.Color(color);
  for (let n = 0; n < count; n++) {
    const i = partCursor++ % partCount;
    const p = particleData[i];
    p.active = true;
    p.life = confetti ? 1.8 + Math.random() : 0.55 + Math.random() * 0.45;
    p.maxLife = p.life;
    p.pos.set(x + (Math.random() - 0.5) * 0.55, y + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.55);
    if (confetti) {
      p.vel.set((Math.random() - 0.5) * 5.5, 2.5 + Math.random() * 5, (Math.random() - 0.5) * 5.5);
      p.size = 0.07 + Math.random() * 0.07;
      particles.setColorAt(i, new THREE.Color(confettiColors[(Math.random() * confettiColors.length) | 0]));
    } else {
      p.vel.set((Math.random() - 0.5) * 2.8, 1.4 + Math.random() * 2.4, (Math.random() - 0.5) * 2.8);
      p.size = 0.055 + Math.random() * 0.07;
      const shade = 0.78 + Math.random() * 0.4;
      particles.setColorAt(i, c.clone().multiplyScalar(shade));
    }
    p.spin = Math.random() * Math.PI;
  }
  particles.instanceColor.needsUpdate = true;
}

function updateParticles(dt) {
  let dirty = false;
  for (let i = 0; i < partCount; i++) {
    const p = particleData[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      partDummy.position.set(0, -100, 0);
      partDummy.scale.setScalar(0);
      partDummy.updateMatrix();
      particles.setMatrixAt(i, partDummy.matrix);
      dirty = true;
      continue;
    }
    p.vel.y -= 14 * dt;
    p.pos.addScaledVector(p.vel, dt);
    if (p.pos.y < 0.1) { p.pos.y = 0.1; p.vel.y *= -0.25; p.vel.x *= 0.7; p.vel.z *= 0.7; }
    p.spin += dt * 5;
    const scale = p.size * Math.min(1, (p.life / Math.min(p.maxLife, 0.4)));
    partDummy.position.copy(p.pos);
    partDummy.rotation.set(p.spin, p.spin * 0.7, p.spin * 0.3);
    partDummy.scale.setScalar(Math.max(0.02, scale / 0.105));
    partDummy.updateMatrix();
    particles.setMatrixAt(i, partDummy.matrix);
    dirty = true;
  }
  if (dirty) particles.instanceMatrix.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Audio + UI helpers
// ---------------------------------------------------------------------------
const audio = new GameAudio();
audio.setEnabled(localStorage.getItem('blockisle.sound') !== 'off');

const el = (id) => document.getElementById(id);
const hud = el('hud');
const startScreen = el('startScreen');
const loading = el('loading');
const pauseScreen = el('pauseScreen');
const paletteScreen = el('paletteScreen');
const helpScreen = el('helpScreen');
const touchControls = el('touch-controls');
const toastEl = el('toast');
const waterTint = el('waterTint');
const crosshair = el('crosshair');
const goalCard = el('goalCard');
const goalKicker = el('goalKicker');
const goalLabel = el('goalLabel');
const goalProgress = el('goalProgress');
const goalFill = el('goalFill');
const dayLabel = el('dayLabel');
const clockLabel = el('clock');
const blockLabel = el('blockLabel');
const hotbarEl = el('hotbar');
const soundBtn = el('soundBtn');
const seedLabel = el('seedLabel');
const startSaveNote = el('startSaveNote');

let state = 'loading';
let toastTimer = 0;
let toastHideTimer = 0;

function toast(message, gold = false, duration = 1850) {
  toastEl.textContent = message;
  toastEl.classList.toggle('gold', gold);
  toastEl.classList.add('show');
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

function updateSoundButton() {
  soundBtn.classList.toggle('muted', !audio.enabled);
  soundBtn.setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Enable sound');
}

// ---------------------------------------------------------------------------
// Hotbar and block library
// ---------------------------------------------------------------------------
const iconCache = new Map();
function iconFor(id) {
  if (!iconCache.has(id)) iconCache.set(id, makeBlockIcon(id, 64, world.atlas.image));
  return iconCache.get(id);
}
let hotbarIds = save?.hotbar?.length === 9
  ? save.hotbar.map((id) => (BLOCKS[id] && isSolid(id) ? id : BLOCK.GRASS))
  : [...DEFAULT_HOTBAR];
let activeSlot = save?.activeSlot && save.activeSlot >= 0 && save.activeSlot < 9 ? save.activeSlot : 0;

function renderHotbar() {
  hotbarEl.innerHTML = '';
  hotbarIds.forEach((id, i) => {
    const b = document.createElement('button');
    b.className = `slot${i === activeSlot ? ' selected' : ''}`;
    b.setAttribute('aria-label', `${i + 1}: ${BLOCKS[id].name}`);
    b.dataset.slot = String(i);
    b.innerHTML = `<span class="num">${i + 1}</span><img src="${iconFor(id)}" alt="" draggable="false">`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSlot(i);
    });
    hotbarEl.appendChild(b);
  });
}

function showBlockLabel() {
  blockLabel.textContent = BLOCKS[hotbarIds[activeSlot]].name.toUpperCase();
  blockLabel.classList.add('show');
  clearTimeout(showBlockLabel.timer);
  showBlockLabel.timer = setTimeout(() => blockLabel.classList.remove('show'), 1500);
}

function selectSlot(i) {
  if (i < 0 || i >= hotbarIds.length) return;
  activeSlot = i;
  [...hotbarEl.children].forEach((node, n) => node.classList.toggle('selected', n === i));
  setHandBlock(hotbarIds[i]);
  showBlockLabel();
  if (audio.enabled) audio.click();
  scheduleSave();
}

function cycleSlot(dir) {
  selectSlot((activeSlot + dir + 9) % 9);
}

const paletteGrid = el('paletteGrid');
function renderPalette() {
  paletteGrid.innerHTML = '';
  for (const id of PLACEABLE) {
    const b = document.createElement('button');
    b.className = `palette-item${hotbarIds[activeSlot] === id ? ' active' : ''}`;
    b.innerHTML = `<img src="${iconFor(id)}" alt="" draggable="false"><span>${BLOCKS[id].name.toUpperCase()}</span>`;
    b.addEventListener('click', () => {
      hotbarIds[activeSlot] = id;
      renderHotbar();
      setHandBlock(id);
      scheduleSave();
      toast(`${BLOCKS[id].name} → slot ${activeSlot + 1}`, false, 1300);
      closePalette();
    });
    paletteGrid.appendChild(b);
  }
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------
const QUESTS = [
  {
    kicker: 'GATHER', label: 'Chop 3 oak logs', target: 3,
    value: () => stats.logs,
  },
  {
    kicker: 'BUILD', label: 'Place 12 blocks', target: 12,
    value: () => stats.placed,
  },
  {
    kicker: 'EXPLORE', label: 'Mine 25 blocks', target: 25,
    value: () => stats.mined,
  },
  {
    kicker: 'DECORATE', label: 'Place 4 glass blocks', target: 4,
    value: () => stats.glassPlaced,
  },
  {
    kicker: 'ADVENTURE', label: 'Climb to height 30', target: 1,
    value: () => (player.pos.y >= 30 ? 1 : 0),
  },
];

let goalAnimating = false;
function updateGoal(animate = false) {
  if (stats.questIndex >= QUESTS.length) {
    goalKicker.textContent = 'ISLAND MASTER';
    goalLabel.textContent = 'All goals complete — make it yours';
    goalProgress.textContent = '∞';
    goalFill.style.width = '100%';
    return;
  }
  const q = QUESTS[stats.questIndex];
  const val = Math.min(q.target, Math.max(0, Math.floor(q.value())));
  goalKicker.textContent = `ISLAND GOAL ${stats.questIndex + 1}`;
  goalLabel.textContent = q.label;
  goalProgress.textContent = q.target === 1 && val >= 1 ? 'DONE' : `${val} / ${q.target}`;
  goalFill.style.width = `${(val / q.target) * 100}%`;
  if (animate && val >= q.target && !goalAnimating) {
    goalAnimating = true;
    stats.questIndex++;
    audio.goal();
    spawnParticles(player.pos.x, player.pos.y + 1.3, player.pos.z, 0xffd45e, 36, true);
    toast('GOAL COMPLETE!  ' + q.label, true, 2200);
    goalCard.classList.remove('pop');
    void goalCard.offsetWidth;
    goalCard.classList.add('pop');
    updateGoal();
    scheduleSave();
    setTimeout(() => { goalAnimating = false; }, 600);
    if (stats.questIndex >= QUESTS.length) {
      setTimeout(() => toast('ISLAND MASTER — free build unlocked!', true, 3000), 900);
    }
  }
}

// ---------------------------------------------------------------------------
// World setup / loading
// ---------------------------------------------------------------------------
const buildQueue = [];
for (let cz = 0; cz < CHUNKS_Z; cz++) {
  for (let cx = 0; cx < CHUNKS_X; cx++) {
    const wx = cx * CHUNK + 8;
    const wz = cz * CHUNK + 8;
    const d = (wx - spawn.x) ** 2 + (wz - spawn.z) ** 2;
    buildQueue.push({ cx, cz, d });
  }
}
buildQueue.sort((a, b) => a.d - b.d);
let buildIndex = 0;
const loadingText = el('loadingText');
const loadingFill = el('loadingFill');
const loadingPhrases = ['Planting oak trees…', 'Carving the coastline…', 'Releasing the pigs…', 'Hanging the clouds…', 'Polishing the sun…'];

function finishLoading() {
  loading.classList.add('hidden');
  startScreen.classList.remove('hidden');
  state = 'menu';
  setupMenuCamera();
  startSaveNote.textContent = save?.player
    ? `Saved island found · Day ${stats.day} · ${stats.mined} block${stats.mined === 1 ? '' : 's'} mined`
    : '';
  el('playLabel').textContent = save?.player ? 'CONTINUE' : 'PLAY';
  updateSoundButton();
  updateGoal();
}

function buildSomeChunks() {
  const t0 = performance.now();
  while (buildIndex < buildQueue.length && performance.now() - t0 < 13) {
    const { cx, cz } = buildQueue[buildIndex++];
    world.buildChunk(cx, cz);
  }
  const progress = buildIndex / buildQueue.length;
  loadingFill.style.width = `${Math.round(progress * 100)}%`;
  loadingText.textContent = loadingPhrases[Math.min(loadingPhrases.length - 1, Math.floor(progress * loadingPhrases.length))];
  if (buildIndex < buildQueue.length) requestAnimationFrame(buildSomeChunks);
  else finishLoading();
}
requestAnimationFrame(buildSomeChunks);

// ---------------------------------------------------------------------------
// Menu camera
// ---------------------------------------------------------------------------
let orbitAngle = 2.28;
let menuBlend = 0;
function setupMenuCamera() {
  orbitAngle = 2.28;
  menuBlend = 0;
  hand.visible = false;
  camera.fov = 64;
  camera.updateProjectionMatrix();
  updateMenuCamera(0);
}
function updateMenuCamera(dt) {
  orbitAngle += dt * 0.014;
  const radius = 60;
  const cx = spawn.x + Math.sin(orbitAngle) * radius;
  const cz = spawn.z + Math.cos(orbitAngle) * radius;
  const cy = spawn.y + 30;
  camera.position.set(cx, cy, cz);
  const targetX = spawn.x + Math.sin(orbitAngle + 0.35) * 4;
  const targetZ = spawn.z + Math.cos(orbitAngle + 0.35) * 4;
  camera.lookAt(targetX, spawn.y + 1.6, targetZ);
}

// ---------------------------------------------------------------------------
// Camera and player
// ---------------------------------------------------------------------------
function syncCamera() {
  const bob = player.onGround ? Math.sin(player.walkPhase * 2) * 0.022 : 0;
  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + bob, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

function boxIntersectsPlayer(bx, by, bz) {
  const p = player.pos;
  return p.x + PLAYER_HALF > bx && p.x - PLAYER_HALF < bx + 1
    && p.y + PLAYER_HEIGHT > by && p.y < by + 1
    && p.z + PLAYER_HALF > bz && p.z - PLAYER_HALF < bz + 1;
}

function collides(pos) {
  const minX = Math.floor(pos.x - PLAYER_HALF);
  const maxX = Math.floor(pos.x + PLAYER_HALF - 0.001);
  const minY = Math.floor(pos.y);
  const maxY = Math.floor(pos.y + PLAYER_HEIGHT - 0.001);
  const minZ = Math.floor(pos.z - PLAYER_HALF);
  const maxZ = Math.floor(pos.z + PLAYER_HALF - 0.001);
  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        if (isSolid(world.getBlock(x, y, z))) return true;
      }
    }
  }
  return false;
}

function moveAxis(axis, delta) {
  if (!delta) return false;
  player.pos[axis] += delta;
  if (!collides(player.pos)) return false;
  if (axis === 'x') {
    if (delta > 0) player.pos.x = Math.floor(player.pos.x + PLAYER_HALF) - PLAYER_HALF - 0.001;
    else player.pos.x = Math.ceil(player.pos.x - PLAYER_HALF) + PLAYER_HALF + 0.001;
  } else if (axis === 'z') {
    if (delta > 0) player.pos.z = Math.floor(player.pos.z + PLAYER_HALF) - PLAYER_HALF - 0.001;
    else player.pos.z = Math.ceil(player.pos.z - PLAYER_HALF) + PLAYER_HALF + 0.001;
  } else if (delta > 0) {
    player.pos.y = Math.floor(player.pos.y + PLAYER_HEIGHT) - PLAYER_HEIGHT - 0.001;
  } else {
    player.pos.y = Math.floor(player.pos.y) + 1.001;
  }
  // If still stuck (corners), nudge toward the nearest free spot.
  if (collides(player.pos) && axis !== 'y') {
    player.pos[axis] += delta > 0 ? -0.002 : 0.002;
  }
  return true;
}

function isInWater() {
  const fx = Math.floor(player.pos.x);
  const fz = Math.floor(player.pos.z);
  return isLiquid(world.getBlock(fx, Math.floor(player.pos.y + 0.25), fz))
    || isLiquid(world.getBlock(fx, Math.floor(player.pos.y + 1.2), fz));
}

const keys = new Set();
let jumpHeld = false;
let jumpQueued = false;
let miningHeld = false;
let mineTimer = 0;
let mineCooldown = 0;
const joy = { x: 0, y: 0, active: false };

function updatePlayer(dt) {
  const wasWater = player.inWater;
  player.inWater = isInWater();
  if (player.inWater && !wasWater) { audio.splash(); spawnParticles(player.pos.x, player.pos.y + 0.6, player.pos.z, 0xa8dcff, 9); }

  let ix = 0;
  let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  ix += joy.x;
  iz += -joy.y;
  const mag = Math.hypot(ix, iz);
  if (mag > 1) { ix /= mag; iz /= mag; }

  const speed = player.inWater ? 2.8 : (keys.has('ShiftLeft') && !isTouch ? 6.1 : 4.55);
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  const wishX = (ix * cos - iz * sin) * speed;
  const wishZ = (-ix * sin - iz * cos) * speed;
  const accel = player.onGround || player.inWater ? 13 : 5.5;
  player.vel.x = lerp(player.vel.x, wishX, 1 - Math.exp(-accel * dt));
  player.vel.z = lerp(player.vel.z, wishZ, 1 - Math.exp(-accel * dt));

  if (jumpQueued) {
    if (player.onGround) { player.vel.y = 8.1; player.onGround = false; audio.jump(); }
    else if (player.inWater) { player.vel.y = 4.2; audio.jump(); }
    jumpQueued = false;
  } else if (jumpHeld && player.inWater) {
    player.vel.y = Math.min(player.vel.y + 18 * dt, 4.1);
  }
  if (jumpHeld && player.onGround && !player.inWater) {
    player.vel.y = 8.1;
    player.onGround = false;
    audio.jump();
  }

  const gravity = player.inWater ? 7.5 : 25;
  player.vel.y -= gravity * dt;
  if (player.inWater) player.vel.y = Math.max(player.vel.y, -4.5);
  else player.vel.y = Math.max(player.vel.y, -29);

  player.onGround = false;
  moveAxis('x', player.vel.x * dt);
  moveAxis('z', player.vel.z * dt);
  const collidedY = moveAxis('y', player.vel.y * dt);
  if (collidedY) {
    if (player.vel.y < 0) {
      player.onGround = true;
      if (player.vel.y < -8) { audio.land(); spawnParticles(player.pos.x, player.pos.y + 0.1, player.pos.z, 0xcfc29b, 4); }
    }
    player.vel.y = 0;
  }
  if (player.pos.y < 0.2) { player.pos.y = 0.2; player.vel.y = 0; player.onGround = true; }

  // Keep players on the island's footprint.
  player.pos.x = clamp(player.pos.x, PLAYER_HALF + 0.01, SX - PLAYER_HALF - 0.01);
  player.pos.z = clamp(player.pos.z, PLAYER_HALF + 0.01, SZ - PLAYER_HALF - 0.01);

  const moving = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && moving > 0.5) {
    player.walkPhase += dt * moving * 2.1;
    player.stepDistance += moving * dt;
    if (player.stepDistance > 2.4) {
      player.stepDistance = 0;
      const below = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.1), Math.floor(player.pos.z));
      if (below !== BLOCK.AIR) audio.step(below);
    }
  } else {
    player.walkPhase = lerp(player.walkPhase, 0, dt * 6);
  }
  const bobAmount = player.onGround && moving > 0.5 ? 1 : 0;
  handSway.x = lerp(handSway.x, Math.sin(player.walkPhase) * 0.018 * bobAmount, dt * 8);
  handSway.y = lerp(handSway.y, Math.abs(Math.cos(player.walkPhase)) * 0.014 * bobAmount, dt * 8);
  waterTint.style.opacity = isLiquid(world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y + EYE_HEIGHT), Math.floor(player.pos.z))) ? '1' : '0';
  if (player.pos.y > 30) updateGoal(true);
}

// ---------------------------------------------------------------------------
// Ray casting, mining and building
// ---------------------------------------------------------------------------
const tmpDir = new THREE.Vector3();
function raycastBlock(maxDist = REACH) {
  const ox = player.pos.x;
  const oy = player.pos.y + EYE_HEIGHT;
  const oz = player.pos.z;
  const cp = Math.cos(player.pitch);
  const dx = -Math.sin(player.yaw) * cp;
  const dy = Math.sin(player.pitch);
  const dz = -Math.cos(player.yaw) * cp;
  tmpDir.set(dx, dy, dz);

  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? (x + 1 - ox) / dx : (ox - x) / -dx);
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? (y + 1 - oy) / dy : (oy - y) / -dy);
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? (z + 1 - oz) / dz : (oz - z) / -dz);
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let t = 0;
  for (let i = 0; i < 80; i++) {
    const id = world.getBlock(x, y, z);
    if (id !== BLOCK.AIR && id !== BLOCK.WATER && t <= maxDist) {
      return { x, y, z, nx, ny, nz, id, dist: t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
    }
    if (t > maxDist + 2) break;
  }
  return null;
}

function updateTarget() {
  const hit = raycastBlock();
  if (hit) {
    outline.visible = true;
    outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    outline.material.color.setHex(miningHeld ? 0xffd45e : 0xffffff);
    outline.material.opacity = miningHeld ? 0.9 : 0.5;
  } else {
    outline.visible = false;
  }
  crosshair.classList.toggle('mining', miningHeld && !!hit);
  return hit;
}

function breakBlock(hit) {
  const id = world.getBlock(hit.x, hit.y, hit.z);
  if (!id || id === BLOCK.WATER || id === BLOCK.BEDROCK || !BLOCKS[id]?.breakable) return false;
  world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
  stats.mined++;
  if (id === BLOCK.LOG) stats.logs++;
  audio.mine(id);
  const c = BLOCKS[id].color;
  spawnParticles(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, c, 9);
  outline.visible = false;
  swing();
  updateGoal(true);
  scheduleSave();
  return true;
}

function placeBlock() {
  const hit = raycastBlock();
  if (!hit) { toast('Aim at a block to build', false, 1000); return false; }
  const x = hit.x + hit.nx;
  const y = hit.y + hit.ny;
  const z = hit.z + hit.nz;
  if (y < 0 || y >= SY || x < 0 || x >= SX || z < 0 || z >= SZ) return false;
  const current = world.getBlock(x, y, z);
  if (current !== BLOCK.AIR && !isLiquid(current) && !isCross(current)) return false;
  if (boxIntersectsPlayer(x, y, z)) { toast('Too close — step back', false, 1100); return false; }
  const id = hotbarIds[activeSlot];
  world.setBlock(x, y, z, id);
  stats.placed++;
  if (id === BLOCK.GLASS) stats.glassPlaced++;
  spawnParticles(x + 0.5, y + 0.3, z + 0.5, BLOCKS[id].color, 4);
  audio.place(id);
  swing();
  updateGoal(true);
  scheduleSave();
  return true;
}

function updateMining(dt) {
  if (mineCooldown > 0) mineCooldown -= dt;
  const hit = updateTarget();
  if (!miningHeld || state !== 'playing') { mineTimer = 0; return; }
  if (!hit) { mineTimer = 0; return; }
  if (hit.id === BLOCK.BEDROCK) { mineTimer = 0; return; }
  mineTimer += dt;
  if (mineTimer < 0.25) return;
  if (mineCooldown > 0) return;
  if (breakBlock(hit)) {
    mineTimer = 0;
    mineCooldown = 0.12;
    swing();
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const isDesktop = !isTouch;
let wantPointerLock = false;

function requestLock() {
  if (!isDesktop || !canvas.requestPointerLock) return;
  if (state !== 'playing') return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked && isDesktop && state === 'playing' && wantPointerLock) {
    wantPointerLock = false;
    openPause();
  } else if (locked) {
    wantPointerLock = true;
  }
});

function play() {
  audio.unlock();
  audio.setEnabled(localStorage.getItem('blockisle.sound') !== 'off');
  state = 'playing';
  startScreen.classList.add('hidden');
  loading.classList.add('hidden');
  hud.classList.remove('hidden');
  if (isTouch) touchControls.classList.remove('hidden');
  hand.visible = !isTouch;
  camera.fov = isTouch ? 76 : 73;
  camera.updateProjectionMatrix();
  syncCamera();
  selectSlot(activeSlot);
  toast(isTouch ? 'Hold MINE to dig · Pick a block and tap PLACE' : 'Hold left-click to dig · Right-click to place', false, 2600);
  if (isDesktop) {
    wantPointerLock = true;
    requestLock();
  }
  updateGoal();
  scheduleSave();
}

el('playBtn').addEventListener('click', play);

function openPause() {
  if (state === 'palette' || state === 'help') return;
  state = 'paused';
  pauseScreen.classList.remove('hidden');
  miningHeld = false;
  jumpHeld = false;
  joy.active = false;
  joy.x = 0; joy.y = 0;
  el('statMined').textContent = stats.mined;
  el('statPlaced').textContent = stats.placed;
  el('statPigs').textContent = pigs.count;
  seedLabel.textContent = String(world.seed);
  el('newWorldBtn').classList.remove('confirm');
  el('newWorldBtn').textContent = 'NEW ISLAND';
  el('pauseNote').textContent = '';
  if (document.pointerLockElement === canvas) {
    wantPointerLock = false;
    document.exitPointerLock();
  }
  saveGame();
}

function resume() {
  pauseScreen.classList.add('hidden');
  state = 'playing';
  joy.active = false;
  if (isDesktop) {
    wantPointerLock = true;
    requestLock();
  }
}

function closePause() {
  pauseScreen.classList.add('hidden');
  state = 'playing';
}

el('menuBtn').addEventListener('click', () => {
  if (state === 'playing') openPause();
});
el('resumeBtn').addEventListener('click', resume);

let newWorldConfirm = false;
let newWorldTimer = 0;
let noSave = false;
el('newWorldBtn').addEventListener('click', () => {
  const btn = el('newWorldBtn');
  if (!newWorldConfirm) {
    newWorldConfirm = true;
    btn.classList.add('confirm');
    btn.textContent = 'TAP AGAIN TO WIPE';
    el('pauseNote').textContent = 'This permanently deletes your island.';
    clearTimeout(newWorldTimer);
    newWorldTimer = setTimeout(() => {
      newWorldConfirm = false;
      btn.classList.remove('confirm');
      btn.textContent = 'NEW ISLAND';
      el('pauseNote').textContent = '';
    }, 3200);
    return;
  }
  noSave = true;
  localStorage.removeItem(SAVE_KEY);
  localStorage.setItem(PENDING_SEED_KEY, String(100000 + Math.floor(Math.random() * 890000)));
  el('fade').classList.add('on');
  setTimeout(() => window.location.reload(), 320);
});

function openHelp() {
  if (state === 'paused') {
    pauseScreen.classList.add('hidden');
    helpScreen.classList.remove('hidden');
    state = 'help';
    helpScreen.dataset.return = 'pause';
  }
}
function closeHelp() {
  helpScreen.classList.add('hidden');
  if (helpScreen.dataset.return === 'pause') {
    state = 'paused';
    pauseScreen.classList.remove('hidden');
  } else {
    resume();
  }
}
el('helpBtn').addEventListener('click', () => {
  if (state === 'playing') {
    openPause();
    openHelp();
  }
});
el('pauseHelpBtn').addEventListener('click', openHelp);
el('helpClose').addEventListener('click', closeHelp);

let paletteReturn = 'playing';
function openPalette() {
  paletteReturn = state === 'paused' ? 'paused' : 'playing';
  if (paletteReturn === 'paused') pauseScreen.classList.add('hidden');
  if (document.pointerLockElement === canvas) {
    wantPointerLock = false;
    document.exitPointerLock();
  }
  miningHeld = false;
  state = 'palette';
  renderPalette();
  paletteScreen.classList.remove('hidden');
}
function closePalette() {
  paletteScreen.classList.add('hidden');
  if (paletteReturn === 'paused') {
    state = 'paused';
    pauseScreen.classList.remove('hidden');
  } else {
    state = 'playing';
    if (isDesktop) { wantPointerLock = true; requestLock(); }
  }
}
el('paletteBtn').addEventListener('click', openPalette);
el('pausePaletteBtn').addEventListener('click', openPalette);
el('paletteClose').addEventListener('click', closePalette);

soundBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setEnabled(!audio.enabled);
  localStorage.setItem('blockisle.sound', audio.enabled ? 'on' : 'off');
  updateSoundButton();
  if (audio.enabled) audio.click();
});
updateSoundButton();

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (state === 'playing') openPause();
    else if (state === 'palette') closePalette();
    else if (state === 'help') closeHelp();
    else if (state === 'paused') resume();
    return;
  }
  if (state === 'palette' || state === 'help') return;
  if (e.code === 'KeyE') {
    if (state === 'playing' || state === 'paused') openPalette();
    return;
  }
  if (e.code === 'KeyM') {
    soundBtn.click();
    return;
  }
  if (state === 'playing' || state === 'menu' || state === 'paused') {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'Space'].includes(e.code)) {
      e.preventDefault();
      if (e.code === 'Space') {
        if (state === 'playing') { jumpQueued = true; jumpHeld = true; }
      } else keys.add(e.code);
    }
    if (e.code.startsWith('Digit')) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) selectSlot(n - 1);
    }
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') jumpHeld = false;
  if (e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') keys.delete(e.code);
});
window.addEventListener('blur', () => {
  keys.clear();
  jumpHeld = false;
  miningHeld = false;
  joy.active = false;
  joy.x = 0; joy.y = 0;
});

// Touch joystick ------------------------------------------------------------
const joystick = el('joystick');
const joystickBase = el('joystickBase');
const joystickKnob = el('joystickKnob');
let joyPointer = null;
function setJoyFromEvent(e) {
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const max = rect.width * 0.29;
  let dx = e.clientX - cx;
  let dy = e.clientY - cy;
  const d = Math.hypot(dx, dy);
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  joy.x = dx / max;
  joy.y = dy / max;
  if (Math.hypot(joy.x, joy.y) < 0.14) { joy.x = 0; joy.y = 0; }
  joy.active = true;
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}
joystick.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  joyPointer = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  joystick.classList.add('active');
  setJoyFromEvent(e);
});
joystick.addEventListener('pointermove', (e) => {
  if (e.pointerId !== joyPointer) return;
  e.preventDefault();
  setJoyFromEvent(e);
});
function releaseJoystick(e) {
  if (e.pointerId !== joyPointer) return;
  joyPointer = null;
  joy.active = false;
  joy.x = 0; joy.y = 0;
  joystick.classList.remove('active');
  joystickKnob.style.transform = 'translate(0px, 0px)';
}
joystick.addEventListener('pointerup', releaseJoystick);
joystick.addEventListener('pointercancel', releaseJoystick);
joystick.addEventListener('lostpointercapture', releaseJoystick);

// Touch actions -------------------------------------------------------------
const jumpBtn = el('jumpBtn');
const mineBtn = el('mineBtn');
const placeBtn = el('placeBtn');

function pressMine(on) {
  miningHeld = on;
  mineBtn.classList.toggle('pressed', on);
  if (!on) { mineTimer = 0; crosshair.classList.remove('mining'); }
}
mineBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  mineBtn.setPointerCapture(e.pointerId);
  pressMine(true);
});
mineBtn.addEventListener('pointerup', (e) => { e.preventDefault(); pressMine(false); });
mineBtn.addEventListener('pointercancel', () => pressMine(false));
mineBtn.addEventListener('lostpointercapture', () => pressMine(false));

placeBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (state === 'playing') placeBlock();
});
jumpBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  jumpHeld = true;
  jumpQueued = true;
  jumpBtn.classList.add('pressed');
});
function releaseJump() { jumpHeld = false; jumpBtn.classList.remove('pressed'); }
jumpBtn.addEventListener('pointerup', releaseJump);
jumpBtn.addEventListener('pointercancel', releaseJump);
jumpBtn.addEventListener('lostpointercapture', releaseJump);

// Touch look ----------------------------------------------------------------
let lookPointer = null;
let lookX = 0;
let lookY = 0;
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'playing' || e.pointerType === 'mouse') return;
  e.preventDefault();
  lookPointer = e.pointerId;
  lookX = e.clientX;
  lookY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookPointer) return;
  const dx = e.clientX - lookX;
  const dy = e.clientY - lookY;
  lookX = e.clientX;
  lookY = e.clientY;
  player.yaw -= dx * 0.0048;
  player.pitch = clamp(player.pitch - dy * 0.0048, -1.53, 1.53);
});
function endLook(e) { if (e.pointerId === lookPointer) lookPointer = null; }
canvas.addEventListener('pointerup', endLook);
canvas.addEventListener('pointercancel', endLook);
canvas.addEventListener('lostpointercapture', endLook);

// Mouse look / mine ---------------------------------------------------------
let draggingMouse = false;
let lastMouseX = 0;
let lastMouseY = 0;
const locked = () => document.pointerLockElement === canvas;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') return;
  if (!locked()) {
    draggingMouse = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (isDesktop) {
      wantPointerLock = true;
      requestLock();
    }
    return;
  }
  if (e.button === 0) pressMine(true);
  else if (e.button === 2) placeBlock();
});
canvas.addEventListener('mousemove', (e) => {
  if (state !== 'playing') return;
  if (locked()) {
    player.yaw -= e.movementX * 0.0023;
    player.pitch = clamp(player.pitch - e.movementY * 0.0023, -1.53, 1.53);
  } else if (draggingMouse) {
    player.yaw -= (e.clientX - lastMouseX) * 0.0045;
    player.pitch = clamp(player.pitch - (e.clientY - lastMouseY) * 0.0045, -1.53, 1.53);
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    draggingMouse = false;
    if (state === 'playing') pressMine(false);
  }
});
canvas.addEventListener('wheel', (e) => {
  if (state !== 'playing') return;
  e.preventDefault();
  cycleSlot(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------
let saveTimer = 0;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveGame, 700);
}
function saveGame() {
  if (noSave || state === 'loading' || state === 'menu') return;
  try {
    const payload = {
      seed: world.seed,
      edits: Array.from(world.edits.entries()),
      player: {
        x: player.pos.x, y: player.pos.y, z: player.pos.z,
        yaw: player.yaw, pitch: player.pitch,
      },
      stats,
      timeOfDay,
      hotbar: hotbarIds,
      activeSlot,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    localStorage.removeItem(PENDING_SEED_KEY);
  } catch {}
}
setInterval(() => {
  if (state === 'playing' || state === 'paused') saveGame();
}, 6000);
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

// ---------------------------------------------------------------------------
// HUD / time
// ---------------------------------------------------------------------------
let lastClock = -1;
function updateHud() {
  const totalMinutes = Math.floor((timeOfDay * 24 * 60) % (24 * 60));
  if (totalMinutes !== lastClock) {
    lastClock = totalMinutes;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    clockLabel.textContent = `${hh}:${mm}`;
  }
  dayLabel.textContent = `DAY ${stats.day}`;
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
let last = performance.now();
let elapsed = 0;
let hudTick = 0;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  elapsed += dt;
  const playing = state === 'playing';

  if (playing) {
    updatePlayer(dt);
    updateMining(dt);
    syncCamera();
    const previousTime = timeOfDay;
    timeOfDay = (timeOfDay + dt / DAY_SECONDS) % 1;
    if (timeOfDay < previousTime) {
      stats.day++;
      toast(`DAY ${stats.day} — a fresh morning`, true, 2200);
      scheduleSave();
    }
  } else if (state === 'menu') {
    updateMenuCamera(dt);
  } else {
    updateTarget();
  }

  const skyInfo = sky.update(timeOfDay, camera, playing ? dt : 0);
  world.setTint(skyInfo.light, skyInfo.daylight < 0.2);
  oceanMaterial.color.copy(world.tint).multiply(new THREE.Color(0.95, 1.0, 1.03));
  const fogColor = skyInfo.horizon.clone().lerp(new THREE.Color(0x8fb8d8), 0.25);
  scene.fog.color.copy(fogColor);
  const menuView = state === 'menu';
  scene.fog.near = menuView ? 80 : 46;
  scene.fog.far = menuView ? 235 : 160;
  renderer.setClearColor(fogColor, 1);

  hemiLight.intensity = 0.35 + 0.95 * skyInfo.daylight;
  hemiLight.color.copy(new THREE.Color(0xdfefff).lerp(new THREE.Color(0x94a7d8), 1 - skyInfo.daylight));
  sunLight.intensity = 0.15 + 0.9 * skyInfo.daylight;
  sunLight.color.copy(new THREE.Color(0xffc58f).lerp(new THREE.Color(0xfff3d4), skyInfo.daylight));
  sunLight.position.copy(sky.sunDir).multiplyScalar(80);
  armMaterial.color.copy(ARM_BASE).multiply(world.tint);
  armMaterialDark.color.copy(ARM_DARK).multiply(world.tint);

  pigs.update(playing || state === 'menu' ? dt : 0, skyInfo.daylight);

  if (state === 'menu' || state === 'loading' || isTouch) hand.visible = false;
  if (handMesh) {
    if (swingTime > 0) swingTime = Math.max(0, swingTime - dt);
    const t = 1 - swingTime / SWING_LENGTH;
    const arc = swingTime > 0 ? Math.sin(t * Math.PI) : 0;
    handMesh.position.set(
      HAND_BASE.x - arc * 0.14 + handSway.x,
      HAND_BASE.y + arc * 0.08 + handSway.y,
      HAND_BASE.z + arc * 0.1,
    );
    handMesh.rotation.set(
      HAND_ROT.x - arc * 0.95,
      HAND_ROT.y + arc * 0.22,
      HAND_ROT.z - arc * 0.18,
    );
  }

  updateParticles(dt);
  world.flushDirty(3);
  updateHud();
  hudTick += dt;
  if (hudTick > 1) {
    hudTick = 0;
    if (playing) updateGoal(false);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Resize and boot
// ---------------------------------------------------------------------------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

// Decorative floating blocks on the title screen.
const titleBlocks = el('titleBlocks');
const decorations = [
  [BLOCK.GRASS, '78%', '12%', '0s'],
  [BLOCK.LOG, '90%', '43%', '1.2s'],
  [BLOCK.GLASS, '68%', '64%', '2.1s'],
  [BLOCK.BRICK, '92%', '74%', '0.8s'],
  [BLOCK.PLANKS, '88%', '4%', '1.7s'],
];
for (const [id, left, top, delay] of decorations) {
  const img = document.createElement('img');
  img.src = iconFor(id);
  img.alt = '';
  img.style.left = left;
  img.style.top = top;
  img.style.animationDelay = delay;
  titleBlocks.appendChild(img);
}

renderHotbar();
selectSlot(activeSlot);
updateGoal();
updateHud();
requestAnimationFrame(frame);

// Small debug hook: useful for automated acceptance checks and curious tinkerers.
window.__BLOCK_ISLE__ = {
  get state() { return state; },
  get player() { return player; },
  get stats() { return stats; },
  get target() { return raycastBlock(); },
  world,
  spawn,
  breakBlock,
  placeBlock,
  setLook(yaw, pitch) { player.yaw = yaw; player.pitch = pitch; syncCamera(); },
  setTime(t) { timeOfDay = ((t % 1) + 1) % 1; },
  teleport(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); syncCamera(); },
  renderInfo() { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, points: renderer.info.render.points }; },
  updateGoal,
  selectSlot,
  play,
  openPause,
  saveGame,
};
