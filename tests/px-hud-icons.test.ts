/**
 * Vérification hors navigateur des icônes du HUD : la correspondance entre les bâtiments du jeu
 * et les clés dessinées, sans créer aucun canevas.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../src/sim/data';
import { HUD_ICON_KEYS, hudIconKey, type HudIconKey } from '../src/render/px/hudIcons';

/** Les quinze bâtiments qui ont leur propre dessin. */
const DRAWN: Readonly<Record<string, HudIconKey>> = {
  convoyeur: 'belt',
  puits: 'puits',
  charbonniere: 'kiln',
  entrepot: 'crate',
  dalle: 'slab',
  aiguillage: 'splitter',
  trieur: 'sorter',
  scierie: 'sawmill',
  four: 'furnace',
  bruleur: 'burner',
  tour: 'tower',
  piege: 'trap',
  tannerie: 'tannery',
  argiliere: 'clayPit',
  roue: 'waterWheel',
};

describe('icônes du HUD', () => {
  it('donne à chaque bâtiment une icône de la planche', () => {
    for (const def of BUILDINGS) {
      expect(HUD_ICON_KEYS).toContain(hudIconKey(def.key));
    }
  });

  it('réserve un dessin propre aux quinze bâtiments dessinés', () => {
    for (const [key, icon] of Object.entries(DRAWN)) {
      expect(BUILDINGS.some((def) => def.key === key)).toBe(true);
      expect(hudIconKey(key)).toBe(icon);
    }
    const drawnKeys = BUILDINGS.filter((def) => hudIconKey(def.key) !== 'neutral');
    expect(drawnKeys.map((def) => def.key).sort()).toEqual(Object.keys(DRAWN).sort());
  });

  it('ne laisse plus aucun bâtiment sans dessin propre', () => {
    const neutralKeys = BUILDINGS.filter((def) => hudIconKey(def.key) === 'neutral');
    expect(neutralKeys).toHaveLength(0);
  });

  it('traite les outils et les clés inconnues', () => {
    expect(hudIconKey('poings')).toBe('fist');
    expect(hudIconKey('demolir')).toBe('demolish');
    expect(hudIconKey('marteau')).toBe('hammer');
    expect(hudIconKey('inconnu')).toBe('neutral');
    expect(hudIconKey('')).toBe('neutral');
  });

  it('liste dix-neuf clés sans doublon', () => {
    expect(HUD_ICON_KEYS).toHaveLength(19);
    expect(new Set(HUD_ICON_KEYS).size).toBe(19);
  });
});
