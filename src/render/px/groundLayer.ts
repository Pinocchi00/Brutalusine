/**
 * La couche de sol du rendu pixel : elle relie le monde au cache de peinture et à la vie du sol.
 * Le renderer ne connaît qu'elle ; rien ici ne crée de bloc.
 */
import { CHUNK, GROUND_WATER, type Chunk, type World } from '../../sim/world';
import { TREE_MIN } from '../../sim/data';
import { C } from './palette';
import { makeSurface } from './surface';
import { TILE_PX, type PixelView } from './view';
import { GroundCache } from './groundCache';
import { paintTiles, type GroundPathSegment, type GroundSource } from './groundPaint';
import { drawGroundLife, layoutLife, type GroundLife } from './groundLife';
import { pen } from './pen';

/** Le côté d'un bloc peint, en pixels de pixel art. */
const BLOCK_PX = CHUNK * TILE_PX;

/** Le nombre de cases d'un côté des codes, marge d'une case comprise. */
const CODES = CHUNK + 2;

/** Le nombre d'images sans être vu après lequel la vie d'un bloc est oubliée. */
const LIFE_TTL = 120;

/**
 * Le budget de peinture par image, en millisecondes. Il laisse 0,5 ms de marge aux autres
 * travaux du sol (tri des blocs, lecture des codes et vie du sol) dans le budget de 4 ms.
 */
const GROUND_BUDGET_MS = 3.5;

/** Une entrée de vie du sol, avec la dernière image où son bloc a été vu. */
interface LifeEntry {
  life: GroundLife;
  seen: number;
}

/** Vrai si au moins la moitié des cases du bloc est de l'eau. */
function mostlyWater(chunk: Chunk): boolean {
  let water = 0;
  for (let i = 0; i < CHUNK * CHUNK; i++) {
    if (chunk.ground[i] === GROUND_WATER) water++;
  }
  return water * 2 >= CHUNK * CHUNK;
}

/** La couche de sol : cache des blocs, vie du sol et liste des blocs visibles. */
export class GroundLayer {
  private readonly cache: GroundCache<Chunk, HTMLCanvasElement>;
  private readonly visible: Chunk[] = [];
  private readonly nearby: Chunk[] = [];
  private readonly life = new Map<Chunk, LifeEntry>();
  private readonly slab = new Uint8Array(CODES * CODES);
  private paths = new WeakMap<Chunk, readonly GroundPathSegment[]>();
  private world: World | null = null;

  /** Le temps réel passé dans la mise à jour du sol à la dernière image. */
  groundMs = 0;

  constructor() {
    this.cache = new GroundCache<Chunk, HTMLCanvasElement>(
      {
        readCodes: (chunk, out) => {
          if (this.world) this.readCodes(this.world, chunk, out);
        },
        paint: (chunk, out, tx0, ty0, tx1, ty1) => {
          if (this.world) this.paintRect(this.world, chunk, out, tx0, ty0, tx1, ty1);
        },
        createSurface: () => makeSurface(BLOCK_PX, BLOCK_PX).canvas,
        blit: (surface, data, x, y, w, h) => {
          const ctx = surface.getContext('2d');
          if (!ctx) throw new Error('Contexte 2D indisponible');
          const image = new ImageData(data as Uint8ClampedArray<ArrayBuffer>, w, h);
          ctx.putImageData(image, x, y);
        },
        now: () => performance.now(),
      },
      { budgetMs: GROUND_BUDGET_MS },
    );
  }

  /** Vide le cache et la vie du sol. */
  clear(): void {
    this.cache.clear();
    this.life.clear();
    this.paths = new WeakMap();
    this.visible.length = 0;
    this.nearby.length = 0;
    this.groundMs = 0;
  }

