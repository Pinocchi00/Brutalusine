// Le geste des bêtes et des épaves : priorité du clic, poursuite, cadence des coups, durée d'une fouille.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import {
  clickTarget, followBeast, searchStep, strikeStep, wreckNearestCell, STRIKE_INTERVAL, SEARCH_TIME,
} from '../src/ui/gesture';

describe('ce que vise un clic à mains libres', () => {
  it('le bâtiment passe avant la bête, puis l’épave, puis la récolte', () => {
    const g = new Game(7);
    const beast = g.fauna.beasts[0];
    beast.x = 10.5;
    beast.y = 10.5;

    expect(clickTarget(g, 0, 0, { x: beast.x, y: beast.y }, null).kind).toBe('entity');   // la Tour
    expect(clickTarget(g, 10, 10, { x: beast.x, y: beast.y }, null)).toEqual({ kind: 'beast', id: beast.id });

    beast.x = 100.5;
    beast.y = 100.5;
    const wreck = g.wrecks[0];
    const point = { x: wreck.x + 0.5, y: wreck.y + 0.5 };
    expect(clickTarget(g, wreck.x, wreck.y, point, null)).toEqual({ kind: 'wreck', id: wreck.id, searched: false });
    expect(clickTarget(g, 5, 5, { x: 5.5, y: 5.5 }, { kind: 'tree', x: 5, y: 5 }))
      .toEqual({ kind: 'harvest', pick: { kind: 'tree', x: 5, y: 5 } });
    expect(clickTarget(g, 5, 5, { x: 5.5, y: 5.5 }, null).kind).toBe('walk');
  });

  it('une épave déjà fouillée se signale comme telle', () => {
    const g = new Game(7);
    const wreck = g.wrecks[0];
    wreck.searched = true;
    expect(clickTarget(g, wreck.x, wreck.y, { x: wreck.x + 0.5, y: wreck.y + 0.5 }, null))
      .toEqual({ kind: 'wreck', id: wreck.id, searched: true });
  });
});

describe('la tâche de bête', () => {
  it('suit la bête à sa position courante et dit quand elle est à portée', () => {
    const g = new Game(7);
    const beast = g.fauna.beasts[0];
    beast.x = 10.2;
    beast.y = 10.7;
    const first = followBeast(g, beast.id, 8, 10, 2.1);
    expect(first).not.toBeNull();
    expect(first!.tileX).toBe(10);
    expect(first!.tileY).toBe(10);
    expect(first!.reach).toBe(false);

    beast.x = 12.9;
    beast.y = 11.2;
    const second = followBeast(g, beast.id, 12, 11, 2.1);
    expect(second!.tileX).toBe(12);
    expect(second!.tileY).toBe(11);
    expect(second!.reach).toBe(true);
  });

  it('rend null quand la bête a disparu', () => {
    const g = new Game(7);
    expect(followBeast(g, 1e6, 0, 0, 2.1)).toBeNull();
  });
});

describe('les durées du geste', () => {
  it('un coup toutes les 0,5 s', () => {
    expect(STRIKE_INTERVAL).toBe(0.5);
    expect(strikeStep(0, 0.49).strike).toBe(false);
    expect(strikeStep(0.49, 0.02).strike).toBe(true);
    let timer = 0;
    let hits = 0;
    for (let i = 0; i < 10; i++) {
      const clock = strikeStep(timer, 0.25);
      timer = clock.timer;
      if (clock.strike) hits++;
    }
    expect(hits).toBe(5);
  });

  it('une fouille dure 1,5 s', () => {
    expect(SEARCH_TIME).toBe(1.5);
    expect(searchStep(0, 1.49).done).toBe(false);
    expect(searchStep(0, 1.5).done).toBe(true);
    const half = searchStep(0, 0.75);
    expect(half.progress).toBeCloseTo(0.5, 6);
    expect(half.done).toBe(false);
    expect(searchStep(half.progress, 0.74).done).toBe(false);
    expect(searchStep(half.progress, 0.75).done).toBe(true);
  });

  it('la case d’approche est la plus proche des quatre cases de l’épave', () => {
    const wreck = { x: 10, y: 20 };
    expect(wreckNearestCell(wreck, 13, 21)).toEqual({ x: 11, y: 20 });
    expect(wreckNearestCell(wreck, 8, 18)).toEqual({ x: 10, y: 20 });
  });
});
