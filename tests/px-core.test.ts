/**
 * La lueur du noyau d'un bâtiment : plus vive quand la machine travaille.
 */
import { describe, expect, it } from 'vitest';
import { Status } from '../src/sim/ent';
import { coreIntensity } from '../src/render/px/lights';

describe('coreIntensity', () => {
  it('donne son maximum à une machine en marche', () => {
    expect(coreIntensity(Status.Working)).toBe(1);
  });

  it('reste faible et fixe quand la machine ne travaille pas', () => {
    for (const status of [Status.Idle, Status.NoInput, Status.Blocked, Status.NoPower, Status.Dark, Status.NoBeast]) {
      expect(coreIntensity(status)).toBeLessThan(1);
      expect(coreIntensity(status)).toBe(coreIntensity(Status.Idle));
    }
  });
});
