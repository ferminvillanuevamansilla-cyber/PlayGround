// Little blocky pigs that wander around the island.
import * as THREE from 'three';
import { BLOCK } from './blocks.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PINK = 0xeaa5a1;
const PINK_DARK = 0xd88784;
const SNOUT = 0xc87372;
const HOOF = 0x9c5d5a;

function box(w, h, d, color, x, y, z, mats) {
  const material = mats[color] || (mats[color] = new THREE.MeshLambertMaterial({ color }));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

export class PigManager {
  constructor(scene, world, spawn) {
    this.scene = scene;
    this.world = world;
    this.pigs = [];
    this.materials = {};
    this.baseColors = new Map();
    const rand = mulberry32(world.seed + 777);
    const positions = [];
    for (let tries = 0; tries < 400 && positions.length < 5; tries++) {
      const angle = rand() * Math.PI * 2;
      const dist = 8 + rand() * 25;
      const x = spawn.x + Math.cos(angle) * dist;
      const z = spawn.z + Math.sin(angle) * dist;
      if (x < 12 || x > 116 || z < 12 || z > 116) continue;
      const y = world.topSolidY(Math.floor(x), Math.floor(z));
      const top = world.getBlock(Math.floor(x), y - 1, Math.floor(z));
      if (top === BLOCK.GRASS && y > 13) positions.push({ x, z, y });
    }
    for (let i = 0; i < Math.max(3, positions.length); i++) {
      const p = positions[i % Math.max(1, positions.length)] || { x: spawn.x + 6, z: spawn.z, y: spawn.y };
      this.createPig(p.x + (rand() - 0.5) * 2, p.z + (rand() - 0.5) * 2, p.y, rand);
    }
  }

  createPig(x, z, y, rand) {
    const root = new THREE.Group();
    const mats = this.materials;
    const body = box(0.82, 0.58, 1.2, PINK, 0, 0.62, 0, mats);
    root.add(body);
    const head = box(0.58, 0.52, 0.48, PINK, 0, 0.78, 0.78, mats);
    root.add(head);
    root.add(box(0.3, 0.2, 0.16, SNOUT, 0, 0.69, 1.03, mats));
    root.add(box(0.1, 0.13, 0.08, PINK_DARK, -0.18, 1.04, 0.7, mats));
    root.add(box(0.1, 0.13, 0.08, PINK_DARK, 0.18, 1.04, 0.7, mats));
    const eyeL = box(0.07, 0.07, 0.04, 0x211516, -0.16, 0.84, 1.015, mats);
    const eyeR = box(0.07, 0.07, 0.04, 0x211516, 0.16, 0.84, 1.015, mats);
    root.add(eyeL, eyeR);
    root.add(box(0.07, 0.07, 0.12, PINK_DARK, 0, 0.63, -0.66, mats));

    const legs = [];
    for (const [lx, lz] of [[-0.27, 0.39], [0.27, 0.39], [-0.27, -0.39], [0.27, -0.39]]) {
      const pivot = new THREE.Group();
      pivot.position.set(lx, 0.45, lz);
      pivot.add(box(0.2, 0.43, 0.2, HOOF, 0, -0.21, 0, mats));
      root.add(pivot);
      legs.push(pivot);
    }
    root.scale.setScalar(1.12);
    root.position.set(x, y, z);
    root.rotation.y = rand() * Math.PI * 2;
    this.scene.add(root);
    this.pigs.push({
      root, head, legs,
      x, z, y,
      angle: rand() * Math.PI * 2,
      targetAngle: rand() * Math.PI * 2,
      timer: 1 + rand() * 3,
      speed: 0.55 + rand() * 0.4,
      phase: rand() * 10,
      moving: true,
    });
  }

  update(dt, daylight) {
    const tint = 0.36 + 0.64 * daylight;
    for (const [color, mat] of Object.entries(this.materials)) {
      const base = new THREE.Color(Number(color));
      mat.color.copy(base).multiplyScalar(0.75 + 0.25 * tint).lerp(new THREE.Color(0x233052), (1 - daylight) * 0.28);
    }
    for (const pig of this.pigs) {
      pig.timer -= dt;
      if (pig.timer <= 0) {
        pig.timer = 2 + Math.random() * 5;
        pig.targetAngle = pig.angle + (Math.random() - 0.5) * Math.PI * 1.6;
        pig.moving = Math.random() > 0.25;
      }
      let diff = ((pig.targetAngle - pig.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      pig.angle += diff * Math.min(1, dt * 2.5);
      let moved = false;
      if (pig.moving) {
        const nx = pig.x + Math.sin(pig.angle) * pig.speed * dt;
        const nz = pig.z + Math.cos(pig.angle) * pig.speed * dt;
        if (nx > 10 && nx < 118 && nz > 10 && nz < 118) {
          const topY = this.world.topSolidY(Math.floor(nx), Math.floor(nz));
          const top = this.world.getBlock(Math.floor(nx), topY - 1, Math.floor(nz));
          if ((top === BLOCK.GRASS || top === BLOCK.SAND || top === BLOCK.SNOW) && Math.abs(topY - pig.y) < 1.1) {
            pig.x = nx;
            pig.z = nz;
            pig.y = topY;
            moved = true;
          } else {
            pig.targetAngle = pig.angle + Math.PI * (0.6 + Math.random() * 0.8);
          }
        } else {
          pig.targetAngle = pig.angle + Math.PI;
        }
      }
      pig.phase += dt * (moved ? 8 : 0);
      const swing = moved ? Math.sin(pig.phase) * 0.55 : 0;
      pig.legs[0].rotation.x = swing;
      pig.legs[1].rotation.x = -swing;
      pig.legs[2].rotation.x = -swing;
      pig.legs[3].rotation.x = swing;
      pig.head.rotation.x = moved ? Math.sin(pig.phase * 0.5) * 0.06 : 0;
      pig.root.position.set(pig.x, pig.y + (moved ? Math.abs(Math.sin(pig.phase)) * 0.03 : 0), pig.z);
      pig.root.rotation.y = pig.angle;
    }
  }

  get count() { return this.pigs.length; }
}
