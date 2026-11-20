import { describe, expect, it } from 'vitest';
import { CHUNK, GROUND_WATER, Chunk, World } from '../src/sim/world';
import { GROUND_PX, groundSignature, paintChunk } from '../src/render/px/ground';
import { coopScale } from '../src/render/px/renderer';
import { TILE_PX, computeView, screenToWorld } from '../src/render/px/view';

/** Compte les octets qui diffèrent entre deux peintures. */
function differences(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) n++;
  }
  return n;
}

/** Un bloc de test qui couvre l'eau, la terre, les dalles et un débris. */
function sampleChunk(): Chunk {
  const chunk = new Chunk(0, 0);
  for (let ly = 0; ly < CHUNK; ly++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const i = (ly << 5) | lx;
      if (lx < 12 && ly < 12) chunk.ground[i] = GROUND_WATER;
      else if (lx >= 16 && lx < 28 && ly >= 4 && ly < 14) chunk.slab[i] = 1;
    }
  }
  chunk.loot[(20 << 5) | 20] = 1;
  return chunk;
}

describe('peinture du sol', () => {
  it('donne exactement les mêmes pixels pour un même bloc et une même graine', () => {
    const a = paintChunk(sampleChunk(), new World(123456));
    const b = paintChunk(sampleChunk(), new World(123456));
    expect(a.length).toBe(GROUND_PX * GROUND_PX * 4);
    expect(differences(a, b)).toBe(0);
  });

  it('peint chaque pixel en opaque et couvre tous les tons', () => {
    const pixels = paintChunk(sampleChunk(), new World(7));
    const colors = new Set<number>();
    let transparent = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] !== 255) transparent++;
      colors.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    }
    // Eau (plusieurs bandes), herbe (plusieurs tons) et béton : bien plus que trois couleurs.
    expect(transparent).toBe(0);
    expect(colors.size).toBeGreaterThan(12);
  });

  it('reste stable quand on repeint le même objet bloc', () => {
    const chunk = sampleChunk();
    const world = new World(99);
    const first = paintChunk(chunk, world);
    const second = paintChunk(chunk, world);
    expect(differences(first, second)).toBe(0);
  });
});

describe('signature du sol', () => {
  it('garde la même signature quand seule la canopée change', () => {
    const before = sampleChunk();
    const after = sampleChunk();
    after.canopy[(10 << 5) | 10] = 220;
    after.canopy[(11 << 5) | 10] = 0;
    after.version++;
    expect(groundSignature(after)).toBe(groundSignature(before));
  });

  it('change quand une dalle apparaît', () => {
    const before = sampleChunk();
    const after = sampleChunk();
    after.slab[(2 << 5) | 2] = 1;
    expect(groundSignature(after)).not.toBe(groundSignature(before));
  });

  it('change quand une dalle se déplace à nombre égal', () => {
    const before = sampleChunk();
    const after = sampleChunk();
    after.slab[(10 << 5) | 20] = 0;
    after.slab[(10 << 5) | 15] = 1;
    expect(groundSignature(after)).not.toBe(groundSignature(before));
  });

  it('change quand un débris apparaît', () => {
    const before = sampleChunk();
    const after = sampleChunk();
    after.loot[(5 << 5) | 5] = 1;
    expect(groundSignature(after)).not.toBe(groundSignature(before));
  });

  it('change quand une case passe de la terre à l’eau', () => {
    const before = sampleChunk();
    const after = sampleChunk();
    after.ground[(20 << 5) | 2] = GROUND_WATER;
    expect(groundSignature(after)).not.toBe(groundSignature(before));
  });
});

describe('échelle en coop', () => {
  const bounds = { min: 1, max: 5 };

  it('garde l’échelle choisie quand elle tient tout le monde', () => {
    expect(coopScale(3, 4.6, bounds)).toBe(3);
  });

  it('réduit à celle qui tient tout le monde, arrondie vers le bas', () => {
    expect(coopScale(4, 2.9, bounds)).toBe(2);
  });

  it('ramène toujours le résultat entier dans les bornes', () => {
    expect(coopScale(9, 9, bounds)).toBe(5);
    expect(coopScale(1, 0.4, bounds)).toBe(1);
    expect(Number.isInteger(coopScale(3, 2.4, bounds))).toBe(true);
  });
});

describe('écran vers monde', () => {
  it('la formule de pick et les conversions donnent la même case', () => {
    const dpr = 2;
    const cssW = 1280, cssH = 720;
    const screenW = cssW * dpr, screenH = cssH * dpr;
    const scale = 3, camX = 4.3, camY = -2.7;
    const zoom = TILE_PX * scale;
    const view = computeView(camX, camY, scale, screenW, screenH, 4);
    for (const [sx, sy] of [[640, 360], [120, 580], [1100, 90]]) {
      const pickX = camX + (sx - cssW / 2) / (zoom / dpr);
      const pickY = camY + (sy - cssH / 2) / (zoom / dpr);
      const world = screenToWorld(view, sx * dpr, sy * dpr);
      expect(Math.floor(world.x)).toBe(Math.floor(pickX));
      expect(Math.floor(world.y)).toBe(Math.floor(pickY));
    }
  });
});
