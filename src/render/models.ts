// Maquettes des bâtiments : du béton brut en volumes simples (boîtes, cylindres, anneaux),
// une touche d'acier, et une seule lumière chaude par machine. Tout est construit par code.
// Repère local : origine au centre de l'emprise, X = sortie (est), Z = sud, Y = haut.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingDef, Category } from '../sim/data';

// béton (clair → sombre), acier, verre, terre
const C1 = '#B9B6AC', C2 = '#9E9B92', C3 = '#827F77', C4 = '#615F5A';
const S1 = '#4C5057', S2 = '#2F3236', GL = '#2B4A5A', RU = '#8A4B2D', DK = '#1B1A18';
const LAMP = '#FFFFFF';   // les lampes sont teintées par instance

export type Group = 'body' | 'lamp' | 'rotor';
interface Part { geo: THREE.BufferGeometry; color: string; grp: Group; }

class Kit {
  parts: Part[] = [];
  private add(geo: THREE.BufferGeometry, color: string, grp: Group): this {
    this.parts.push({ geo, color, grp });
    return this;
  }
  /** Boîte posée : (x, z) centre, y0 base. */
  box(x: number, y0: number, z: number, w: number, h: number, d: number, color = C2, grp: Group = 'body', ry = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y0 + h / 2, z);
    return this.add(g, color, grp);
  }
  cyl(x: number, y0: number, z: number, r: number, h: number, color = C2, grp: Group = 'body', rTop = r, seg = 20): this {
    const g = new THREE.CylinderGeometry(rTop, r, h, seg);
    g.translate(x, y0 + h / 2, z);
    return this.add(g, color, grp);
  }
  /** Anneau creux (mur circulaire) : rayon intérieur, extérieur, hauteur. */
  ring(x: number, y0: number, z: number, rIn: number, rOut: number, h: number, color = C2, grp: Group = 'body'): this {
    const pts = [new THREE.Vector2(rIn, 0), new THREE.Vector2(rOut, 0), new THREE.Vector2(rOut, h), new THREE.Vector2(rIn, h), new THREE.Vector2(rIn, 0)];
    const g = new THREE.LatheGeometry(pts, 28);
    g.translate(x, y0, z);
    return this.add(g, color, grp);
  }
  dome(x: number, y0: number, z: number, r: number, squash = 1, color = C2, grp: Group = 'body'): this {
    const g = new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(1, squash, 1); g.translate(x, y0, z);
    return this.add(g, color, grp);
  }
  ball(x: number, y: number, z: number, r: number, color = C2, grp: Group = 'body'): this {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(x, y, z);
    return this.add(g, color, grp);
  }
  /** Socle + goulotte de sortie côté est : commun à toutes les machines. */
  base(w: number, d: number, port = true): this {
    this.box(0, 0, 0, w - 0.08, 0.14, d - 0.08, C3);
    if (port) { this.box(w / 2 - 0.14, 0.14, 0, 0.28, 0.2, 0.56, S2); this.box(w / 2 - 0.03, 0.2, 0, 0.06, 0.1, 0.4, LAMP, 'lamp'); }
    return this;
  }
  /** Lames verticales répétées : le motif brutaliste par excellence. */
  fins(x: number, y0: number, z: number, n: number, span: number, w: number, h: number, d: number, alongX: boolean, color = C4): this {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * span;
      this.box(alongX ? x + t : x, y0, alongX ? z : z + t, w, h, d, color);
    }
    return this;
  }
}

type Builder = (k: Kit, level: number) => void;

