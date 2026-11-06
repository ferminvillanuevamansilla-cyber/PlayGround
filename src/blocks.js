// Block definitions, procedural pixel textures and the shared texture atlas.
import * as THREE from 'three';

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  LOG: 6,
  LEAVES: 7,
  PLANKS: 8,
  GLASS: 9,
  BRICK: 10,
  SNOW: 11,
  GLOWSTONE: 12,
  WATER: 13,
  BEDROCK: 14,
  ROSE: 15,
  DAISY: 16,
  TALLGRASS: 17,
  STONEBRICK: 18,
};

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;
export const ATLAS_W = TILE * ATLAS_COLS;
export const ATLAS_H = TILE * ATLAS_ROWS;

// Tile ids inside the atlas.
const T = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  cobble: 4,
  sand: 5,
  logSide: 6,
  logTop: 7,
  leaves: 8,
  planks: 9,
  glass: 10,
  brick: 11,
  snow: 12,
  glow: 13,
  water: 14,
  bedrock: 15,
  rose: 16,
  daisy: 17,
  tallgrass: 18,
  stonebrick: 19,
  clouds: 20,
};

export const BLOCKS = [];
function def(id, name, tiles, opts = {}) {
  BLOCKS[id] = {
    id,
    name,
    tiles,
    solid: opts.solid ?? true,
    opaque: opts.opaque ?? true,
    breakable: opts.breakable ?? true,
    cross: opts.cross ?? false,
    liquid: opts.liquid ?? false,
    drop: opts.drop ?? id,
    color: opts.color ?? 0xffffff,
    luminous: opts.luminous ?? false,
  };
}

def(BLOCK.AIR, 'Air', null, { solid: false, opaque: false, breakable: false });
def(BLOCK.GRASS, 'Grass Block', { top: T.grassTop, side: T.grassSide, bottom: T.dirt }, { color: 0x7cb95b });
def(BLOCK.DIRT, 'Dirt', { top: T.dirt, side: T.dirt, bottom: T.dirt }, { color: 0x8b5e3c });
def(BLOCK.STONE, 'Stone', { top: T.stone, side: T.stone, bottom: T.stone }, { color: 0x8a8d91 });
def(BLOCK.COBBLE, 'Cobblestone', { top: T.cobble, side: T.cobble, bottom: T.cobble }, { color: 0x777b7e });
def(BLOCK.SAND, 'Sand', { top: T.sand, side: T.sand, bottom: T.sand }, { color: 0xe6d49b });
def(BLOCK.LOG, 'Oak Log', { top: T.logTop, side: T.logSide, bottom: T.logTop }, { color: 0x8a6134 });
def(BLOCK.LEAVES, 'Oak Leaves', { top: T.leaves, side: T.leaves, bottom: T.leaves }, { opaque: false, color: 0x3f7c34 });
def(BLOCK.PLANKS, 'Oak Planks', { top: T.planks, side: T.planks, bottom: T.planks }, { color: 0xb28a54 });
def(BLOCK.GLASS, 'Glass', { top: T.glass, side: T.glass, bottom: T.glass }, { opaque: false, color: 0xc9e9f3 });
def(BLOCK.BRICK, 'Bricks', { top: T.brick, side: T.brick, bottom: T.brick }, { color: 0xa44f3e });
def(BLOCK.SNOW, 'Snow', { top: T.snow, side: T.snow, bottom: T.snow }, { color: 0xeef4f7 });
def(BLOCK.GLOWSTONE, 'Glowstone', { top: T.glow, side: T.glow, bottom: T.glow }, { color: 0xffd47a, luminous: true });
def(BLOCK.WATER, 'Water', { top: T.water, side: T.water, bottom: T.water }, { solid: false, opaque: false, breakable: false, liquid: true, color: 0x3d7fd6 });
def(BLOCK.BEDROCK, 'Bedrock', { top: T.bedrock, side: T.bedrock, bottom: T.bedrock }, { breakable: false, color: 0x45484d });
def(BLOCK.ROSE, 'Rose', { top: T.rose, side: T.rose, bottom: T.rose }, { solid: false, opaque: false, cross: true, color: 0xcc3a4a });
def(BLOCK.DAISY, 'Daisy', { top: T.daisy, side: T.daisy, bottom: T.daisy }, { solid: false, opaque: false, cross: true, color: 0xf2d75e });
def(BLOCK.TALLGRASS, 'Tall Grass', { top: T.tallgrass, side: T.tallgrass, bottom: T.tallgrass }, { solid: false, opaque: false, cross: true, color: 0x67a847 });
def(BLOCK.STONEBRICK, 'Stone Bricks', { top: T.stonebrick, side: T.stonebrick, bottom: T.stonebrick }, { color: 0x8d9297 });

