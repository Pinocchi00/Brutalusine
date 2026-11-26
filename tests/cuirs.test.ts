// Le rejeu « 30 cuirs » : la Tour en Pierre après trois livraisons, et le stock de départ exact.
import { describe, it, expect } from 'vitest';
import { Game } from '../src/sim/game';
import { I, NITEMS } from '../src/sim/data';
import { buildLeatherRun } from '../src/dev';

describe('rejeu 30 cuirs', () => {
  it('amène la Tour en Pierre et fixe le stock demandé', () => {
    const g = new Game(12);
    const log = buildLeatherRun(g);

    expect(g.quota).toBe(3);
    expect(g.era).toBe(2);
    expect(g.hub.level).toBe(3);

    const expected = new Array<number>(NITEMS).fill(0);
    expected[I.pierre] = 60;
    expected[I.bois] = 30;
    expected[I.carbone] = 10;
    expected[I.noyau] = 6;
    expect(Array.from(g.stock)).toEqual(expected);
    expect(log.length).toBeGreaterThan(0);
  });
});
