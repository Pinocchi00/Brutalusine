/**
 * Vérification hors navigateur des volumes provisoires : la spécification seule, sans dessin.
 * Les couleurs, les empreintes, les hauteurs et les repères de famille sont contrôlés ici.
 */
import { describe, expect, it } from 'vitest';
import { B, BUILDINGS, ITEMS } from '../src/sim/data';
import { C, M } from '../src/render/px/palette';
import { dullColor, placeholderSpec, type FamilyIcon } from '../src/render/px/placeholders';

const palette = new Set<string>(Object.values(C));
for (const mat of Object.values(M)) {
  for (const col of Object.values(mat)) palette.add(col);
}

const ICONS: Record<string, FamilyIcon> = {
  logistique: 'arrows',
  extraction: 'pick',
  fonte: 'flame',
  fabrication: 'gear',
  energie: 'bolt',
};

describe('placeholderSpec', () => {
  it('décrit tous les bâtiments et renvoie null pour la seule dalle', () => {
    const nulls = BUILDINGS.filter((def) => placeholderSpec(def) === null);
    expect(nulls.map((def) => def.key)).toEqual(['dalle']);
    for (const def of BUILDINGS) {
      if (def.key === 'dalle') continue;
      expect(placeholderSpec(def), def.key).not.toBeNull();
    }
  });

  it('donne une empreinte en pixels égale aux cases du bâtiment', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      expect(spec.w, def.key).toBe(def.w * 24);
      expect(spec.h, def.key).toBe(def.h * 24);
    }
  });

  it('suit les dimensions effectives d’un bâtiment tourné', () => {
    const rotated = placeholderSpec(B.betonniere, 2, 3);
    expect(rotated?.w).toBe(48);
    expect(rotated?.h).toBe(72);
    const straight = placeholderSpec(B.betonniere);
    expect(straight?.w).toBe(72);
    expect(straight?.h).toBe(48);
  });

  it('tire la hauteur de def.height, avec un minimum de 6 sauf pour le plat', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      const raw = Math.round(def.height * 24);
      expect(spec.up, def.key).toBe(spec.flat ? raw : Math.max(6, raw));
    }
    const belt = placeholderSpec(B.convoyeur);
    expect(belt?.flat).toBe(true);
    expect(belt?.up).toBe(2);
  });

  it('croît avec def.height pour les bâtiments en volume', () => {
    const sorted = BUILDINGS
      .filter((def) => placeholderSpec(def)?.flat === false)
      .sort((a, b) => a.height - b.height);
    let previous = -1;
    for (const def of sorted) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      expect(spec.up, def.key).toBeGreaterThanOrEqual(previous);
      previous = spec.up;
    }
  });

  it('choisit la matière de la famille et le béton clair pour la Tour', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      let expected: keyof typeof M;
      if (def.kind === 'hub') expected = 'conc';
      else if (def.cat === 'fonte') expected = 'concD';
      else if (def.cat === 'extraction') expected = 'dark';
      else if (def.cat === 'fabrication') expected = 'conc';
      else expected = 'steel';
      expect(spec.matKey, def.key).toBe(expected);
      expect(spec.mat, def.key).toBe(M[expected]);
    }
  });

  it('pose la cheminée sur la fonte et le Brûleur seulement', () => {
    const chimneys = BUILDINGS
      .filter((def) => placeholderSpec(def)?.chimney)
      .map((def) => def.key)
      .sort();
    const expected = BUILDINGS
      .filter((def) => def.cat === 'fonte' || def.key === 'bruleur')
      .map((def) => def.key)
      .sort();
    expect(chimneys).toEqual(expected);
  });

  it('pose un socle sur tout bâtiment de 2 × 2 ou plus', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      expect(spec.plinth, def.key).toBe(def.w >= 2 && def.h >= 2 && !spec.flat);
    }
  });

  it('ouvre des fenêtres aux machines et à la Tour seulement', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      if (def.kind === 'hub') expect(spec.windows, def.key).toBe(2);
      else if (def.kind === 'machine') expect(spec.windows, def.key).toBeGreaterThanOrEqual(1);
      else expect(spec.windows, def.key).toBe(0);
    }
  });

  it('suit la famille pour le repère du toit, l’œil orange pour la Tour', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      const expected = def.kind === 'hub' ? 'eye' : ICONS[def.cat ?? 'logistique'];
      expect(spec.icon, def.key).toBe(expected);
    }
  });

  it('ne cite que des couleurs de la palette et des matières', () => {
    for (const def of BUILDINGS) {
      const spec = placeholderSpec(def);
      if (!spec) continue;
      expect(Object.keys(M), def.key).toContain(spec.matKey);
      for (const col of Object.values(spec.mat)) expect(palette, def.key).toContain(col);
    }
  });
});

describe('dullColor', () => {
  it('mêle chaque canal à parts égales entre la couleur et C.c3', () => {
    const endpoints = (hex: string): number[] => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const mud = endpoints(C.c3);
    for (const item of ITEMS) {
      const source = endpoints(item.color);
      const dull = endpoints(dullColor(item.color));
      for (let channel = 0; channel < 3; channel++) {
        const low = Math.min(source[channel], mud[channel]);
        const high = Math.max(source[channel], mud[channel]);
        expect(dull[channel], item.key).toBeGreaterThanOrEqual(low);
        expect(dull[channel], item.key).toBeLessThanOrEqual(high);
        expect(dull[channel], item.key).toBe(Math.round((source[channel] + mud[channel]) / 2));
      }
      expect(dullColor(item.color), item.key).not.toBe(item.color);
    }
  });
});
