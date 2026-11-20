import { describe, expect, it } from 'vitest';
import { DrawQueue, type FlatLayer } from '../src/render/px/scene';

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

type AddLayer = Parameters<DrawQueue['add']>[0];
type AddRejectsTall = 'tall' extends AddLayer ? never : true;
const addRejectsTall: AddRejectsTall = true;

describe('ordre des couches', () => {
  it('dessine sol, plat, ombres, hauts, effets puis lumière, quel que soit l’ordre des ajouts', () => {
    const queue = new DrawQueue();
    const seen: string[] = [];
    queue.add('light', () => seen.push('light'));
    queue.add('fx', () => seen.push('fx'));
    queue.addTall(10, 0, () => seen.push('tall'));
    queue.add('cast', () => seen.push('cast'));
    queue.add('flat', () => seen.push('flat'));
    queue.add('ground', () => seen.push('ground'));
    queue.flush();
    expect(seen).toEqual(['ground', 'flat', 'cast', 'tall', 'fx', 'light']);
  });

  it('refuse la couche tall dans add, vérifié au typage', () => {
    expect(addRejectsTall).toBe(true);
  });

  it('garde l’ordre d’ajout à l’intérieur d’une couche', () => {
    const queue = new DrawQueue();
    const seen: string[] = [];
    const layers: FlatLayer[] = ['ground', 'flat', 'cast', 'fx', 'light'];
    for (const layer of layers) {
      queue.add(layer, () => seen.push(`${layer}a`));
      queue.add(layer, () => seen.push(`${layer}b`));
    }
    queue.flush();
    expect(seen).toEqual([
      'grounda', 'groundb',
      'flata', 'flatb',
      'casta', 'castb',
      'fxa', 'fxb',
      'lighta', 'lightb',
    ]);
  });
});

describe('tri nord-sud', () => {
  it('trie par pied, puis par x, puis par ordre d’ajout', () => {
    const queue = new DrawQueue();
    const seen: string[] = [];
    const put = (name: string, footY: number, x: number): void => {
      queue.addTall(footY, x, () => seen.push(name));
    };
    put('sud', 30, 0);
    put('nord-est', 10, 20);
    put('nord-ouest', 10, 5);
    put('nord-même-x-1', 10, 5);
    put('nord-même-x-2', 10, 5);
    queue.flush();
    expect(seen).toEqual(['nord-ouest', 'nord-même-x-1', 'nord-même-x-2', 'nord-est', 'sud']);
  });

  it('accepte des pieds négatifs et flottants', () => {
    const queue = new DrawQueue();
    const seen: number[] = [];
    for (const footY of [2.25, -5.5, 0, -0.25, 1.5, -5.5]) {
      queue.addTall(footY, 0, () => seen.push(footY));
    }
    queue.flush();
    expect(seen).toEqual([-5.5, -5.5, -0.25, 0, 1.5, 2.25]);
  });

  it('mélange les couches à plat et les objets hauts au bon endroit', () => {
    const queue = new DrawQueue();
    const seen: string[] = [];
    queue.add('cast', () => seen.push('ombre'));
    queue.addTall(0, 0, () => seen.push('haut-sud'));
    queue.addTall(-10, 0, () => seen.push('haut-nord'));
    queue.add('flat', () => seen.push('tapis'));
    queue.add('fx', () => seen.push('particule'));
    queue.flush();
    expect(seen).toEqual(['tapis', 'ombre', 'haut-nord', 'haut-sud', 'particule']);
  });

  it('sort 1000 objets aux mêmes coordonnées dans leur ordre d’ajout', () => {
    const queue = new DrawQueue();
    const seen: number[] = [];
    for (let i = 0; i < 1000; i++) {
      queue.addTall(12.5, -3, () => seen.push(i));
    }
    queue.flush();
    expect(seen).toHaveLength(1000);
    expect(seen).toEqual(Array.from({ length: 1000 }, (_, i) => i));
  });
});

describe('réutilisation', () => {
  it('vide la file après un flush et redonne le même résultat à l’image suivante', () => {
    const queue = new DrawQueue();
    const image = (): string[] => {
      const seen: string[] = [];
      queue.add('ground', () => seen.push('sol'));
      queue.addTall(4, 2, () => seen.push('a'));
      queue.addTall(4, 1, () => seen.push('b'));
      queue.add('light', () => seen.push('lumière'));
      queue.flush();
      return seen;
    };
    const first = image();
    expect(queue.size).toBe(0);
    const second = image();
    expect(queue.size).toBe(0);
    expect(second).toEqual(first);
    expect(first).toEqual(['sol', 'b', 'a', 'lumière']);
  });

  it('compte les dessins en attente toutes couches confondues', () => {
    const queue = new DrawQueue();
    expect(queue.size).toBe(0);
    queue.add('ground', () => undefined);
    queue.add('fx', () => undefined);
    queue.addTall(0, 0, () => undefined);
    expect(queue.size).toBe(3);
    queue.clear();
    expect(queue.size).toBe(0);
  });
});

describe('erreurs', () => {
  it('poursuit les dessins après une exception et la relance à la fin', () => {
    const queue = new DrawQueue();
    const seen: string[] = [];
    queue.add('ground', () => seen.push('avant'));
    queue.add('ground', () => {
      throw new Error('boom');
    });
    queue.add('flat', () => seen.push('après'));
    queue.addTall(0, 0, () => seen.push('haut'));
    expect(() => queue.flush()).toThrow('boom');
    expect(seen).toEqual(['avant', 'après', 'haut']);
    expect(queue.size).toBe(0);
  });

  it('relance la première erreur seulement, après avoir tout dessiné', () => {
    const queue = new DrawQueue();
    const seen: string[] = [];
    queue.add('ground', () => {
      throw new Error('première');
    });
    queue.add('fx', () => {
      throw new Error('seconde');
    });
    queue.add('light', () => seen.push('fin'));
    expect(() => queue.flush()).toThrow('première');
    expect(seen).toEqual(['fin']);
    expect(queue.size).toBe(0);
  });
});

describe('performances', () => {
  it('ajoute et vide 20 000 objets hauts en moins de 30 ms (médiane de 7 essais)', () => {
    const run = (): number => {
      const queue = new DrawQueue();
      let drawn = 0;
      const start = performance.now();
      for (let i = 0; i < 20000; i++) {
        queue.addTall(20000 - i, 0, () => {
          drawn++;
        });
      }
      queue.flush();
      const elapsed = performance.now() - start;
      expect(drawn).toBe(20000);
      return elapsed;
    };
    run();
    const times = Array.from({ length: 7 }, run);
    // Marge large : la médiane observée tourne autour de 2 à 4 ms sur cette machine.
    expect(median(times)).toBeLessThan(30);
  });
});
