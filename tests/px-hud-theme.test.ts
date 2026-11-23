/**
 * Vérifie le thème pixel du HUD : les couleurs de la palette, les sélecteurs gardés,
 * les graisses de Rubik et le cadre de la maquette.
 */
import { describe, expect, it } from 'vitest';
import { C } from '../src/render/px/palette';

/* Le projet n'a pas les types de Node : on charge `node:fs` sans les nommer à la compilation. */
const fsSpecifier = 'node:fs';
const { readFileSync } = (await import(fsSpecifier)) as {
  readFileSync: (path: URL, encoding: 'utf8') => string;
};

const css = readFileSync(new URL('../src/ui/px/theme.css', import.meta.url), 'utf8');

/** Découpe une liste de sélecteurs sur les virgules qui ne sont hors d'aucune parenthèse. */
function splitSelectors(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const withoutImports = withoutComments.replace(/@import[^;]+;/g, '');

describe('thème pixel du HUD', () => {
  it('donne à chaque variable --px- la couleur de la palette', () => {
    const names = ['ink', 'ui0', 'ui1', 'ui2', 'ui3', 'c0', 'c1', 'c2', 'c3', 'c4', 'o0', 'o1', 'o2', 'o3', 'white', 'good', 'red'] as const;
    for (const name of names) {
      const match = new RegExp(`--px-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
      expect(match, `variable --px-${name}`).not.toBeNull();
      expect(match![1].toLowerCase()).toBe(C[name].toLowerCase());
    }
  });

  it('garde chaque sélecteur derrière :root[data-rendu="pixel"]', () => {
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let found = 0;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(withoutImports)) !== null) {
      const selectors = splitSelectors(match[1]);
      expect(selectors.length).toBeGreaterThan(0);
      for (const selector of selectors) {
        expect(selector.startsWith(":root[data-rendu='pixel']"), selector).toBe(true);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('importe les quatre graisses de Rubik en latin seulement', () => {
    const imports = [...css.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)].map((entry) => entry[1]);
    expect(imports).toHaveLength(4);
    const weights = imports.map((url) => {
      const match = /^@fontsource\/rubik\/latin-(\d{3})\.css$/.exec(url);
      expect(match, url).not.toBeNull();
      return match![1];
    });
    expect(weights.sort()).toEqual(['400', '500', '600', '700']);
  });

  it('décode un cadre de 5 × 5 avec les quatre couleurs attendues', () => {
    const match = /--px-frame:\s*url\("([^"]+)"\)\s*;/.exec(css);
    expect(match, 'variable --px-frame').not.toBeNull();
    const frame = decodeURIComponent(match![1]);
    expect(frame).toContain("width='5'");
    expect(frame).toContain("height='5'");
    const fills = [...frame.matchAll(/fill='(#[0-9a-fA-F]{6})'/g)].map((entry) => entry[1].toLowerCase());
    const unique = [...new Set(fills)].sort();
    const expected = [C.ink, C.ui0, C.ui1, C.ui2].map((color) => color.toLowerCase()).sort();
    expect(unique).toEqual(expected);
  });
});