const MODELS: Record<string, Builder> = {
  tour(k, level) {
    // une tour à gradins qui gagne un étage à chaque quota
    k.box(0, 0, 0, 2.9, 0.3, 2.9, C3);
    const n = 4 + Math.min(10, level);
    let y = 0.3, s = 2.5;
    for (let i = 0; i < n; i++) {
      const h = i === 0 ? 1.0 : 0.62;
      k.box(0, y, 0, s, h, s, i % 2 ? C2 : C1);
      k.fins(0, y + 0.08, s / 2, 5, s * 0.7, 0.12, h - 0.16, 0.1, true);
      k.fins(0, y + 0.08, -s / 2, 5, s * 0.7, 0.12, h - 0.16, 0.1, true);
      k.fins(s / 2, y + 0.08, 0, 5, s * 0.7, 0.1, h - 0.16, 0.12, false);
      k.fins(-s / 2, y + 0.08, 0, 5, s * 0.7, 0.1, h - 0.16, 0.12, false);
      y += h;
      if (i % 2 === 1) k.box(0, y, 0, s + 0.16, 0.08, s + 0.16, C4);
      s = Math.max(1.1, s - 0.2);
    }
    k.box(0, y, 0, 0.5, 0.5, 0.5, S1);
    k.box(0, y + 0.5, 0, 0.34, 0.34, 0.34, LAMP, 'lamp');
    k.cyl(0, y + 0.84, 0, 0.03, 0.9, S2);
    // quatre portes : la Tour reçoit de tous les côtés
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) k.box(dx * 1.28, 0.3, dz * 1.28, dx ? 0.1 : 0.9, 0.5, dx ? 0.9 : 0.1, LAMP, 'lamp');
  },
  puits(k) {
    k.box(0, 0, 0, 2.92, 0.1, 2.92, C3);
    k.ring(0, 0.1, 0, 1.12, 1.44, 0.46, C2);
    k.ring(0, 0.1, 0, 0.8, 1.12, 0.24, C4);
    k.cyl(0, 0.1, 0, 0.8, 0.06, DK);
    k.cyl(0, 0.12, 0, 0.3, 0.1, LAMP, 'lamp');
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.box(Math.cos(a) * 0.55, 0.62, Math.sin(a) * 0.55, 1.1, 0.1, 0.16, S1, 'rotor', -a); }
    k.cyl(0, 0.5, 0, 0.2, 0.3, S2, 'rotor');
    k.box(1.3, 0.1, 0, 0.3, 0.5, 0.6, S2); k.box(1.43, 0.2, 0, 0.06, 0.1, 0.4, LAMP, 'lamp');
  },
  foreuse(k) {
    k.box(0, 0, 0, 2.92, 0.1, 2.92, C3);
    k.ring(0, 0.1, 0, 1.0, 1.44, 0.6, C1);
    k.cyl(0, 0.1, 0, 1.0, 0.06, DK);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.box(x * 0.95, 0.1, z * 0.95, 0.3, 1.6, 0.3, C4);
    k.box(0, 1.5, 0, 2.2, 0.2, 2.2, C3);
    k.cyl(0, 0.2, 0, 0.26, 1.5, S1, 'rotor', 0.1, 8);
    k.box(0, 1.7, 0, 0.5, 0.25, 0.5, LAMP, 'lamp');
    k.box(1.43, 0.2, 0, 0.06, 0.1, 0.4, LAMP, 'lamp');
  },
  scierie(k) {
    k.base(2, 2);
    k.box(-0.15, 0.14, 0, 1.4, 0.55, 1.6, C2);
    k.box(-0.15, 0.69, 0, 1.5, 0.08, 1.7, C4);
    k.cyl(-0.15, 0.82, 0, 0.62, 0.05, S1, 'rotor', 0.62, 14);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.box(-0.15 + Math.cos(a) * 0.64, 0.82, Math.sin(a) * 0.64, 0.14, 0.05, 0.1, S2, 'rotor', -a); }
    k.cyl(-0.15, 0.77, 0, 0.12, 0.16, LAMP, 'lamp');
  },
  pompe(k) {
    k.base(2, 2);
    k.cyl(-0.1, 0.14, 0, 0.7, 0.5, C2);
    k.cyl(-0.1, 0.64, 0, 0.5, 0.2, S1);
    k.box(-0.1, 0.84, 0, 1.0, 0.08, 0.14, S2, 'rotor'); k.box(-0.1, 0.84, 0, 0.14, 0.08, 1.0, S2, 'rotor');
    k.cyl(-0.1, 0.84, 0, 0.14, 0.12, LAMP, 'lamp');
    k.cyl(-0.75, 0.14, 0.6, 0.12, 0.5, S1);
  },
  charbonniere(k) {
    k.base(2, 2);
    k.dome(-0.1, 0.14, 0, 0.82, 1.0, C3);
    k.cyl(-0.1, 0.8, 0, 0.14, 0.6, C4);
    k.box(0.62, 0.14, 0, 0.2, 0.4, 0.5, DK);
    k.box(0.7, 0.2, 0, 0.06, 0.26, 0.36, LAMP, 'lamp');
  },
  haut_fourneau(k) {
    k.base(3, 3);
    k.cyl(0, 0.14, 0, 0.95, 0.9, C2, 'body', 0.8);
    k.cyl(0, 1.04, 0, 0.8, 0.9, C1, 'body', 0.55);
    k.cyl(0, 1.94, 0, 0.6, 0.12, C4);
    k.cyl(0, 2.06, 0, 0.42, 0.24, S1);
    k.ring(0, 0.95, 0, 0.82, 1.02, 0.08, S2);
    for (const z of [-1.0, 1.0]) { k.cyl(-0.9, 0.14, z, 0.3, 1.3, C3); k.dome(-0.9, 1.44, z, 0.3, 1, C3); }
    k.box(-0.9, 1.0, 0, 0.14, 0.14, 2.0, S1);
    k.box(0.9, 0.14, 0, 0.5, 0.36, 0.7, C4);
    k.box(1.1, 0.2, 0, 0.12, 0.2, 0.5, LAMP, 'lamp');
    k.cyl(0, 2.3, 0, 0.3, 0.05, LAMP, 'lamp');
  },
  four_chaux(k) {
    k.base(2, 2);
    k.box(-0.2, 0.14, 0, 1.1, 1.3, 1.1, C1);
    k.fins(-0.2, 0.3, 0.55, 4, 0.8, 0.1, 1.0, 0.08, true);
    k.fins(-0.2, 0.3, -0.55, 4, 0.8, 0.1, 1.0, 0.08, true);
    k.box(-0.2, 1.44, 0, 0.6, 0.3, 0.6, C3);
    k.box(0.5, 0.14, 0, 0.4, 0.5, 0.7, C4);
    k.box(0.36, 0.3, 0, 0.06, 0.3, 0.4, LAMP, 'lamp');
  },
  verrerie(k) {
    k.base(2, 2);
    k.box(-0.1, 0.14, 0, 1.6, 0.6, 1.7, C2);
    for (let i = 0; i < 3; i++) { k.box(-0.6 + i * 0.5, 0.74, 0, 0.36, 0.3, 1.7, C1); k.box(-0.44 + i * 0.5, 0.74, 0, 0.08, 0.26, 1.5, GL); }
    k.cyl(-0.6, 0.74, 0.5, 0.12, 0.7, C4);
    k.box(0.72, 0.3, 0, 0.06, 0.2, 0.9, LAMP, 'lamp');
  },
  fonderie(k) {
    k.base(3, 2);
    k.box(-0.1, 0.14, 0, 2.5, 0.8, 1.6, C2);
    k.box(-0.1, 0.94, 0, 2.6, 0.1, 1.7, C4);
    for (const z of [-0.45, 0, 0.45]) { k.box(0.1, 1.0, z, 1.8, 0.05, 0.16, DK); k.box(0.1, 1.02, z, 1.7, 0.05, 0.1, LAMP, 'lamp'); }
    k.cyl(-1.05, 0.94, -0.45, 0.2, 1.3, C3, 'body', 0.15);
    k.cyl(-1.05, 0.94, 0.45, 0.16, 0.8, C3);
  },
  four_arc(k) {
    k.base(3, 3);
    k.cyl(0, 0.14, 0, 1.15, 0.8, S1);
    k.ring(0, 0.94, 0, 0.75, 1.2, 0.12, C3);
    k.cyl(0, 0.9, 0, 0.74, 0.06, LAMP, 'lamp');
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; k.cyl(Math.cos(a) * 0.35, 0.9, Math.sin(a) * 0.35, 0.09, 1.1, S2); }
    k.box(-1.05, 0.14, -1.05, 0.7, 1.0, 0.7, C2); k.fins(-1.05, 0.3, -0.7, 3, 0.4, 0.08, 0.7, 0.06, true);
    k.box(-1.05, 0.14, 1.05, 0.7, 0.7, 0.7, C1);
  },
  presse(k) {
    k.base(3, 2);
    k.box(-0.1, 0.14, 0, 2.5, 0.5, 1.6, C1);
    k.box(-0.9, 0.64, 0, 0.5, 0.7, 1.4, C3); k.box(0.5, 0.64, 0, 0.5, 0.7, 1.4, C3);
    k.box(-0.2, 1.2, 0, 2.0, 0.2, 1.5, C2);
    k.box(-0.2, 0.7, 0, 0.8, 0.4, 1.0, S1);
    k.box(-0.2, 0.64, 0, 0.6, 0.06, 0.8, LAMP, 'lamp');
  },
  convertisseur(k) {
    k.base(3, 3);
    k.box(0, 0.14, 1.1, 2.2, 1.2, 0.4, C2); k.box(0, 0.14, -1.1, 2.2, 1.2, 0.4, C2);
    k.cyl(0, 0.5, 0, 0.75, 0.9, S1, 'body', 0.6);
    k.dome(0, 1.4, 0, 0.6, 0.5, S1);
    k.cyl(0, 1.66, 0, 0.3, 0.06, LAMP, 'lamp');
    k.box(0, 0.9, 0, 0.2, 0.2, 2.0, S2);
    k.box(-1.1, 0.14, 0, 0.5, 0.8, 1.0, C3);
  },
  atelier(k) {
    k.base(3, 3);
    k.box(0, 0.14, 0, 2.7, 0.75, 2.7, C1);
    k.box(0, 0.89, 0, 2.8, 0.08, 2.8, C4);
    for (const x of [-0.8, 0, 0.8]) for (const z of [-0.8, 0, 0.8]) k.box(x, 0.97, z, 0.5, 0.08, 0.5, GL);
    k.box(-0.9, 0.97, 0.9, 0.5, 0.4, 0.5, C3);
    k.box(1.36, 0.4, 0, 0.06, 0.2, 1.6, LAMP, 'lamp');
  },
  cloitre(k) {
    k.box(0, 0, 0, 2.92, 0.14, 2.92, C3);
    k.ring(0, 0.14, 0, 0.95, 1.42, 1.0, C1);
    k.ring(0, 1.14, 0, 0.9, 1.46, 0.1, C4);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; k.box(Math.cos(a) * 0.9, 0.14, Math.sin(a) * 0.9, 0.12, 1.0, 0.12, C3, 'body', -a); }
    k.cyl(0, 0.14, 0, 0.9, 0.04, DK);
    k.cyl(0, 0.18, 0, 0.26, 0.2, LAMP, 'lamp');
    k.box(0, 0.5, 0, 1.6, 0.1, 0.14, S1, 'rotor');
    k.box(1.43, 0.2, 0, 0.06, 0.1, 0.4, LAMP, 'lamp');
  },
  epurateur(k) {
    k.base(2, 2);
    k.cyl(-0.25, 0.14, -0.2, 0.48, 2.2, C1, 'body', 0.4);
    k.ring(-0.25, 2.3, -0.2, 0.3, 0.44, 0.1, C4);
    k.cyl(-0.25, 2.2, -0.2, 0.28, 0.06, LAMP, 'lamp');
    k.cyl(0.4, 0.14, 0.45, 0.3, 0.9, C3);
    k.box(-0.4, 0.14, 0.55, 0.7, 0.5, 0.5, C2);
    k.box(0.1, 1.0, 0.1, 0.7, 0.1, 0.1, S1);
  },
  platriere(k) {
    k.base(2, 2);
    k.box(-0.1, 0.14, 0, 1.6, 0.6, 1.6, C2);
    k.cyl(-0.3, 0.74, -0.3, 0.2, 0.5, C1, 'body', 0.5);
    k.cyl(0.3, 0.74, 0.3, 0.2, 0.5, C1, 'body', 0.5);
    k.box(0.72, 0.3, 0, 0.06, 0.2, 0.8, LAMP, 'lamp');
  },
  electrolyseur(k) {
    k.base(2, 2);
    for (let i = 0; i < 4; i++) k.box(-0.6 + i * 0.36, 0.14, -0.3, 0.26, 0.8, 0.9, i % 2 ? S1 : C3);
    k.cyl(-0.4, 0.14, 0.6, 0.26, 1.1, C1); k.cyl(0.25, 0.14, 0.6, 0.26, 1.1, C1);
    k.box(-0.08, 0.94, -0.3, 1.4, 0.06, 0.2, LAMP, 'lamp');
  },
  reacteur(k) {
    k.base(3, 3);
    k.cyl(0, 0.14, 0, 0.6, 2.1, S1);
    k.dome(0, 2.24, 0, 0.6, 0.7, S1);
    for (const y of [0.6, 1.2, 1.8]) k.ring(0, y, 0, 0.6, 0.68, 0.1, C4);
    k.box(-1.0, 0.14, -0.9, 0.8, 0.9, 0.8, C2); k.box(-1.0, 0.14, 0.9, 0.8, 0.6, 0.8, C1);
    k.box(-0.5, 1.0, 0, 0.9, 0.1, 0.1, S2);
    k.box(0.9, 0.14, 0, 0.5, 0.5, 1.2, C3);
    k.cyl(0, 2.66, 0, 0.14, 0.1, LAMP, 'lamp');
  },
  usine_engrais(k) {
    k.base(3, 2);
    k.box(0.4, 0.14, 0, 1.5, 0.7, 1.6, C2);
    k.box(0.4, 0.84, 0, 1.6, 0.08, 1.7, C4);
    for (const z of [-0.42, 0.42]) { k.cyl(-0.85, 0.14, z, 0.38, 1.0, C1); k.cyl(-0.85, 1.14, z, 0.38, 0.3, C3, 'body', 0.1); }
    k.box(1.2, 0.3, 0, 0.06, 0.2, 0.9, LAMP, 'lamp');
  },
  amphi(k) {
    k.box(0, 0, 0, 1.92, 0.1, 1.92, C3);
    k.ring(0, 0.1, 0, 0.78, 0.95, 0.9, C2);
    k.ring(0, 0.1, 0, 0.58, 0.78, 0.6, C1);
    k.ring(0, 0.1, 0, 0.38, 0.58, 0.32, C2);
    k.cyl(0, 0.1, 0, 0.38, 0.06, DK);
    k.cyl(0, 0.16, 0, 0.26, 0.14, LAMP, 'lamp');
  },
  heliostat(k) {
    k.box(0, 0, 0, 0.9, 0.08, 0.9, C3);
    k.cyl(0, 0.08, 0, 0.06, 0.3, S1);
    const g = new THREE.BoxGeometry(0.84, 0.04, 0.84); g.rotateX(0.35); g.translate(0, 0.42, 0);
    k.parts.push({ geo: g, color: '#3D6E8C', grp: 'body' });
    const g2 = new THREE.BoxGeometry(0.7, 0.045, 0.1); g2.rotateX(0.35); g2.translate(0, 0.43, 0);
    k.parts.push({ geo: g2, color: LAMP, grp: 'lamp' });
  },
  eolienne(k) {
    k.box(0, 0, 0, 1.6, 0.14, 1.6, C3);
    k.cyl(0, 0.14, 0, 0.16, 2.9, C1, 'body', 0.1);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.box(Math.cos(a) * 0.6, 1.2, Math.sin(a) * 0.6, 0.08, 1.7, 0.3, C1, 'rotor', -a);
      k.box(Math.cos(a) * 0.3, 2.0, Math.sin(a) * 0.3, 0.6, 0.05, 0.06, S1, 'rotor', -a);
    }
    k.cyl(0, 3.04, 0, 0.08, 0.1, LAMP, 'lamp');
  },
  turbine(k) {
    k.base(2, 2, false);
    k.box(0, 0.14, 0, 1.5, 0.5, 1.5, C2);
    k.ring(0, 0.64, 0, 0.45, 0.7, 0.16, C4);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.box(Math.cos(a) * 0.24, 0.68, Math.sin(a) * 0.24, 0.42, 0.08, 0.1, S1, 'rotor', -a); }
    k.cyl(0, 0.66, 0, 0.1, 0.14, LAMP, 'lamp');
  },
  accu(k) {
    k.base(2, 2, false);
    for (const x of [-0.42, 0.42]) for (const z of [-0.42, 0.42]) { k.box(x, 0.14, z, 0.7, 0.75, 0.7, S1); k.box(x, 0.89, z, 0.5, 0.05, 0.12, LAMP, 'lamp'); }
  },
  pile(k) {
    k.base(2, 2, false);
    k.box(0, 0.14, 0, 1.6, 0.9, 1.3, C2);
    k.fins(0, 0.2, 0.68, 7, 1.3, 0.08, 0.8, 0.1, true, S1);
    k.fins(0, 0.2, -0.68, 7, 1.3, 0.08, 0.8, 0.1, true, S1);
    k.box(0, 1.04, 0, 1.2, 0.06, 0.2, LAMP, 'lamp');
  },
  serre(k) {
    k.base(3, 3);
    k.box(0, 0.14, 0, 2.7, 0.2, 2.7, C2);
    for (const x of [-0.8, 0, 0.8]) for (const z of [-0.8, 0, 0.8]) k.ball(x, 0.5, z, 0.3, '#4F9A55');
    for (const x of [-1.3, 1.3]) k.box(x, 0.34, 0, 0.08, 0.8, 2.7, S1);
    for (const z of [-1.3, 0, 1.3]) k.box(0, 1.1, z, 2.7, 0.06, 0.08, S1);
    k.box(0, 1.16, 0, 0.3, 0.06, 2.4, LAMP, 'lamp');
  },
  semeur(k) {
    k.base(2, 2, false);
    k.cyl(0, 0.14, 0, 0.6, 0.5, C2);
    k.cyl(0, 0.64, 0, 0.1, 0.5, S1);
    k.box(0, 1.1, 0, 1.7, 0.06, 0.1, S1, 'rotor');
    k.cyl(0, 1.14, 0, 0.12, 0.1, LAMP, 'lamp');
  },
  cerclage(k) {
    k.ring(0, 0, 0, 1.2, 1.45, 0.4, C1);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.785; k.box(Math.cos(a) * 1.32, 0, Math.sin(a) * 1.32, 0.3, 0.7, 0.3, C3, 'body', -a); }
    k.box(1.43, 0.14, 0, 0.06, 0.12, 0.4, LAMP, 'lamp');
  },
  eventail(k) {
    k.cyl(0, 0, 0, 0.22, 1.6, '#3A2E22', 'body', 0.14, 8);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const g = new THREE.ConeGeometry(0.34, 1.9, 4);
      g.scale(1, 1, 0.22); g.rotateZ(-Math.PI / 2 + 0.28); g.translate(0.95, 1.75, 0); g.rotateY(a);
      k.parts.push({ geo: g, color: i % 2 ? '#3FA36A' : '#2F8F5A', grp: 'body' });
    }
    k.ball(0, 1.75, 0, 0.3, LAMP, 'lamp');
  },
  entrepot(k) {
    k.base(2, 2);
    k.box(-0.08, 0.14, 0, 1.6, 1.0, 1.7, C2);
    k.box(-0.08, 1.14, 0, 1.7, 0.1, 1.8, C4);
    k.fins(-0.08, 0.2, 0.86, 4, 1.2, 0.26, 0.7, 0.04, true, S2);
    k.fins(-0.08, 0.2, -0.86, 4, 1.2, 0.26, 0.7, 0.04, true, S2);
  },
  aiguillage(k) {
    k.box(0, 0, 0, 0.92, 0.22, 0.92, S1);
    k.cyl(0, 0.22, 0, 0.3, 0.08, C3);
    k.box(0.12, 0.3, 0, 0.3, 0.04, 0.08, LAMP, 'lamp'); k.box(0, 0.3, 0, 0.08, 0.04, 0.5, LAMP, 'lamp');
  },
  trieur(k) {
    k.box(0, 0, 0, 0.92, 0.22, 0.92, S1);
    k.box(0, 0.22, 0, 0.5, 0.2, 0.5, C2);
    k.box(0, 0.42, 0, 0.3, 0.06, 0.3, LAMP, 'lamp');
  },
  pont(k) {
    k.box(0, 0, 0, 0.96, 0.1, 0.8, S2);
    const g = new THREE.BoxGeometry(1.0, 0.08, 0.7); g.rotateZ(0.42); g.translate(0.05, 0.3, 0);
    k.parts.push({ geo: g, color: S1, grp: 'body' });
    k.box(0.42, 0, 0.36, 0.1, 0.56, 0.08, C3); k.box(0.42, 0, -0.36, 0.1, 0.56, 0.08, C3);
  },
  lampadaire(k) {
    k.box(0, 0, 0, 0.3, 0.1, 0.3, C3);
    k.cyl(0, 0.1, 0, 0.04, 1.3, S2);
    k.box(0, 1.4, 0, 0.3, 0.06, 0.3, S1);
    k.box(0, 1.3, 0, 0.2, 0.1, 0.2, LAMP, 'lamp');
  },
};

