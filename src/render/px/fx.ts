/**
 * Les effets pixel du monde : particules, arbres frappés qui tremblent, arbres abattus qui tombent.
 * Les entrées sont en cases, tout le dessin se fait en pixels monde (une case vaut 24 pixels).
 */
import { C } from './palette';
import { hexToRgb } from './noise';
import type { Pen } from './pen';

/** Le nombre de pixels d'une case, le même que celui de la maquette. */
const T = 24;

/** La durée d'un tremblement, en temps d'animation (`now`). */
const SHAKE_TIME = 0.35;

/** La durée d'une chute d'arbre, en temps d'animation (`now`). */
const FALL_TIME = 0.55;

/** Le plafond de particules vivantes. */
const PARTICLE_CAP = 1200;

/** Le rythme de l'animation : `now` avance deux fois plus vite que l'horloge réelle. */
const PACE = 2;

/** Une sorte de rafale, comme dans l'ancien rendu. */
export type BurstKind = 'leaf' | 'dust' | 'spark' | 'chip' | 'star';

/** Une particule vivante, en pixels monde. */
interface Particle {
  kind: BurstKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  phase: number;
}

/** Un tremblement retenu pour une case. */
interface Shake {
  at: number;
  power: number;
  age: number;
}

/** Un arbre en train de tomber. */
interface Falling {
  x: number;
  y: number;
  size: number;
  t0: number;
  img: HTMLCanvasElement;
  dir: number;
}

/** Une couleur décomposée en canaux entiers. */
interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Ramène une valeur dans l'intervalle d'un canal, arrondie. */
function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Compose une couleur hexadécimale depuis trois canaux. */
function toHex(rgb: Rgb): string {
  const h = (value: number): string => clampByte(value).toString(16).padStart(2, '0');
  return `#${h(rgb.r)}${h(rgb.g)}${h(rgb.b)}`;
}

/** Lit une couleur hexadécimale ou `rgb(...)`, ou renvoie `null` si elle n'est pas reconnue. */
function parseColor(color: string): Rgb | null {
  const text = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,[^)]*)?\)?\s*$/i.exec(text);
  if (rgb) {
    return {
      r: clampByte(Number(rgb[1])),
      g: clampByte(Number(rgb[2])),
      b: clampByte(Number(rgb[3])),
    };
  }
  return null;
}

/** Adoucit une couleur vive en la mêlant à moitié à `C.c3` ; renvoie la couleur telle quelle si elle est illisible. */
export function softenColor(color: string): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const [r, g, b] = hexToRgb(C.c3);
  return toHex({ r: (rgb.r + r) / 2, g: (rgb.g + g) / 2, b: (rgb.b + b) / 2 });
}

/** La couleur d'une particule selon sa sorte : les verts et les étincelles gardent leur palette. */
function particleColor(kind: BurstKind, color: string): string {
  if (kind === 'leaf') return C.g2;
  if (kind === 'spark' || kind === 'star') return C.white;
  return softenColor(color);
}

/** Les effets pixel : particules, arbres frappés et arbres qui tombent. */
export class PixelFx {
  private parts: Particle[] = [];
  private hits = new Map<string, Shake>();
  private falls: Falling[] = [];

  /** Le nombre de particules vivantes. */
  get count(): number {
    return this.parts.length;
  }

  /** Le nombre d'arbres en train de tomber. */
  get fallingCount(): number {
    return this.falls.length;
  }

  /** Oublie tout : particules, tremblements et chutes. */
  reset(): void {
    this.parts.length = 0;
    this.hits.clear();
    this.falls.length = 0;
  }

