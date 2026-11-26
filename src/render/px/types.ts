/**
 * Les types partagés du rendu pixel : la caméra, la vue d'un bâtisseur, les options d'une image,
 * une onde et le tracé d'un convoyeur. Ils sont partagés par le rendu, l'interface et le banc.
 */
import type { Ent } from '../../sim/ent';
import type { MotionResult } from './builderMotion';

/** La caméra : le point du monde au centre de l'écran, et le zoom en pixels par case. */
export interface Camera { x: number; y: number; zoom: number; }

/** Le bâtisseur tel que le rendu le voit : sa pose, son outil et ce qu'il vise. */
export interface PlayerView {
  x: number; y: number; fx: number; fy: number;   // position, direction du regard
  walk: number;        // phase de marche
  speed: number;       // 0..1
  color: string;
  swing: number;       // 0..1 : coup de pioche en cours
  lean: number;        // inertie des antennes
  blink: number;
  cx: number; cy: number;              // case visée
  tool: string | null; rot: number; ox: number; oy: number; ok: boolean;
  gx: number; gy: number; gprog: number;   // récolte en cours : case et avancement (0 = aucune)
  beam: number;                        // 0..1 : éclair de construction vers la case visée
  route: RouteView[] | null;           // tracé de convoyeur en cours (posé au relâchement)
  routeInto: boolean;                  // son bout se déverse dans une machine ou un tapis
  motion?: MotionResult | null;        // l'image du bâtisseur boxeur en rendu pixel
  strikeTile?: { readonly x: number; readonly y: number } | null;   // case frappée pendant un coup, pour rester devant sa cible
  prey?: { readonly kind: 'beast' | 'wreck'; readonly id: number } | null;   // bête ou épave visée à mains nues (lot 8g la remplit, 8f la souligne)
}

/** Une case du tracé d'un convoyeur : où, dans quel sens, et si elle peut être posée. */
export interface RouteView { x: number; y: number; dir: number; ok: boolean; }

/** Une onde qui s'élargit depuis un point du monde. */
export interface Ring { x: number; y: number; t0: number; color: string; size: number; dur: number; }

/** Tout ce qu'il faut pour dessiner une image du monde. */
export interface RenderOpts {
  time: number; frame: number; dt: number; players: PlayerView[];
  selected: Ent | null; hover: Ent | null; rings: Ring[]; marker: { x: number; y: number } | null;
}
