// Procedural voxel island: terrain generation, chunk meshing and world editing.
import * as THREE from 'three';
import {
  BLOCK, BLOCKS, TILE_UV, createAtlas, isOpaque, isCross, isLiquid,
} from './blocks.js';

export const SX = 128;
export const SZ = 128;
export const SY = 48;
export const SEA = 13;
export const CHUNK = 16;
export const CHUNKS_X = SX / CHUNK;
export const CHUNKS_Z = SZ / CHUNK;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (n) => n - Math.floor(n);

function hash2(x, z, seed) {
  return fract(Math.sin(x * 127.1 + z * 311.7 + seed * 0.0137) * 43758.5453123);
}

function valueNoise(x, z, seed) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function fbm(x, z, seed, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fz = z;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fz, seed + i * 131) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fz *= 2.01;
  }
  return sum / norm;
}

// Face geometry definitions. (u x v) points out of the block.
const FACES = [
  { n: [1, 0, 0], base: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0], shade: 0.79, tile: 'side' },
  { n: [-1, 0, 0], base: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], shade: 0.72, tile: 'side' },
  { n: [0, 1, 0], base: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1], shade: 1.0, tile: 'top' },
  { n: [0, -1, 0], base: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], shade: 0.52, tile: 'bottom' },
  { n: [0, 0, 1], base: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], shade: 0.88, tile: 'side' },
  { n: [0, 0, -1], base: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], shade: 0.82, tile: 'side' },
];
const FACE_UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_LEVELS = [0.48, 0.66, 0.83, 1.0];