  /** Lance une rafale de `n` particules d'une sorte autour d'une case. */
  burst(kind: BurstKind, x: number, y: number, color: string, n: number): void {
    const tone = particleColor(kind, color);
    for (let i = 0; i < n && this.parts.length < PARTICLE_CAP; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = kind === 'spark'
        ? (2 + Math.random() * 4) * T
        : kind === 'star'
          ? (3 + Math.random() * 7) * T
          : (0.6 + Math.random() * 2.2) * T;
      const lift = kind === 'dust' ? 0.4 : 1.2;
      const max = kind === 'dust'
        ? 0.7 + Math.random() * 0.5
        : kind === 'leaf'
          ? 0.8 + Math.random() * 0.7
          : 0.35 + Math.random() * 0.4;
      this.parts.push({
        kind,
        x: x * T,
        y: y * T,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - lift * T,
        life: 0,
        max,
        color: tone,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Retient le coup porté à l'arbre d'une case ; `power` distingue une frappe normale d'une frappe forte. */
  hit(tx: number, ty: number, now: number, power = 1): void {
    this.hits.set(`${Math.floor(tx)},${Math.floor(ty)}`, { at: now, power, age: 0 });
  }

  /** Le coup actif d'une case et son âge, ou `null` s'il n'y en a pas. */
  private activeHit(tx: number, ty: number, now: number): { hit: Shake; since: number } | null {
    const hit = this.hits.get(`${Math.floor(tx)},${Math.floor(ty)}`);
    if (!hit) return null;
    const since = now - hit.at;
    if (since < 0 || since >= SHAKE_TIME - 1e-9) return null;
    return { hit, since };
  }

  /** Le temps écoulé depuis le coup porté à une case, en secondes ; `null` si aucun coup n'est actif. */
  hitSince(tx: number, ty: number, now: number): number | null {
    const active = this.activeHit(tx, ty, now);
    return active ? active.since : null;
  }

  /** Le décalage horizontal entier, en pixels, de l'arbre frappé à cet instant. */
  shake(tx: number, ty: number, now: number): number {
    const active = this.activeHit(tx, ty, now);
    if (!active) return 0;
    const amplitude = active.hit.power > 1.5 ? 2 : 1;
    const sign = Math.floor(active.since * 16) % 2 ? 1 : -1;
    const decay = active.since < 0.18 ? 1 : 0.5;
    return Math.round(sign * amplitude * decay);
  }

  /** Lance un arbre abattu qui bascule et s'efface, dessiné avec l'image de son houppier. */
  fell(x: number, y: number, size: number, now: number, img: HTMLCanvasElement): void {
    this.falls.push({
      x,
      y,
      size: Math.max(0, Math.min(255, size)),
      t0: now,
      img,
      dir: Math.random() * Math.PI * 2,
    });
  }

  /** Avance les particules de `dt` secondes réelles, retire les mortes et oublie les vieux tremblements. */
  update(dt: number, wind: number): void {
    if (!(dt > 0)) return;
    const parts = this.parts;
    let kept = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dust') {
        p.vx += (wind * 0.6 * T - p.vx) * dt;
        p.vy *= 1 - dt * 0.6;
      } else if (p.kind === 'leaf') {
        p.vy += 2.2 * T * dt;
        p.vx += (wind * 0.25 * T - p.vx) * dt * 0.6;
      } else {
        p.vy += 7 * T * dt;
        p.vx *= 1 - dt * 2;
      }
      parts[kept] = p;
      kept++;
    }
    parts.length = kept;
    for (const [key, hit] of this.hits) {
      hit.age += dt * PACE;
      if (hit.age >= SHAKE_TIME) this.hits.delete(key);
    }
  }

  /** Dessine les arbres qui tombent, puis les particules, avec le crayon pixel. */
  draw(P: Pen, ctx: CanvasRenderingContext2D, now: number): void {
    this.drawFalling(ctx, now);
    for (const p of this.parts) this.drawParticle(P, ctx, p);
  }

  /** Dessine les arbres en chute, par paliers de pixels, et oublie ceux qui ont fini. */
  private drawFalling(ctx: CanvasRenderingContext2D, now: number): void {
    let kept = 0;
    for (const f of this.falls) {
      const t = (now - f.t0) / FALL_TIME;
      if (t >= 1) continue;
      if (t >= 0) this.drawFall(ctx, f, t);
      this.falls[kept] = f;
      kept++;
    }
    this.falls.length = kept;
  }

  /** Un arbre qui bascule : la translation et la rotation avancent par crans entiers. */
  private drawFall(ctx: CanvasRenderingContext2D, f: Falling, t: number): void {
    const e = t * t;
    const side = Math.cos(f.dir) >= 0 ? 1 : -1;
    const step = Math.PI / 24;
    const angle = Math.round((e * 1.1 * side) / step) * step;
    const cx = Math.round(f.x * T + Math.cos(f.dir) * e * 0.9 * T);
    const cy = Math.round(f.y * T + Math.sin(f.dir) * e * 0.5 * T);
    const dw = Math.max(1, Math.round(f.img.width * (1 - e * 0.25)));
    const dh = Math.max(1, Math.round(f.img.height * (1 - e * 0.5)));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1 - e;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(f.img, -Math.round(dw / 2), -Math.round(dh / 2), dw, dh);
    ctx.restore();
  }

  /** Dessine une particule selon sa sorte, toujours alignée sur le pixel. */
  private drawParticle(P: Pen, ctx: CanvasRenderingContext2D, p: Particle): void {
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const f = p.life / p.max;
    if (p.kind === 'leaf') {
      const alt = Math.floor(p.life * 3 + p.phase) % 2 === 0;
      P.r(x, y, 2, 1, alt ? C.g1 : C.g2);
      P.p(x + 2, y, alt ? C.g2 : C.g3);
      return;
    }
    if (p.kind === 'chip') {
      P.r(x, y, 2, 1, p.color);
      return;
    }
    if (p.kind === 'dust') {
      ctx.globalAlpha = Math.min(1, (1 - f) * 1.2);
      P.disc(x + 0.5, y + 0.5, 1 + f * 2, p.color);
      ctx.globalAlpha = 1;
      return;
    }
    if (p.kind === 'star' && f < 0.35) {
      P.p(x - 1, y, C.o0);
      P.p(x + 1, y, C.o0);
      P.p(x, y - 1, C.o0);
      P.p(x, y + 1, C.o0);
      P.p(x, y, C.white);
      return;
    }
    if (f > 0.6 && Math.floor(p.life * 20) % 3 === 0) return;
    P.p(x, y, f < 0.25 ? C.white : f < 0.55 ? C.o0 : C.o1);
  }
}