export const PLACEABLE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.SAND,
  BLOCK.LOG, BLOCK.LEAVES, BLOCK.PLANKS, BLOCK.GLASS, BLOCK.BRICK,
  BLOCK.SNOW, BLOCK.GLOWSTONE, BLOCK.STONEBRICK,
];

export const isOpaque = (id) => BLOCKS[id]?.opaque ?? false;
export const isSolid = (id) => BLOCKS[id]?.solid ?? false;
export const isCross = (id) => BLOCKS[id]?.cross ?? false;
export const isLiquid = (id) => BLOCKS[id]?.liquid ?? false;

// ---------------------------------------------------------------------------
// Pixel art generation
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (r, g, b, a = 255) => `rgba(${r | 0},${g | 0},${b | 0},${a / 255})`;

function fillNoise(ctx, x, y, base, spread, rand, count = 256) {
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const n = (rand() - 0.5) * spread;
      ctx.fillStyle = rgb(base[0] + n, base[1] + n, base[2] + n);
      ctx.fillRect(x + px, y + py, 1, 1);
    }
  }
}

function speckle(ctx, x, y, count, colors, rand) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.fillRect(x + ((rand() * TILE) | 0), y + ((rand() * TILE) | 0), 1, 1);
  }
}

function drawTile(ctx, tile, painter) {
  const x = (tile % ATLAS_COLS) * TILE;
  const y = ((tile / ATLAS_COLS) | 0) * TILE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, TILE, TILE);
  ctx.clip();
  painter(x, y, mulberry32(9001 + tile * 7919));
  ctx.restore();
}

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  drawTile(ctx, T.grassTop, (x, y, rand) => {
    fillNoise(ctx, x, y, [112, 172, 71], 30, rand);
    speckle(ctx, x, y, 16, ['#6b9e43', '#8bc25c', '#7eb34e', '#a1cf6d'], rand);
  });
  drawTile(ctx, T.grassSide, (x, y, rand) => {
    fillNoise(ctx, x, y, [126, 88, 55], 28, rand);
    const edge = [4, 5, 3, 5, 4, 6, 4, 5, 4, 3, 5, 4, 5, 4, 5, 4];
    for (let px = 0; px < TILE; px++) {
      const h = edge[px];
      for (let py = 0; py < h; py++) {
        const n = (rand() - 0.5) * 28;
        ctx.fillStyle = rgb(101 + n, 161 + n, 62 + n);
        ctx.fillRect(x + px, y + py, 1, 1);
      }
      if (rand() > 0.55) {
        ctx.fillStyle = '#639a43';
        ctx.fillRect(x + px, y + h, 1, 1);
      }
    }
    speckle(ctx, x, y + 6, 8, ['#5f4229', '#977044', '#6d4b2c'], rand);
  });
  drawTile(ctx, T.dirt, (x, y, rand) => {
    fillNoise(ctx, x, y, [129, 89, 56], 24, rand);
    speckle(ctx, x, y, 20, ['#76502f', '#a07446', '#8c6138', '#68452a'], rand);
  });
  drawTile(ctx, T.stone, (x, y, rand) => {
    fillNoise(ctx, x, y, [133, 135, 138], 22, rand);
    speckle(ctx, x, y, 12, ['#7c7f83', '#a4a6a8', '#74777a'], rand);
    ctx.fillStyle = 'rgba(90,93,97,0.55)';
    ctx.fillRect(x + 3, y + 7, 4, 1);
    ctx.fillRect(x + 8, y + 11, 5, 1);
    ctx.fillRect(x + 11, y + 4, 1, 3);
  });
  drawTile(ctx, T.cobble, (x, y, rand) => {
    fillNoise(ctx, x, y, [111, 115, 118], 16, rand);
    ctx.strokeStyle = 'rgba(74,77,80,0.9)';
    ctx.lineWidth = 1;
    const stones = [[0,0,7,5],[8,0,8,4],[0,6,4,4],[5,5,5,6],[11,5,5,5],[0,11,6,5],[7,12,9,4],[11,10,5,2]];
    for (const [sx, sy, sw, sh] of stones) {
      ctx.strokeRect(x + sx + 0.5, y + sy + 0.5, sw - 1, sh - 1);
      ctx.fillStyle = 'rgba(160,163,165,0.14)';
      ctx.fillRect(x + sx + 1, y + sy + 1, sw - 2, 1);
    }
  });
  drawTile(ctx, T.sand, (x, y, rand) => {
    fillNoise(ctx, x, y, [224, 208, 154], 16, rand);
    speckle(ctx, x, y, 24, ['#d6c186', '#efe0ad', '#c9b477'], rand);
  });
  drawTile(ctx, T.logSide, (x, y, rand) => {
    fillNoise(ctx, x, y, [114, 79, 43], 16, rand);
    for (let px = 0; px < TILE; px++) {
      if (px % 4 === 0) {
        ctx.fillStyle = 'rgba(66,45,25,0.55)';
        ctx.fillRect(x + px, y, 1, TILE);
      }
      if (px % 4 === 2) {
        ctx.fillStyle = 'rgba(160,112,62,0.35)';
        ctx.fillRect(x + px, y, 1, TILE);
      }
    }
    speckle(ctx, x, y, 10, ['#5d3f23', '#8d602f', '#a5743d'], rand);
  });
  drawTile(ctx, T.logTop, (x, y, rand) => {
    fillNoise(ctx, x, y, [164, 119, 67], 12, rand);
    ctx.strokeStyle = '#7d572e';
    ctx.lineWidth = 1;
    for (let r = 2; r < 8; r += 2) {
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#6d4a27';
    ctx.fillRect(x + 7, y + 7, 2, 2);
  });
  drawTile(ctx, T.leaves, (x, y, rand) => {
    ctx.clearRect(x, y, TILE, TILE);
    fillNoise(ctx, x, y, [55, 112, 45], 34, rand);
    speckle(ctx, x, y, 42, ['#2e6d2c', '#4f963c', '#67ab4b', '#245a23', '#79b95b'], rand);
    for (let i = 0; i < 12; i++) {
      const px = (rand() * TILE) | 0;
      const py = (rand() * TILE) | 0;
      ctx.clearRect(x + px, y + py, 1, 1);
    }
  });
  drawTile(ctx, T.planks, (x, y, rand) => {
    fillNoise(ctx, x, y, [180, 139, 85], 12, rand);
    ctx.fillStyle = 'rgba(104,75,42,0.7)';
    for (let py = 3; py < TILE; py += 4) ctx.fillRect(x, y + py, TILE, 1);
    ctx.fillRect(x + 5, y, 1, 3);
    ctx.fillRect(x + 11, y + 4, 1, 3);
    ctx.fillRect(x + 2, y + 8, 1, 3);
    ctx.fillRect(x + 9, y + 12, 1, 3);
    speckle(ctx, x, y, 8, ['#c79c61', '#9a7447', '#d0a66c'], rand);
  });
  drawTile(ctx, T.glass, (x, y, rand) => {
    ctx.clearRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(190,229,242,0.16)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(221,248,255,0.85)';
    ctx.fillRect(x, y, TILE, 1);
    ctx.fillRect(x, y + 15, TILE, 1);
    ctx.fillRect(x, y, 1, TILE);
    ctx.fillRect(x + 15, y, 1, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 3, y + 3, 4, 1);
    ctx.fillRect(x + 3, y + 3, 1, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 10, y + 10, 3, 1);
  });
  drawTile(ctx, T.brick, (x, y, rand) => {
    fillNoise(ctx, x, y, [151, 73, 56], 12, rand);
    ctx.fillStyle = '#d9c5a8';
    for (let row = 0; row < 4; row++) {
      ctx.fillRect(x, y + row * 4, TILE, 1);
      const offset = row % 2 === 0 ? 0 : 4;
      for (let bx = offset; bx < TILE; bx += 8) ctx.fillRect(x + bx, y + row * 4, 1, 4);
    }
    speckle(ctx, x, y, 10, ['#b55946', '#8f4131', '#c06650'], rand);
  });
  drawTile(ctx, T.snow, (x, y, rand) => {
    fillNoise(ctx, x, y, [236, 244, 248], 12, rand);
    speckle(ctx, x, y, 18, ['#d4e3ea', '#ffffff', '#c8dbe4'], rand);
  });
  drawTile(ctx, T.glow, (x, y, rand) => {
    fillNoise(ctx, x, y, [225, 170, 73], 18, rand);
    speckle(ctx, x, y, 30, ['#ffe49a', '#ffc85c', '#c78a35', '#fff4c7'], rand);
    ctx.fillStyle = 'rgba(255,246,203,0.8)';
    for (const [px, py] of [[3,4],[11,3],[6,9],[12,10],[2,12]]) ctx.fillRect(x + px, y + py, 2, 2);
  });
  drawTile(ctx, T.water, (x, y, rand) => {
    fillNoise(ctx, x, y, [55, 124, 201], 18, rand);
    ctx.fillStyle = 'rgba(150,211,246,0.5)';
    ctx.fillRect(x + 2, y + 4, 5, 1);
    ctx.fillRect(x + 9, y + 7, 4, 1);
    ctx.fillRect(x + 4, y + 11, 6, 1);
    ctx.fillRect(x + 12, y + 13, 3, 1);
    ctx.fillStyle = 'rgba(29,88,160,0.5)';
    ctx.fillRect(x + 1, y + 8, 4, 1);
    ctx.fillRect(x + 8, y + 2, 5, 1);
  });
  drawTile(ctx, T.bedrock, (x, y, rand) => {
    fillNoise(ctx, x, y, [70, 73, 79], 34, rand);
    speckle(ctx, x, y, 30, ['#3c3f44', '#54575d', '#2e3034', '#686b70'], rand);
  });
  drawTile(ctx, T.rose, (x, y, rand) => {
    ctx.clearRect(x, y, TILE, TILE);
    ctx.fillStyle = '#3d7a30';
    ctx.fillRect(x + 7, y + 8, 2, 8);
    ctx.fillRect(x + 4, y + 10, 3, 1);
    ctx.fillRect(x + 9, y + 12, 3, 1);
    ctx.fillStyle = '#cf3348';
    ctx.fillRect(x + 5, y + 3, 6, 5);
    ctx.fillStyle = '#f05a67';
    ctx.fillRect(x + 6, y + 3, 2, 2);
    ctx.fillRect(x + 9, y + 5, 1, 1);
    ctx.fillStyle = '#8f1f35';
    ctx.fillRect(x + 7, y + 6, 3, 2);
  });
  drawTile(ctx, T.daisy, (x, y, rand) => {
    ctx.clearRect(x, y, TILE, TILE);
    ctx.fillStyle = '#3d7a30';
    ctx.fillRect(x + 7, y + 8, 2, 8);
    ctx.fillRect(x + 4, y + 12, 3, 1);
    ctx.fillStyle = '#fff8dc';
    ctx.fillRect(x + 5, y + 3, 2, 2);
    ctx.fillRect(x + 9, y + 3, 2, 2);
    ctx.fillRect(x + 7, y + 1, 2, 2);
    ctx.fillRect(x + 7, y + 5, 2, 2);
    ctx.fillRect(x + 5, y + 4, 6, 1);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(x + 7, y + 3, 2, 2);
  });
  drawTile(ctx, T.tallgrass, (x, y, rand) => {
    ctx.clearRect(x, y, TILE, TILE);
    const blades = [[2,10,2,6],[5,8,1,7],[8,11,1,5],[11,7,2,8],[14,10,1,5],[6,12,1,4],[12,13,1,3]];
    for (const [bx, by, bw, bh] of blades) {
      ctx.fillStyle = rand() > 0.5 ? '#4f963c' : '#63aa48';
      ctx.fillRect(x + bx, y + by, bw, bh);
      ctx.fillRect(x + bx - 1, y + by + 2, bw + 2, 1);
    }
  });
  drawTile(ctx, T.stonebrick, (x, y, rand) => {
    fillNoise(ctx, x, y, [135, 140, 145], 12, rand);
    ctx.fillStyle = 'rgba(84,88,92,0.85)';
    ctx.fillRect(x, y + 7, TILE, 1);
    ctx.fillRect(x, y + 15, TILE, 1);
    ctx.fillRect(x + 7, y, 1, 7);
    ctx.fillRect(x + 3, y + 8, 1, 7);
    ctx.fillRect(x + 12, y + 8, 1, 7);
    ctx.fillStyle = 'rgba(190,194,197,0.35)';
    ctx.fillRect(x, y, TILE, 1);
    ctx.fillRect(x, y + 8, TILE, 1);
  });
  drawTile(ctx, T.clouds, (x, y, rand) => {
    ctx.clearRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(x, y, TILE, TILE);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export const TILE_UV = [];
for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
  const col = tile % ATLAS_COLS;
  const row = (tile / ATLAS_COLS) | 0;
  const pad = 0.12;
  TILE_UV[tile] = {
    u0: (col * TILE + pad) / ATLAS_W,
    u1: ((col + 1) * TILE - pad) / ATLAS_W,
    v0: 1 - ((row + 1) * TILE - pad) / ATLAS_H,
    v1: 1 - (row * TILE + pad) / ATLAS_H,
  };
}

// Small isometric cube icons for the HUD, rendered from the same pixel tiles.
export function makeBlockIcon(blockId, size = 64, atlasImage = null) {
  const b = BLOCKS[blockId];
  if (!b) return '';
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const atlas = atlasImage || createAtlas().image;
  const tileCanvas = (tile) => {
    const c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    c.getContext('2d').drawImage(atlas, (tile % ATLAS_COLS) * TILE, ((tile / ATLAS_COLS) | 0) * TILE, TILE, TILE, 0, 0, TILE, TILE);
    return c;
  };
  const top = tileCanvas(b.tiles.top);
  const side = tileCanvas(b.tiles.side);
  const s = size / 32;
  const face = (img, origin, ux, uy, vx, vy, shade) => {
    ctx.save();
    ctx.setTransform(ux, uy, vx, vy, origin[0], origin[1]);
    ctx.drawImage(img, 0, 0, TILE, TILE, 0, 0, 1, 1);
    if (shade > 0) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(0, 0, 1, 1);
    }
    ctx.restore();
  };
  face(top, [2 * s, 9 * s], 14 * s, -7 * s, 14 * s, 7 * s, 0);
  face(side, [2 * s, 9 * s], 14 * s, 7 * s, 0, 14 * s, 0.16);
  face(side, [16 * s, 16 * s], 14 * s, -7 * s, 0, 14 * s, 0.32);
  ctx.strokeStyle = 'rgba(20,30,35,0.35)';
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.moveTo(16 * s, 2 * s);
  ctx.lineTo(30 * s, 9 * s);
  ctx.lineTo(16 * s, 16 * s);
  ctx.lineTo(2 * s, 9 * s);
  ctx.closePath();
  ctx.stroke();
  return canvas.toDataURL();
}