class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  quad(points, normal, uv, colors) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(points[i][0], points[i][1], points[i][2]);
      this.nrm.push(normal[0], normal[1], normal[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(colors[i], colors[i], colors[i]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export class VoxelWorld {
  constructor(seed = 123456) {
    this.seed = seed | 0;
    this.data = new Uint8Array(SX * SY * SZ);
    this.heights = new Uint8Array(SX * SZ);
    this.edits = new Map();
    this.chunks = new Map();
    this.dirty = new Set();
    this.group = new THREE.Group();
    this.group.name = 'island';
    this.atlas = createAtlas();
    this.materials = {
      opaque: new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true }),
      cutout: new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.45 }),
      flower: new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide }),
      glass: new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false }),
      water: new THREE.MeshBasicMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
    };
    this.materials.glass.color.setHex(0xffffff);
    this.materials.water.color.setHex(0xd8ecff);
    this.tint = new THREE.Color(1, 1, 1);
    this.generate();
  }

  index(x, y, z) {
    return x + SX * (z + SZ * y);
  }

  inBounds(x, y, z) {
    return x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ;
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[this.index(x, y, z)];
  }

  setBlock(x, y, z, id, record = true) {
    if (!this.inBounds(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.data[i] === id) return false;
    this.data[i] = id;
    if (record) this.edits.set(i, id);
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    this.markChunkDirty(cx, cz);
    if (x % CHUNK === 0) this.markChunkDirty(cx - 1, cz);
    if (x % CHUNK === CHUNK - 1) this.markChunkDirty(cx + 1, cz);
    if (z % CHUNK === 0) this.markChunkDirty(cx, cz - 1);
    if (z % CHUNK === CHUNK - 1) this.markChunkDirty(cx, cz + 1);
    return true;
  }

  markChunkDirty(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    this.dirty.add(`${cx},${cz}`);
  }

  columnHeight(x, z) {
    if (x < 0 || x >= SX || z < 0 || z >= SZ) return 0;
    return this.heights[x + z * SX];
  }

  findSpawn() {
    const cx = SX / 2;
    const cz = SZ / 2;
    let best = null;
    for (let r = 0; r <= 26; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (const dz of [-r, r]) {
          const x = Math.floor(cx + dx);
          const z = Math.floor(cz + dz);
          const h = this.columnHeight(x, z);
          const top = this.getBlock(x, h, z);
          if ((top === BLOCK.GRASS || top === BLOCK.SAND) && h > SEA + 1) {
            best = { x: x + 0.5, z: z + 0.5, y: h + 1.01, h };
            if (r < 2) return best;
          }
        }
      }
      if (best) return best;
      for (let dz = -r + 1; dz < r; dz++) {
        for (const dx of [-r, r]) {
          const x = Math.floor(cx + dx);
          const z = Math.floor(cz + dz);
          const h = this.columnHeight(x, z);
          const top = this.getBlock(x, h, z);
          if ((top === BLOCK.GRASS || top === BLOCK.SAND) && h > SEA + 1) {
            best = { x: x + 0.5, z: z + 0.5, y: h + 1.01, h };
          }
        }
      }
      if (best) return best;
    }
    return best || { x: cx + 0.5, z: cz + 0.5, y: SEA + 5, h: SEA + 4 };
  }

  generate() {
    const seed = this.seed;
    const heights = new Int16Array(SX * SZ);
    const moisture = new Float32Array(SX * SZ);
    const temp = new Float32Array(SX * SZ);
    const radius = SX / 2 - 3;

    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const nx = (x - SX / 2) / radius;
        const nz = (z - SZ / 2) / radius;
        const dist = Math.sqrt(nx * nx + nz * nz) * radius;
        const island = 1 - smoothstep(37, 61, dist);
        const base = 15.5
          + fbm(x * 0.024, z * 0.024, seed, 4) * 12.5
          + fbm(x * 0.065, z * 0.065, seed + 17, 3) * 4.2
          + fbm(x * 0.011 + 31, z * 0.011 + 9, seed + 51, 2) * 7.0;
        const ridge = Math.max(0, fbm(x * 0.014 + 77, z * 0.014 + 21, seed + 99, 3) - 0.53);
        const mountain = ridge * 36 * smoothstep(0.3, 0.7, fbm(x * 0.009, z * 0.009, seed + 200, 2));
        let h = base + mountain;
        h = (SEA - 7) + (h - (SEA - 7)) * island;
        // Small sandy coves around the shoreline.
        if (h > SEA - 1 && h < SEA + 2.5 && hash2(x, z, seed + 7) > 0.55) h = SEA + 1;
        heights[x + z * SX] = Math.round(clamp(h, 2, SY - 9));
        moisture[x + z * SX] = fbm(x * 0.021 + 40, z * 0.021 + 80, seed + 303, 3);
        temp[x + z * SX] = fbm(x * 0.018 + 100, z * 0.018 + 55, seed + 404, 3);
      }
    }

    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const h = heights[x + z * SX];
        this.heights[x + z * SX] = h;
        const slope = Math.max(
          Math.abs(h - heights[Math.max(0, x - 1) + z * SX]),
          Math.abs(h - heights[Math.min(SX - 1, x + 1) + z * SX]),
          Math.abs(h - heights[x + Math.max(0, z - 1) * SX]),
          Math.abs(h - heights[x + Math.min(SZ - 1, z + 1) * SX]),
        );
        const moist = moisture[x + z * SX];
        const tempv = temp[x + z * SX];
        let top = BLOCK.GRASS;
        if (h <= SEA + 1) top = BLOCK.SAND;
        else if (h >= 34 || (tempv < 0.22 && h > SEA + 5)) top = BLOCK.SNOW;
        else if (moist < 0.34 && h < 24) top = BLOCK.SAND;
        else if (slope >= 4 && h > 24) top = BLOCK.STONE;

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y === h) id = top;
          else if (y >= h - 3) id = (top === BLOCK.SAND) ? BLOCK.SAND : (top === BLOCK.SNOW ? BLOCK.SNOW : (top === BLOCK.STONE ? BLOCK.STONE : BLOCK.DIRT));
          else id = BLOCK.STONE;
          this.data[this.index(x, y, z)] = id;
        }
        for (let y = h + 1; y <= SEA; y++) {
          this.data[this.index(x, y, z)] = BLOCK.WATER;
        }
        // A few glowing stone pockets deep underground to make mining rewarding.
        if (h > 22 && hash2(x * 3.1, z * 2.7, seed + 91) > 0.994) {
          const oy = 3 + ((hash2(x, z, seed + 5) * (h - 6)) | 0);
          this.data[this.index(x, oy, z)] = BLOCK.GLOWSTONE;
        }
      }
    }

    // Trees -----------------------------------------------------------------
    let rngState = (seed ^ 0x9e3779b9) >>> 0;
    const rand = () => {
      rngState |= 0;
      rngState = (rngState + 0x6D2B79F5) | 0;
      let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let z = 3; z < SZ - 3; z++) {
      for (let x = 3; x < SX - 3; x++) {
        const h = heights[x + z * SX];
        if (h <= SEA + 1 || h > 29) continue;
        const top = this.data[this.index(x, h, z)];
        if (top !== BLOCK.GRASS) continue;
        const moist = moisture[x + z * SX];
        const chance = moist > 0.52 ? 0.024 : 0.005;
        if (rand() > chance) continue;
        const dx = x - SX / 2;
        const dz = z - SZ / 2;
        // Keep a sunny meadow around the spawn so the first view is open.
        if (dx * dx + dz * dz < 150) continue;
        if (this.getBlock(x, h + 1, z) !== BLOCK.AIR) continue;
        let trunk = 4 + ((rand() * 3) | 0);
        let clear = true;
        for (let y = 1; y <= trunk + 2; y++) {
          if (this.getBlock(x, h + y, z) !== BLOCK.AIR) { clear = false; break; }
        }
        if (!clear) continue;
        for (let y = 1; y <= trunk; y++) this.data[this.index(x, h + y, z)] = BLOCK.LOG;
        for (let ly = trunk - 2; ly <= trunk + 1; ly++) {
          const r = ly >= trunk ? 1 : 2;
          for (let lz = -r; lz <= r; lz++) {
            for (let lx = -r; lx <= r; lx++) {
              if (lx === 0 && lz === 0 && ly <= trunk) continue;
              if (Math.abs(lx) === r && Math.abs(lz) === r && rand() > 0.45) continue;
              if (ly === trunk + 1 && Math.abs(lx) + Math.abs(lz) > 1) continue;
              const bx = x + lx;
              const by = h + ly;
              const bz = z + lz;
              if (this.inBounds(bx, by, bz) && this.getBlock(bx, by, bz) === BLOCK.AIR) {
                this.data[this.index(bx, by, bz)] = BLOCK.LEAVES;
              }
            }
          }
        }
        this.data[this.index(x, h + trunk + 1, z)] = BLOCK.LEAVES;
      }
    }

    // Flowers and grass tufts ------------------------------------------------
    for (let z = 2; z < SZ - 2; z++) {
      for (let x = 2; x < SX - 2; x++) {
        const h = heights[x + z * SX];
        if (h <= SEA + 1 || h > 30) continue;
        if (this.getBlock(x, h, z) !== BLOCK.GRASS) continue;
        if (this.getBlock(x, h + 1, z) !== BLOCK.AIR) continue;
        const r = hash2(x * 5.3, z * 7.9, seed + 606);
        if (r > 0.968) {
          const pick = hash2(x, z, seed + 707);
          this.data[this.index(x, h + 1, z)] = pick < 0.34 ? BLOCK.ROSE : pick < 0.68 ? BLOCK.DAISY : BLOCK.TALLGRASS;
        }
      }
    }

    // Apply saved edits after generation.
    for (const [i, id] of this.edits) this.data[i] = id;
  }

  applyEdits(edits) {
    for (const [i, id] of edits) {
      if (i >= 0 && i < this.data.length) {
        this.data[i] = id;
        this.edits.set(i, id);
      }
    }
  }

  faceVisible(cur, nb) {
    if (nb === BLOCK.AIR || isCross(nb)) return true;
    if (cur === BLOCK.WATER) return nb !== BLOCK.WATER && !isOpaque(nb);
    if (cur === BLOCK.GLASS) return nb !== BLOCK.GLASS && !isOpaque(nb);
    if (cur === BLOCK.LEAVES) return nb !== BLOCK.LEAVES && !isOpaque(nb);
    if (isOpaque(cur)) return !isOpaque(nb);
    return true;
  }

  chunkKey(cx, cz) { return `${cx},${cz}`; }

  buildChunk(cx, cz) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    const key = this.chunkKey(cx, cz);
    let record = this.chunks.get(key);
    if (record) {
      for (const mesh of record.meshes) {
        this.group.remove(mesh);
        mesh.geometry.dispose();
      }
    }
    const builders = {
      opaque: new GeoBuilder(),
      cutout: new GeoBuilder(),
      flower: new GeoBuilder(),
      glass: new GeoBuilder(),
      water: new GeoBuilder(),
    };
    const x0 = cx * CHUNK;
    const z0 = cz * CHUNK;

    for (let y = 0; y < SY; y++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          const id = this.data[this.index(x, y, z)];
          if (id === BLOCK.AIR || id === BLOCK.WATER) {
            if (id === BLOCK.WATER) this.addWater(builders.water, x, y, z);
            continue;
          }
          const block = BLOCKS[id];
          if (isCross(id)) {
            this.addCross(builders.flower, x, y, z, block.tiles.top);
            continue;
          }
          const builder = id === BLOCK.GLASS ? builders.glass : (id === BLOCK.LEAVES ? builders.cutout : builders.opaque);
          for (const face of FACES) {
            const nx = x + face.n[0];
            const ny = y + face.n[1];
            const nz = z + face.n[2];
            if (!this.faceVisible(id, this.getBlock(nx, ny, nz))) continue;
            this.addFace(builder, x, y, z, id, face, block);
          }
        }
      }
    }

    const meshes = [];
    const groupNames = ['opaque', 'cutout', 'flower', 'glass', 'water'];
    for (const name of groupNames) {
      const geometry = builders[name].build();
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, this.materials[name]);
      mesh.frustumCulled = true;
      mesh.renderOrder = name === 'water' ? 2 : name === 'glass' ? 1 : 0;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
      meshes.push(mesh);
    }
    const sphere = new THREE.Sphere();
    let centerY = 0;
    for (const mesh of meshes) {
      if (mesh.geometry.boundingSphere) centerY += mesh.geometry.boundingSphere.center.y;
    }
    sphere.radius = 22;
    this.chunks.set(key, { meshes, cx, cz, built: true });
    this.dirty.delete(key);
  }

  addFace(builder, x, y, z, id, face, block) {
    const tile = block.tiles[face.tile];
    const uv = TILE_UV[tile];
    const pts = [];
    const colors = [];
    const du = face.u;
    const dv = face.v;
    const blockTint = 0.94 + hash2(x * 7.13 + y * 3.11, z * 5.17 + y * 1.7, this.seed + 909) * 0.12;
    for (let i = 0; i < 4; i++) {
      const cu = i === 1 || i === 2 ? 1 : 0;
      const cv = i >= 2 ? 1 : 0;
      pts.push([
        x + face.base[0] + du[0] * cu + dv[0] * cv,
        y + face.base[1] + du[1] * cu + dv[1] * cv,
        z + face.base[2] + du[2] * cu + dv[2] * cv,
      ]);
      // Ambient occlusion: sample the three blocks around this corner on the
      // outside of the face. Cross-shaped decoration never reaches here.
      const sx = cu ? 1 : -1;
      const sz = cv ? 1 : -1;
      const ox = x + face.n[0];
      const oy = y + face.n[1];
      const oz = z + face.n[2];
      const side1 = isOpaque(this.getBlock(ox + du[0] * sx, oy + du[1] * sx, oz + du[2] * sx)) ? 1 : 0;
      const side2 = isOpaque(this.getBlock(ox + dv[0] * sz, oy + dv[1] * sz, oz + dv[2] * sz)) ? 1 : 0;
      const corner = isOpaque(this.getBlock(ox + du[0] * sx + dv[0] * sz, oy + du[1] * sx + dv[1] * sz, oz + du[2] * sx + dv[2] * sz)) ? 1 : 0;
      const ao = side1 && side2 ? 0 : 3 - (side1 + side2 + corner);
      const shade = face.shade * (id === BLOCK.WATER ? 0.94 : AO_LEVELS[ao]) * blockTint;
      colors.push(shade);
    }
    const uvs = [
      [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
    ];
    builder.quad(pts, face.n, uvs, colors);
  }

  addWater(builder, x, y, z) {
    // Only the exposed side faces are needed: the far ocean plane supplies a
    // single continuous water surface, so block tops would z-fight with it.
    const neighbours = [
      [1, 0, 0, 'side'], [-1, 0, 0, 'side'], [0, 0, 1, 'side'], [0, 0, -1, 'side'],
    ];
    for (const [dx, dy, dz] of neighbours) {
      const nb = this.getBlock(x + dx, y + dy, z + dz);
      if (nb === BLOCK.AIR || isCross(nb)) {
        // Build an inward/outward facing side using the appropriate face.
        const face = FACES.find((f) => f.n[0] === dx && f.n[2] === dz);
        if (!face) continue;
        const uv = TILE_UV[BLOCKS[BLOCK.WATER].tiles.side];
        const pts = [];
        for (let i = 0; i < 4; i++) {
          const cu = i === 1 || i === 2 ? 1 : 0;
          const cv = i >= 2 ? 1 : 0;
          pts.push([
            x + face.base[0] + face.u[0] * cu + face.v[0] * cv,
            y + face.base[1] + face.u[1] * cu + face.v[1] * cv,
            z + face.base[2] + face.u[2] * cu + face.v[2] * cv,
          ]);
        }
        const uvs = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
        builder.quad(pts, face.n, uvs, [0.85, 0.85, 0.85, 0.85]);
      }
    }
  }

  addSimpleFace(builder, x, y, z, tileKey, tileRow, shade) {
    // Used for water's top: exactly the +Y face.
    const tile = BLOCKS[BLOCK.WATER].tiles[tileKey];
    const uv = TILE_UV[tile];
    const pts = [
      [x, y + 0.92, z + 1],
      [x + 1, y + 0.92, z + 1],
      [x + 1, y + 0.92, z],
      [x, y + 0.92, z],
    ];
    const uvs = [[uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0], [uv.u0, uv.v0]];
    builder.quad(pts, [0, 1, 0], uvs, [shade, shade, shade, shade]);
  }

  addCross(builder, x, y, z, tile) {
    const uv = TILE_UV[tile];
    const inset = 0.12;
    const uvs = [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]];
    const a = [
      [x + inset, y, z + inset],
      [x + 1 - inset, y, z + 1 - inset],
      [x + 1 - inset, y + 1, z + 1 - inset],
      [x + inset, y + 1, z + inset],
    ];
    const b = [
      [x + inset, y, z + 1 - inset],
      [x + 1 - inset, y, z + inset],
      [x + 1 - inset, y + 1, z + inset],
      [x + inset, y + 1, z + 1 - inset],
    ];
    builder.quad(a, [0, 0, 1], uvs, [1, 1, 1, 1]);
    builder.quad(b, [0, 0, 1], uvs, [1, 1, 1, 1]);
  }

  flushDirty(limit = 6) {
    if (!this.dirty.size) return 0;
    let count = 0;
    for (const key of this.dirty) {
      const [cx, cz] = key.split(',').map(Number);
      this.buildChunk(cx, cz);
      count++;
      if (count >= limit) break;
    }
    return count;
  }

  setTint(light, night = false) {
    if (night) this.tint.setRGB(light * 0.7, light * 0.84, light * 1.22);
    else this.tint.setRGB(light, light, light);
    for (const mat of Object.values(this.materials)) mat.color.copy(this.tint);
    this.materials.water.color.multiply(new THREE.Color(0.82, 0.92, 1.0));
  }

  solidAt(x, y, z) {
    return isOpaque(this.getBlock(x, y, z));
  }

  topSolidY(x, z) {
    for (let y = SY - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (id !== BLOCK.AIR && id !== BLOCK.WATER && !isCross(id)) return y + 1;
    }
    return 0;
  }
}
