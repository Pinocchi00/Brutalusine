/**
 * Le bruit et les courbes du rendu, sans aucune API du navigateur : testable sous Node.
 * Les formules et l'ordre des tirages sont ceux de la maquette.
 */

/** Un générateur pseudo-aléatoire déterministe, à partir d'une graine entière. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un bruit blanc déterministe dans [0, 1) pour une case et une graine données. */
export function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Un bruit de valeur lissé dans [0, 1), interpolé entre quatre cases. */
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Une bosse nulle aux bords et pleine au milieu, pour les pulsations. */
export function bump(x: number): number {
  return Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, x))));
}

/** Le lissage cubique `3u² − 2u³` de la maquette (son `sm`). */
export function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

/** Les trois courbes d'animation : douce, sortante, et à dépassement. */
export const EASE: Record<'io' | 'out' | 'back', (u: number) => number> = {
  io: smooth,
  out: (u) => 1 - (1 - u) ** 3,
  back: (u) => 1 + 2.9 * (u - 1) ** 3 + 1.9 * (u - 1) ** 2,
};

/** Décompose une couleur `#rrggbb` en trois canaux 0-255 (la maquette l'appelait `rgb`). */
export function hexToRgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Couleur hexadécimale invalide : « ${hex} » (attendu #rrggbb)`);
  }
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Compose une couleur `rgba(...)` depuis un hexadécimal et une opacité. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