export interface Model { body: THREE.BufferGeometry; lamp: THREE.BufferGeometry | null; rotor: THREE.BufferGeometry | null; }

function finish(parts: Part[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  const col = new THREE.Color();
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    col.set(p.color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  merged.computeVertexNormals();
  return merged;
}

const cache = new Map<string, Model>();

/** Géométries fusionnées d'un bâtiment (corps, lampes, parties tournantes). */
export function modelFor(key: string, level = 0): Model {
  const id = key === 'tour' ? `tour${Math.min(10, level)}` : key;
  let m = cache.get(id);
  if (m) return m;
  const k = new Kit();
  (MODELS[key] ?? ((kk: Kit) => kk.base(1, 1)))(k, level);
  m = {
    body: finish(k.parts.filter((p) => p.grp === 'body'))!,
    lamp: finish(k.parts.filter((p) => p.grp === 'lamp')),
    rotor: finish(k.parts.filter((p) => p.grp === 'rotor')),
  };
  cache.set(id, m);
  return m;
}

/** Couleur de la lumière d'une machine : chaude pour l'industrie, verte pour la chimie, turquoise pour le vivant. */
export function lampColor(def: BuildingDef): string {
  const byCat: Record<Category, string> = { logistique: '#FFB060', extraction: '#FFA040', fonte: '#FF8A30', assemblage: '#FFB868', chimie: '#D8EC5A', energie: '#FFD070', vivant: '#7FF0D2' };
  if (def.kind === 'tree') return '#7FF0D2';
  if (def.kind === 'hub') return '#FFB050';
  return def.cat ? byCat[def.cat] : '#FFA040';
}

/** Vitesse de rotation des parties mobiles (rad/s). */
export const ROTOR_SPEED: Record<string, number> = { puits: 1.2, foreuse: 6, scierie: 7, pompe: 3, cloitre: 1.5, eolienne: 2.2, turbine: 4, semeur: 2 };
