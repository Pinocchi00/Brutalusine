// Vignettes des bâtiments pour l'interface : chaque maquette est photographiée une fois, en petit.

import * as THREE from 'three';
import { B } from '../sim/data';
import { modelFor, lampColor } from './models';

const cache = new Map<string, string>();
let gl: THREE.WebGLRenderer | null = null;

export function buildingIcon(key: string): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 112;
  if (!gl) {
    gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    gl.setSize(size, size, false);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
  }
  const def = B[key];
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a4438, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  if (key === 'convoyeur') {
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.74), new THREE.MeshStandardMaterial({ color: 0x3a3d42 })));
    for (const [x, c] of [[-0.5, 0xc8502a], [0, 0xb8c0cc], [0.5, 0x8fe6ff]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.27), new THREE.MeshStandardMaterial({ color: c }));
      m.position.set(x, 0.2, 0); scene.add(m);
    }
  } else if (key === 'dalle') {
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), new THREE.MeshStandardMaterial({ color: 0xa9a69d })));
  } else {
    const model = modelFor(key);
    scene.add(new THREE.Mesh(model.body, body));
    if (model.rotor) scene.add(new THREE.Mesh(model.rotor, body));
    if (model.lamp) scene.add(new THREE.Mesh(model.lamp, new THREE.MeshBasicMaterial({ color: lampColor(def) })));
  }
  const span = key === 'convoyeur' ? 1.5 : Math.max(def.w, def.h, def.height * 0.75, 1);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const d = span * 2.75;
  cam.position.set(d * 0.55, d * 0.72, d * 0.62);
  cam.lookAt(0, Math.min(1.2, def.height * 0.32), 0);
  gl.render(scene, cam);
  const url = gl.domElement.toDataURL();
  cache.set(key, url);
  return url;
}
