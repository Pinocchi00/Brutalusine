/**
 * Vérifie la phrase d'aide de la barre de construction pixel : les cinq cas d'outil,
 * l'échappement du nom et le repli sur les Poings quand la définition manque.
 */
import { describe, expect, it } from 'vitest';
import { toolHint } from '../src/ui/px/barHint';

describe('phrase d’aide de la barre pixel', () => {
  it('décrit les mains libres quand aucun outil n’est tenu', () => {
    expect(toolHint(null, null)).toBe('<b>Poings</b> · clique un arbre, un rocher ou un débris');
  });

  it('décrit la démolition', () => {
    expect(toolHint('demolir', null)).toBe('<b>Démolir</b> · clique ou glisse · tout est remboursé');
  });

  it('décrit le tracé d’un convoyeur', () => {
    expect(toolHint('convoyeur', { name: 'Convoyeur', kind: 'belt' })).toBe('<b>Convoyeur</b> · glisse pour tracer');
  });

  it('décrit le pavage d’une dalle', () => {
    expect(toolHint('dalle', { name: 'Dalle', kind: 'slab' })).toBe('<b>Dalle</b> · clique ou glisse pour paver');
  });

  it('décrit la pose d’un autre bâtiment', () => {
    expect(toolHint('puits', { name: 'Puits', kind: 'miner' })).toBe('<b>Puits</b> · clique pour poser · R pivote');
  });

  it('échappe un nom contenant du HTML', () => {
    expect(toolHint('test', { name: 'A<b>&"', kind: 'machine' })).toBe('<b>A&lt;b&gt;&amp;&quot;</b> · clique pour poser · R pivote');
  });

  it('retombe sur les Poings quand la définition manque', () => {
    expect(toolHint('inconnu', null)).toBe('<b>Poings</b> · clique un arbre, un rocher ou un débris');
  });
});