  /** Avance la peinture des blocs visibles et prépare la vie d'un bloc au plus par image. */
  update(world: World, view: PixelView, frame: number): void {
    const start = performance.now();
    this.world = world;
    const cx0 = Math.floor(view.tileX0 / CHUNK);
    const cx1 = Math.floor(view.tileX1 / CHUNK);
    const cy0 = Math.floor(view.tileY0 / CHUNK);
    const cy1 = Math.floor(view.tileY1 / CHUNK);
    this.visible.length = 0;
    this.nearby.length = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = world.chunk(cx, cy, false);
        if (chunk) this.visible.push(chunk);
      }
    }
    const centreX = (view.tileX0 + view.tileX1) / 2;
    const centreY = (view.tileY0 + view.tileY1) / 2;
    this.visible.sort((a, b) => {
      const dxa = a.cx * CHUNK + CHUNK / 2 - centreX;
      const dya = a.cy * CHUNK + CHUNK / 2 - centreY;
      const dxb = b.cx * CHUNK + CHUNK / 2 - centreX;
      const dyb = b.cy * CHUNK + CHUNK / 2 - centreY;
      return dxa * dxa + dya * dya - (dxb * dxb + dyb * dyb) || a.cy - b.cy || a.cx - b.cx;
    });
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) {
      for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
        if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
        const chunk = world.chunk(cx, cy, false);
        if (chunk) this.nearby.push(chunk);
      }
    }
    this.cache.update(this.visible, this.nearby, frame);
    this.updateLife(frame);
    this.groundMs = performance.now() - start;
  }

  /** Dessine le sol visible : un canevas peint, ou un aplat en attendant. */
  drawGround(ctx: CanvasRenderingContext2D): void {
    for (const chunk of this.visible) {
      const image = this.cache.get(chunk);
      const X = chunk.cx * BLOCK_PX;
      const Y = chunk.cy * BLOCK_PX;
      if (image) {
        ctx.drawImage(image, X, Y);
      } else {
        ctx.fillStyle = mostlyWater(chunk) ? C.q4 : C.m2;
        ctx.fillRect(X, Y, BLOCK_PX, BLOCK_PX);
      }
    }
  }

  /** Dessine la vie du sol à l'instant d'animation de la maquette. */
  drawLife(ctx: CanvasRenderingContext2D, view: PixelView, anim: number): void {
    const P = pen(ctx);
    const x0 = view.tileX0 * TILE_PX;
    const y0 = view.tileY0 * TILE_PX;
    const x1 = (view.tileX1 + 1) * TILE_PX;
    const y1 = (view.tileY1 + 1) * TILE_PX;
    for (const chunk of this.visible) {
      const entry = this.life.get(chunk);
      if (!entry) continue;
      drawGroundLife(P, entry.life, anim, x0, y0, x1, y1, this.blocked);
    }
  }

  /** Vrai si une case porte une entité, une dalle, un gisement ou un arbre. */
  readonly blocked = (tx: number, ty: number): boolean => {
    const world = this.world;
    if (!world) return false;
    const chunk = world.at(tx, ty, false);
    if (!chunk) return false;
    const i = ((ty & 31) << 5) | (tx & 31);
    return (
      chunk.ent[i] !== 0 ||
      chunk.slab[i] !== 0 ||
      chunk.deposit[i] !== 0 ||
      chunk.canopy[i] >= TREE_MIN
    );
  };

  /** Écrit les codes de dalle et de débris d'un bloc et de sa marge de cases. */
  readCodes(world: World, chunk: Chunk, out: Uint8Array): void {
    const bx = chunk.cx * CHUNK;
    const by = chunk.cy * CHUNK;
    for (let cy = 0; cy < CODES; cy++) {
      const y = by + cy - 1;
      for (let cx = 0; cx < CODES; cx++) {
        const x = bx + cx - 1;
        const inside = cx >= 1 && cx <= CHUNK && cy >= 1 && cy <= CHUNK;
        const c = inside ? chunk : world.at(x, y, false);
        const i = ((y & 31) << 5) | (x & 31);
        out[cy * CODES + cx] = c ? c.slab[i] | (c.loot[i] << 1) : 0;
      }
    }
  }

  /** Peint un rectangle local de cases, ramené aux coordonnées monde du bloc. */
  private paintRect(
    world: World,
    chunk: Chunk,
    out: Uint8ClampedArray,
    tx0: number,
    ty0: number,
    tx1: number,
    ty1: number,
  ): void {
    const bx = chunk.cx * CHUNK;
    const by = chunk.cy * CHUNK;
    this.readSlab(world, chunk);
    const source: GroundSource = {
      seed: world.seed,
      originX: bx,
      originY: by,
      shore: chunk.shore,
      ford: chunk.ford,
      paths: this.pathsFor(world, chunk),
      slab: this.slab,
      loot: chunk.loot,
    };
    paintTiles(source, out, bx + tx0, by + ty0, bx + tx1, by + ty1);
  }

  /** Lit la marge de dalles d'un bloc dans le tampon réutilisé. */
  private readSlab(world: World, chunk: Chunk): void {
    const bx = chunk.cx * CHUNK;
    const by = chunk.cy * CHUNK;
    for (let cy = 0; cy < CODES; cy++) {
      const y = by + cy - 1;
      for (let cx = 0; cx < CODES; cx++) {
        const x = bx + cx - 1;
        const inside = cx >= 1 && cx <= CHUNK && cy >= 1 && cy <= CHUNK;
        const c = inside ? chunk : world.at(x, y, false);
        this.slab[cy * CODES + cx] = c ? c.slab[((y & 31) << 5) | (x & 31)] : 0;
      }
    }
  }

  /** Les sentiers d'un bloc, calculés une seule fois tant que le bloc vit. */
  private pathsFor(world: World, chunk: Chunk): readonly GroundPathSegment[] {
    const hit = this.paths.get(chunk);
    if (hit) return hit;
    const paths = world.pathSegments(chunk.cx, chunk.cy);
    this.paths.set(chunk, paths);
    return paths;
  }

  /** Marque les blocs vus et calcule la vie d'un seul bloc nouveau par image. */
  private updateLife(frame: number): void {
    let target: Chunk | null = null;
    for (const chunk of this.visible) {
      const entry = this.life.get(chunk);
      if (entry) entry.seen = frame;
      else if (!target && this.cache.get(chunk)) target = chunk;
    }
    for (const chunk of this.nearby) {
      const entry = this.life.get(chunk);
      if (entry) entry.seen = frame;
    }
    if (target && this.world) {
      const world = this.world;
      const life = layoutLife({
        seed: world.seed,
        originX: target.cx * CHUNK,
        originY: target.cy * CHUNK,
        shore: target.shore,
        ground: target.ground,
      });
      this.life.set(target, { life, seen: frame });
    }
    for (const [chunk, entry] of this.life) {
      if (frame - entry.seen > LIFE_TTL) this.life.delete(chunk);
    }
  }
}
