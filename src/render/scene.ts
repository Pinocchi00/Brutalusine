// La scène : une maquette en 3D vue de haut. Béton brut contre jungle saturée, ombres longues,
// une lumière chaude par machine, flou de profondeur sur les bords (effet miniature).

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { B, DEPOSITS, DX, DY, ITEMS, TILE_U, BELT_SPEED, type Shape } from '../sim/data';
import { ACCU_CAP, SCRUB_RANGE, SEED_RANGE, type Game } from '../sim/game';
import { Status, type Ent } from '../sim/ent';
import { itemPosition, outputPorts } from '../sim/belts';
import { CHUNK, GROUND_WATER, type Chunk } from '../sim/world';
import { hash01, hash2 } from '../sim/rng';
import { modelFor, lampColor, ROTOR_SPEED } from './models';

export interface FxRing { x: number; y: number; t0: number; color: string; size: number; dur: number; }
export interface FrameOpts {
  time: number; dt: number; frame: number;
  camX: number; camY: number; dist: number;
  tool: string | null; rot: number; originX: number; originY: number; cellX: number; cellY: number;
  ghostOk: boolean; demolish: boolean;
  hover: Ent | null; selected: Ent | null;
  cursors: { x: number; y: number; color: string }[];
  rings: FxRing[];
  marker: { x: number; y: number } | null;
  tilt: boolean;
}

const PITCH = (57 * Math.PI) / 180;
const TREE_GREENS = ['#2E7D3A', '#3A8F45', '#4FA64E', '#2A6B3D', '#5DAA3F', '#237A4B', '#3F9A5A'];
const SLAB_COLS = ['#A9A69D', '#A19E95', '#B0ADA4', '#9A978F'];
const SHAPES: Shape[] = ['bloc', 'boule', 'gemme', 'lingot', 'bonbonne'];

const TiltShift = {
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, amount: { value: 2.4 }, vig: { value: 0.9 }, warm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 res; uniform float amount; uniform float vig; uniform float warm; varying vec2 vUv;
    void main(){
      float d = abs(vUv.y - 0.54);
      float b = smoothstep(0.26, 0.56, d) * amount;
      vec3 c = vec3(0.0); float w = 0.0;
      for (int i = -4; i <= 4; i++) for (int j = -2; j <= 2; j++) {
        vec2 o = vec2(float(j) * 1.3, float(i)) * b / res;
        float k = 1.0 - (abs(float(i)) + abs(float(j))) / 8.0;
        c += texture2D(tDiffuse, vUv + o).rgb * k; w += k;
      }
      c /= w;
      vec2 q = vUv - 0.5;
      c *= 1.0 - vig * dot(q, q);
      c = mix(c, c * vec3(1.06, 1.0, 0.92), warm);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = false): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

interface ChunkView {
  ground: THREE.Mesh; water: THREE.Mesh | null; slabs: THREE.InstancedMesh; trees: THREE.InstancedMesh;
  rocks: THREE.InstancedMesh; glow: THREE.InstancedMesh; version: number; seen: number; painted: number;
}
interface Batch { body: THREE.InstancedMesh; lamp: THREE.InstancedMesh | null; rotor: THREE.InstancedMesh | null; ents: Ent[]; cap: number; color: THREE.Color; }

export class Scene3D {
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 1, 700);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private tilt: ShaderPass;
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0x8fb4d8, 0x3a4a30, 0.6);
  private towerLight = new THREE.PointLight(0xffa040, 0, 34, 1.7);
  private chunks = new Map<Chunk, ChunkView>();
  private batches = new Map<string, Batch>();
  private seenVersion = -1;
  private tower: THREE.Mesh | null = null;
  private towerLamp: THREE.Mesh | null = null;
  private towerLevel = -1;
  private belts!: THREE.InstancedMesh;
  private beltCap = 0;
  private spans!: THREE.InstancedMesh;
  private items = new Map<Shape, { mesh: THREE.InstancedMesh; cap: number; n: number }>();
  private pools!: THREE.InstancedMesh;
  private poolCap = 0;
  private poolEnts: Ent[] = [];
  private ghost: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x8cfbe8, transparent: true, opacity: 0.55, depthWrite: false }));
  private ghostKey = '';
  private foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x8cfbe8, transparent: true, opacity: 0.3, depthWrite: false }));
  private arrow!: THREE.Mesh;
  private outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  private selectBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xff9a3c }));
  private range = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  private grid!: THREE.LineSegments;
  private marker = new THREE.Group();
  private fxRings: THREE.Mesh[] = [];
  private cursorMeshes: THREE.Mesh[] = [];
  private sprites: THREE.Sprite[] = [];
  private iconTex = new Map<string, THREE.Texture>();
  private smoke!: THREE.Points;
  private smokeData = { pos: new Float32Array(0), life: new Float32Array(0), vel: new Float32Array(0), next: 0, n: 500 };
  private mats!: { body: THREE.MeshStandardMaterial; lamp: THREE.MeshBasicMaterial; rotor: THREE.MeshStandardMaterial; tree: THREE.MeshStandardMaterial; ground: THREE.MeshStandardMaterial; slab: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial; rock: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial; belt: THREE.MeshStandardMaterial; item: THREE.MeshStandardMaterial };
  private geos!: { tree: THREE.BufferGeometry; slab: THREE.BufferGeometry; rock: THREE.BufferGeometry; glow: THREE.BufferGeometry; water: THREE.BufferGeometry };
  private itemGlow = { value: 0.2 };
  private beltTex!: THREE.CanvasTexture;
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3(1, 1, 1);
  private col = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  bounds = { x0: -40, x1: 40, y0: -40, y1: 40 };

  constructor(public canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.08;
    this.scene.fog = new THREE.FogExp2(0x8fa294, 0.0045);
    this.scene.background = new THREE.Color(0x8fa294);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target, this.hemi, this.towerLight);

    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.gl, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.3, 0.7, 0.92);
    this.composer.addPass(this.bloom);
    this.tilt = new ShaderPass(TiltShift);
    this.composer.addPass(this.tilt);
    this.composer.addPass(new OutputPass());

    this.makeMaterials();
    this.makeHelpers();
    this.resize();
  }

  // ------------------------------------------------------------ matériaux
  private makeMaterials(): void {
    // grain de béton : taches, traces de coffrage, trous de banche
    const concrete = canvasTex(256, (c, s) => {
      c.fillStyle = '#e9e9e9'; c.fillRect(0, 0, s, s);
      for (let i = 0; i < 2600; i++) {
        const v = 200 + Math.floor(hash01(i, 7, 1) * 55);
        c.fillStyle = `rgba(${v},${v},${v},0.35)`;
        c.fillRect(hash01(i, 1, 2) * s, hash01(i, 2, 3) * s, 1 + hash01(i, 3, 4) * 3, 1 + hash01(i, 4, 5) * 3);
      }
      c.fillStyle = 'rgba(120,120,120,0.16)';
      for (let y = 0; y < s; y += 32) c.fillRect(0, y, s, 1.5);
      c.fillStyle = 'rgba(70,70,70,0.3)';
      for (let y = 16; y < s; y += 64) for (let x = 16; x < s; x += 64) { c.beginPath(); c.arc(x, y, 2.2, 0, 6.3); c.fill(); }
    }, true);
    this.beltTex = canvasTex(64, (c, s) => {
      c.fillStyle = '#4a4e55'; c.fillRect(0, 0, s, s);
      c.fillStyle = '#26282c'; c.fillRect(0, 0, s, 7); c.fillRect(0, s - 7, s, 7);
      c.strokeStyle = '#6a6f78'; c.lineWidth = 3; c.lineJoin = 'miter';
      for (const x of [10, 42]) { c.beginPath(); c.moveTo(x, 22); c.lineTo(x + 8, 32); c.lineTo(x, 42); c.stroke(); }
    }, true);
    const itemMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });
    itemMat.onBeforeCompile = (sh) => {
      // chaque objet rayonne un peu de sa propre couleur : les convoyeurs restent lisibles la nuit
      sh.uniforms.uGlow = this.itemGlow;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor.rgb * uGlow;\n#endif');
    };
    this.mats = {
      body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.02, map: concrete }),
      lamp: new THREE.MeshBasicMaterial({ toneMapped: false }),
      rotor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }),
      tree: new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
      ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
      slab: new THREE.MeshStandardMaterial({ roughness: 0.95, map: concrete }),
      water: new THREE.MeshStandardMaterial({ color: 0x1d5560, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.86 }),
      rock: new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }),
      glow: new THREE.MeshBasicMaterial({ color: 0x7ff0d2, toneMapped: false }),
      belt: new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.75, metalness: 0.25 }),
      item: itemMat,
    };
    // un arbre : trois masses facettées, comme du papier plié
    const blobs: THREE.BufferGeometry[] = [];
    for (const [x, y, z, r] of [[0, 0.72, 0, 0.66], [0.34, 1.02, 0.12, 0.44], [-0.28, 0.94, -0.22, 0.4]]) {
      const g = new THREE.IcosahedronGeometry(r, 0); g.translate(x, y, z); blobs.push(g);
    }
    const tree = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const g of blobs) pos.push(...(g.attributes.position.array as Float32Array));
    tree.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    tree.computeVertexNormals();
    this.geos = {
      tree,
      slab: new THREE.BoxGeometry(0.985, 0.1, 0.985),
      rock: new THREE.DodecahedronGeometry(0.3, 0),
      glow: new THREE.IcosahedronGeometry(0.09, 0),
      water: new THREE.PlaneGeometry(CHUNK, CHUNK).rotateX(-Math.PI / 2),
    };
  }

  private makeHelpers(): void {
    const sc = this.scene;
    this.belts = this.newInstanced(new THREE.BoxGeometry(1, 0.1, 0.74), this.mats.belt, 2048, false, true);
    this.beltCap = 2048;
    this.spans = this.newInstanced(new THREE.BoxGeometry(1, 0.08, 0.62), this.mats.belt, 256, true, true);
    const geo: Record<Shape, THREE.BufferGeometry> = {
      bloc: new THREE.BoxGeometry(0.27, 0.27, 0.27), boule: new THREE.IcosahedronGeometry(0.17, 1), gemme: new THREE.OctahedronGeometry(0.2, 0),
      lingot: new THREE.BoxGeometry(0.38, 0.13, 0.22), bonbonne: new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10),
    };
    for (const s of SHAPES) {
      const mesh = this.newInstanced(geo[s], this.mats.item, 2048, false, false);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(2048 * 3), 3);
      this.items.set(s, { mesh, cap: 2048, n: 0 });
    }
    const glowTex = canvasTex(64, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, s, s);
    });
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 512);
    this.pools.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(512 * 3), 3);
    this.pools.frustumCulled = false; this.pools.count = 0; this.poolCap = 512; this.pools.renderOrder = 2;
    sc.add(this.pools);

    this.foot.rotation.x = -Math.PI / 2; this.foot.renderOrder = 3;
    const arrowTex = canvasTex(64, (c, s) => {
      c.fillStyle = '#ffb050'; c.beginPath(); c.moveTo(10, 14); c.lineTo(52, 32); c.lineTo(10, 50); c.lineTo(20, 32); c.closePath(); c.fill();
    });
    this.arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, depthWrite: false, toneMapped: false }));
    this.arrow.renderOrder = 4;
    const gp: number[] = [];
    for (let i = -14; i <= 14; i++) { gp.push(i, 0, -14, i, 0, 14, -14, 0, i, 14, 0, i); }
    this.grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, depthWrite: false }));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }));
    cone.position.y = 3.2;
    const mring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false }));
    mring.position.y = 0.2;
    this.marker.add(cone, mring);
    for (const o of [this.ghost, this.foot, this.arrow, this.outline, this.selectBox, this.range, this.grid, this.marker]) { o.visible = false; o.frustumCulled = false; sc.add(o); }
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      r.visible = false; r.renderOrder = 5; this.fxRings.push(r); sc.add(r);
    }
    // fumée : des points doux qui montent et dérivent
    const N = this.smokeData.n;
    this.smokeData.pos = new Float32Array(N * 3); this.smokeData.life = new Float32Array(N); this.smokeData.vel = new Float32Array(N * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokeData.pos, 3));
    sg.setAttribute('life', new THREE.BufferAttribute(this.smokeData.life, 1));
    this.smoke = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tint: { value: new THREE.Color(0x4a4a50) } },
      vertexShader: 'attribute float life; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (1.0 - life * 0.6) * 520.0 / -mv.z * (0.6 + life); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 tint; varying float vL; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * vL * 0.34; if (a < 0.01) discard; gl_FragColor = vec4(tint, a); }',
    }));
    this.smoke.frustumCulled = false; this.smoke.renderOrder = 6;
    sc.add(this.smoke);
  }

  private newInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, cast: boolean, receive: boolean): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.count = 0; m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false;
    this.scene.add(m);
    return m;
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    if (w < 2 || h < 2) return;          // fenêtre réduite : on garde la dernière taille valide
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.tilt.uniforms.res.value as THREE.Vector2).set(w * dpr, h * dpr);
  }

  /** Point du sol sous un pixel de l'écran. */
  pick(clientX: number, clientY: number): { x: number; y: number } {
    this.ray.setFromCamera(new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1), this.camera);
    const p = this.ray.ray.intersectPlane(this.plane, this.v3);
    return p ? { x: p.x, y: p.z } : { x: this.camera.position.x, y: this.camera.position.z - 20 };
  }

  placeCamera(camX: number, camY: number, dist: number): void {
    this.camera.position.set(camX, dist * Math.sin(PITCH), camY + dist * Math.cos(PITCH));
    this.camera.lookAt(camX, 0, camY);
    this.camera.updateMatrixWorld();
    // emprise au sol de la vue (pour générer et afficher juste ce qu'il faut)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
      const p = this.ray.ray.intersectPlane(this.plane, this.v3);
      const far = dist * 3.2;
      const px = p && p.distanceTo(this.camera.position) < far ? p.x : this.camera.position.x + this.ray.ray.direction.x * far;
      const pz = p && p.distanceTo(this.camera.position) < far ? p.z : this.camera.position.z + this.ray.ray.direction.z * far;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, pz); y1 = Math.max(y1, pz);
    }
    this.bounds = { x0: Math.floor(x0) - 4, x1: Math.ceil(x1) + 4, y0: Math.floor(y0) - 4, y1: Math.ceil(y1) + 4 };
  }

  reset(): void {
    for (const cv of this.chunks.values()) this.dropChunk(cv);
    this.chunks.clear();
    this.seenVersion = -1; this.towerLevel = -1;
  }

  private dropChunk(cv: ChunkView): void {
    for (const m of [cv.ground, cv.water, cv.slabs, cv.trees, cv.rocks, cv.glow]) if (m) this.scene.remove(m);
    cv.ground.geometry.dispose();
    for (const m of [cv.slabs, cv.trees, cv.rocks, cv.glow]) m.dispose();
  }

  // ------------------------------------------------------------- terrain
  private makeChunk(c: Chunk): ChunkView {
    const n = CHUNK + 1;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * n * 3), idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = (j * n + i) * 3; pos[k] = i; pos[k + 2] = j; }
    for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) { const a = j * n + i; idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
    g.setIndex(idx);
    const ground = new THREE.Mesh(g, this.mats.ground);
    ground.position.set(c.cx * CHUNK, 0, c.cy * CHUNK); ground.receiveShadow = true;
    this.scene.add(ground);
    let water: THREE.Mesh | null = null;
    if (c.ground.some((v) => v === GROUND_WATER)) {
      water = new THREE.Mesh(this.geos.water, this.mats.water);
      water.position.set(c.cx * CHUNK + CHUNK / 2, -0.14, c.cy * CHUNK + CHUNK / 2); water.receiveShadow = true;
      this.scene.add(water);
    }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, cast: boolean) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0; m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    const cv: ChunkView = {
      ground, water, slabs: inst(this.geos.slab, this.mats.slab, CHUNK * CHUNK, false), trees: inst(this.geos.tree, this.mats.tree, CHUNK * CHUNK, true),
      rocks: inst(this.geos.rock, this.mats.rock, CHUNK * CHUNK, true), glow: inst(this.geos.glow, this.mats.glow, 96, false), version: -1, seen: 0, painted: 0,
    };
    cv.glow.receiveShadow = false;
    return cv;
  }

  private paintChunk(cv: ChunkView, c: Chunk, g: Game): void {
    const w = g.world, seed = w.seed, bx = c.cx * CHUNK, by = c.cy * CHUNK, n = CHUNK + 1;
    const cell = (x: number, y: number): Chunk | null => (x >= 0 && x < CHUNK && y >= 0 && y < CHUNK ? c : w.at(bx + x, by + y, false));
    // --- sol : couleur par sommet = moyenne des quatre cases voisines (pas d'escalier)
    const pos = cv.ground.geometry.attributes.position.array as Float32Array;
    const colA = cv.ground.geometry.attributes.color.array as Float32Array;
    const first = cv.version < 0;
    const col = this.col, tmp = new THREE.Color();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let r = 0, gr = 0, b = 0, cnt = 0, wet = 0;
      for (const [ox, oy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const ch = cell(i + ox, j + oy);
        if (!ch) continue;
        const k = (((by + j + oy) & 31) << 5) | ((bx + i + ox) & 31);
        const h = hash01(bx + i + ox, by + j + oy, seed + 3);
        if (ch.ground[k] === GROUND_WATER) { tmp.setRGB(0.07, 0.11, 0.1); wet++; }
        else {
          const t = Math.min(1, ch.canopy[k] / 110);
          // terre nue (brune) → sol de forêt (vert très sombre)
          tmp.setRGB(0.23 - 0.15 * t + h * 0.04, 0.165 - 0.035 * t + h * 0.03, 0.11 - 0.04 * t + h * 0.02);
          if (ch.deposit[k]) { col.set(DEPOSITS[ch.deposit[k]]!.color); tmp.lerp(col, 0.35); }
        }
        r += tmp.r; gr += tmp.g; b += tmp.b; cnt++;
      }
      const k3 = (j * n + i) * 3;
      if (cnt) { colA[k3] = r / cnt; colA[k3 + 1] = gr / cnt; colA[k3 + 2] = b / cnt; }
      if (first) pos[k3 + 1] = wet === 4 ? -0.55 : wet > 0 ? -0.22 : hash01(bx + i, by + j, seed + 8) * 0.06;
    }
    cv.ground.geometry.attributes.color.needsUpdate = true;
    if (first) { cv.ground.geometry.attributes.position.needsUpdate = true; cv.ground.geometry.computeVertexNormals(); }

    // --- dalles, arbres, roches, flore lumineuse
    const m = this.m4, q = this.q, v = this.v3, s = this.s3;
    let ns = 0, nt = 0, nr = 0, ng = 0;
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) {
      const k = (ly << 5) | lx, wx = bx + lx, wy = by + ly;
      const h = hash2(wx, wy, seed + 5), f = h / 4294967296;
      if (c.slab[k]) {
        m.makeTranslation(wx + 0.5, 0.05, wy + 0.5);
        cv.slabs.setMatrixAt(ns, m); cv.slabs.setColorAt(ns, col.set(SLAB_COLS[h % 4])); ns++;
        continue;
      }
      if (c.deposit[k]) {
        const rich = Math.min(1, c.amount[k] / 900);
        q.setFromAxisAngle(this.up, f * 6.28); s.setScalar(0.7 + rich * 0.9); s.y *= 0.7;
        v.set(wx + 0.3 + f * 0.4, 0.08, wy + 0.3 + ((f * 7.3) % 1) * 0.4);
        m.compose(v, q, s);
        cv.rocks.setMatrixAt(nr, m);
        cv.rocks.setColorAt(nr, col.set(DEPOSITS[c.deposit[k]]!.color).multiplyScalar(0.75 + 0.5 * ((f * 3.1) % 1))); nr++;
      }
      const cnp = c.canopy[k];
      if (cnp >= 36 && !c.ent[k]) {
        const d = cnp / 255;
        q.setFromAxisAngle(this.up, f * 6.28);
        let edge = false;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ch = cell(lx + ox, ly + oy); if (ch && ch.slab[(((by + ly + oy) & 31) << 5) | ((bx + lx + ox) & 31)]) edge = true; }
        const sc = (0.5 + 0.85 * d) * (edge ? 0.5 : 1);
        s.set(sc, sc * (0.85 + 0.7 * ((f * 5.7) % 1)), sc);
        v.set(wx + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.5, -0.1, wy + 0.5 + (((h >>> 16) & 255) / 255 - 0.5) * 0.5);
        m.compose(v, q, s);
        cv.trees.setMatrixAt(nt, m);
        cv.trees.setColorAt(nt, col.set(TREE_GREENS[h % 7]).multiplyScalar(0.72 + 0.4 * d)); nt++;
        if (ng < 96 && d > 0.55 && ((f * 91.7) % 1) < 0.035) {
          m.makeTranslation(v.x + 0.2, 1.0 * s.y + 0.25, v.z - 0.1);
          cv.glow.setMatrixAt(ng, m); ng++;
        }
      }
    }
    s.set(1, 1, 1);
    for (const [mesh, cnt] of [[cv.slabs, ns], [cv.trees, nt], [cv.rocks, nr], [cv.glow, ng]] as [THREE.InstancedMesh, number][]) {
      mesh.count = cnt; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ----------------------------------------------------------- bâtiments
  private rebuildBatches(g: Game): void {
    const groups = new Map<string, Ent[]>();
    const add = (e: Ent) => { let a = groups.get(e.def.key); if (!a) groups.set(e.def.key, (a = [])); a.push(e); };
    for (const e of g.tickers) if (e.def.kind !== 'hub') add(e);
    for (const e of g.trees) if (e.def.kind === 'tree') add(e);
    for (const e of g.belts) if (e.def.kind === 'bridge' && !e.dead) add(e);
    const rings: Ent[] = groups.get('cerclage') ?? [];
    if (rings.length) groups.set('eventail', [...(groups.get('eventail') ?? []), ...rings]);   // l'arbre reste visible dans son cerclage
    const m = this.m4, q = this.q, v = this.v3;
    for (const [key, list] of groups) {
      let b = this.batches.get(key);
      if (!b || b.cap < list.length) {
        if (b) for (const mesh of [b.body, b.lamp, b.rotor]) if (mesh) { this.scene.remove(mesh); mesh.dispose(); }
        const cap = Math.max(16, list.length * 2), model = modelFor(key);
        const lamp = model.lamp ? this.newInstanced(model.lamp, this.mats.lamp, cap, false, false) : null;
        if (lamp) lamp.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        b = {
          body: this.newInstanced(model.body, this.mats.body, cap, true, true), lamp,
          rotor: model.rotor ? this.newInstanced(model.rotor, this.mats.rotor, cap, true, false) : null, ents: [], cap, color: new THREE.Color(lampColor(B[key])),
        };
        this.batches.set(key, b);
      }
      b.ents = list;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        q.setFromAxisAngle(this.up, -e.rot * Math.PI / 2 + (e.def.kind === 'bridge' && e.isOut ? Math.PI : 0));
        m.compose(v.set(e.cx, 0, e.cy), q, this.s3);
        b.body.setMatrixAt(i, m);
        if (b.lamp) b.lamp.setMatrixAt(i, m);
        if (b.rotor) b.rotor.setMatrixAt(i, m);
      }
      for (const mesh of [b.body, b.lamp, b.rotor]) if (mesh) { mesh.count = list.length; mesh.instanceMatrix.needsUpdate = true; }
    }
    for (const [key, b] of this.batches) if (!groups.has(key)) { b.ents = []; for (const mesh of [b.body, b.lamp, b.rotor]) if (mesh) mesh.count = 0; }

    // convoyeurs
    const belts = g.belts.filter((e) => e.def.kind === 'belt' && !e.dead);
    if (belts.length > this.beltCap) {
      this.scene.remove(this.belts); this.belts.dispose();
      this.beltCap = belts.length * 2;
      this.belts = this.newInstanced(new THREE.BoxGeometry(1, 0.1, 0.74), this.mats.belt, this.beltCap, false, true);
    }
    for (let i = 0; i < belts.length; i++) {
      const e = belts[i];
      q.setFromAxisAngle(this.up, -e.rot * Math.PI / 2);
      m.compose(v.set(e.x + 0.5, 0.15, e.y + 0.5), q, this.s3);
      this.belts.setMatrixAt(i, m);
    }
    this.belts.count = belts.length; this.belts.instanceMatrix.needsUpdate = true;
    // tabliers de pont
    let ns = 0;
    for (const e of g.belts) {
      if (e.def.kind !== 'bridge' || e.isOut || !e.pair || e.dead || ns >= 256) continue;
      const len = Math.abs(e.pair.x - e.x) + Math.abs(e.pair.y - e.y);
      q.setFromAxisAngle(this.up, -e.rot * Math.PI / 2);
      m.compose(v.set((e.x + e.pair.x) / 2 + 0.5, 0.62, (e.y + e.pair.y) / 2 + 0.5), q, new THREE.Vector3(Math.max(0.2, len - 0.5), 1, 1));
      this.spans.setMatrixAt(ns++, m);
    }
    this.spans.count = ns; this.spans.instanceMatrix.needsUpdate = true;

    // flaques de lumière au sol
    this.poolEnts = g.tickers.filter((e) => e.def.kind !== 'hub' && e.def.kind !== 'splitter' && e.def.kind !== 'solar');
    if (this.poolEnts.length > this.poolCap) this.poolEnts.length = this.poolCap;
    for (let i = 0; i < this.poolEnts.length; i++) {
      const e = this.poolEnts[i], r = Math.max(e.w, e.h) * 2.4 + (e.def.kind === 'deco' ? 4 : 0);
      m.compose(v.set(e.cx, 0.13, e.cy), q.identity(), new THREE.Vector3(r, 1, r));
      this.pools.setMatrixAt(i, m);
    }
    this.pools.count = this.poolEnts.length; this.pools.instanceMatrix.needsUpdate = true;
  }

  private rebuildTower(g: Game): void {
    const model = modelFor('tour', g.hub.level);
    if (this.tower) { this.scene.remove(this.tower); this.scene.remove(this.towerLamp!); }
    this.tower = new THREE.Mesh(model.body, this.mats.body);
    this.tower.castShadow = true; this.tower.receiveShadow = true;
    this.towerLamp = new THREE.Mesh(model.lamp!, new THREE.MeshBasicMaterial({ color: 0xffb050, toneMapped: false }));
    for (const o of [this.tower, this.towerLamp]) { o.position.set(g.hub.cx, 0, g.hub.cy); this.scene.add(o); }
    this.towerLevel = g.hub.level;
    this.towerLight.position.set(g.hub.cx, 4 + g.hub.level * 0.7, g.hub.cy);
  }

  // --------------------------------------------------------------- image
  render(g: Game, o: FrameOpts): void {
    const sun = g.sun, n = sun.night, b = this.bounds;
    this.placeCamera(o.camX, o.camY, o.dist);

    // --- lumière : soleil rasant et doré, zénith clair, nuit bleue où seules les lampes comptent
    const day = Math.max(0, 1 - n * 1.6);
    const el = Math.max(0.16, sun.elev) * 1.08;
    if (sun.day) this.v3.set(sun.sx * Math.cos(el), Math.sin(el), sun.sy * Math.cos(el));
    else this.v3.set(-0.45, 0.75, 0.4).normalize();
    this.sun.target.position.set(o.camX, 0, o.camY - o.dist * 0.12);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.v3, 160);
    const low = sun.day ? Math.max(0, 1 - sun.elev / 0.6) : 0;
    this.sun.color.setRGB(1, 0.95 - 0.33 * low, 0.86 - 0.5 * low).lerp(this.col.set(0x7e9bff), 1 - day);
    this.sun.intensity = sun.day ? 0.7 + 2.5 * sun.light : 0.75;
    const R = Math.min(120, Math.max(30, o.dist * 1.25));
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 20; sc.far = 400; sc.updateProjectionMatrix();
    this.hemi.color.setRGB(0.56 - 0.44 * n, 0.7 - 0.5 * n, 0.85 - 0.4 * n);
    this.hemi.groundColor.setRGB(0.23 - 0.19 * n, 0.29 - 0.24 * n, 0.19 - 0.14 * n);
    this.hemi.intensity = 1.25 - 0.75 * n;
    const sky = this.col.setRGB(0.56 + 0.2 * low, 0.64 - 0.1 * low, 0.58 - 0.26 * low).multiplyScalar(1 - 0.94 * n);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.FogExp2).color.copy(sky);
    (this.scene.fog as THREE.FogExp2).density = 0.42 / (o.dist * 3.2 + 60);
    this.bloom.strength = 0.18 + 0.4 * n;
    this.tilt.uniforms.amount.value = o.tilt ? 1.9 : 0;
    this.tilt.uniforms.warm.value = low * 0.8;
    this.itemGlow.value = 0.12 + 0.75 * n;
    this.towerLight.intensity = 26 * n + 2;
    (this.mats.glow.color as THREE.Color).setRGB(0.5, 0.94, 0.82).multiplyScalar(0.35 + 2.4 * n + 2 * g.bloom);

    // --- terrain visible
    let budget = 5;
    const cx0 = b.x0 >> 5, cx1 = b.x1 >> 5, cy0 = b.y0 >> 5, cy1 = b.y1 >> 5;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = g.world.chunk(cx, cy, false);
      if (!c) continue;
      let cv = this.chunks.get(c);
      if (!cv) { if (budget <= 0 && o.frame > 3) continue; cv = this.makeChunk(c); this.chunks.set(c, cv); }
      cv.seen = o.frame;
      if (cv.version !== c.version && (cv.version < 0 || c.urgent || o.frame - cv.painted > 120) && (budget > 0 || o.frame <= 3)) {
        budget--; this.paintChunk(cv, c, g); cv.version = c.version; cv.painted = o.frame; c.urgent = false;
      }
    }
    if (o.frame % 120 === 0) for (const [c, cv] of this.chunks) if (o.frame - cv.seen > 400) { this.dropChunk(cv); this.chunks.delete(c); }

    // --- bâtiments
    if (this.seenVersion !== g.version) { this.rebuildBatches(g); this.seenVersion = g.version; }
    if (this.towerLevel !== g.hub.level) this.rebuildTower(g);
    const m = this.m4, q = this.q, v = this.v3, col = this.col;
    const hdr = 1.0 + 1.1 * n;
    for (const [key, bt] of this.batches) {
      const spin = ROTOR_SPEED[key] ?? 0;
      for (let i = 0; i < bt.ents.length; i++) {
        const e = bt.ents[i], k = e.def.kind;
        let on = e.status === Status.Working ? 1 : 0.04;
        if (k === 'deco') on = n > 0.12 ? 1 : 0.06;
        else if (k === 'tree' || k === 'ring') on = 0.25 + 0.9 * e.health;
        else if (k === 'battery') on = 0.06 + e.energy / ACCU_CAP;
        else if (k === 'solar') on = e.light > 0.05 ? 0.5 : 0.04;
        else if (k === 'splitter' && e.def.filter && e.filter >= 0) on = 1;
        if (bt.lamp) {
          if (k === 'splitter' && e.def.filter && e.filter >= 0) col.set(ITEMS[e.filter].color); else col.copy(bt.color);
          bt.lamp.setColorAt(i, col.multiplyScalar(on * hdr));
        }
        if (bt.rotor && spin) {
          if (e.status === Status.Working) e.anim += o.dt * spin * (k === 'wind' ? g.wind : g.power.sat);
          q.setFromAxisAngle(this.up, -e.rot * Math.PI / 2 + e.anim);
          m.compose(v.set(e.cx, 0, e.cy), q, this.s3);
          bt.rotor.setMatrixAt(i, m);
        }
      }
      if (bt.lamp?.instanceColor) bt.lamp.instanceColor.needsUpdate = true;
      if (bt.rotor && spin) bt.rotor.instanceMatrix.needsUpdate = true;
    }
    this.pools.visible = n > 0.08;
    if (this.pools.visible) {
      for (let i = 0; i < this.poolEnts.length; i++) {
        const e = this.poolEnts[i];
        const on = e.def.kind === 'deco' ? 1 : e.def.kind === 'ring' ? e.health : e.status === Status.Working ? 0.7 : 0;
        this.pools.setColorAt(i, col.set(lampColor(e.def)).multiplyScalar(on * n * 0.4));
      }
      this.pools.instanceColor!.needsUpdate = true;
    }
    (this.towerLamp!.material as THREE.MeshBasicMaterial).color.setRGB(1, 0.69, 0.31).multiplyScalar(1.1 + 1.3 * n + 0.2 * Math.sin(o.time * 2));
    this.beltTex.offset.x = -((o.time * BELT_SPEED * g.upgradeMult('convoyeurs') * 60) / TILE_U) % 1;

    // --- objets sur les convoyeurs
    for (const it of this.items.values()) it.n = 0;
    const tmp = { x: 0, y: 0, z: 0 };
    for (const p of g.paths) {
      if (p.maxx + 7 < b.x0 || p.minx - 7 > b.x1 || p.maxy + 7 < b.y0 || p.miny - 7 > b.y1) continue;
      let dist = 0;
      for (let k = p.head; k < p.types.length; k++) {
        dist += p.gaps[k];
        itemPosition(p, p.length - dist, tmp);
        const def = ITEMS[p.types[k]];
        const it = this.items.get(def.shape)!;
        if (it.n >= it.cap) this.growItems(def.shape);
        const arr = it.mesh.instanceMatrix.array as Float32Array, o16 = it.n * 16;
        arr[o16] = 1; arr[o16 + 1] = 0; arr[o16 + 2] = 0; arr[o16 + 3] = 0; arr[o16 + 4] = 0; arr[o16 + 5] = 1; arr[o16 + 6] = 0; arr[o16 + 7] = 0;
        arr[o16 + 8] = 0; arr[o16 + 9] = 0; arr[o16 + 10] = 1; arr[o16 + 11] = 0;
        arr[o16 + 12] = tmp.x; arr[o16 + 13] = 0.33 + tmp.z * 0.46; arr[o16 + 14] = tmp.y; arr[o16 + 15] = 1;
        col.set(def.color);
        if (def.glow) col.multiplyScalar(1.8);
        const ca = it.mesh.instanceColor!.array as Float32Array;
        ca[it.n * 3] = col.r; ca[it.n * 3 + 1] = col.g; ca[it.n * 3 + 2] = col.b;
        it.n++;
      }
    }
    for (const it of this.items.values()) { it.mesh.count = it.n; it.mesh.instanceMatrix.needsUpdate = true; it.mesh.instanceColor!.needsUpdate = true; }

    this.updateOverlays(g, o);
    this.updateSmoke(g, o);
    if (o.frame % 12 === 0) this.updateSprites(g);
    this.composer.render();
  }

  private growItems(shape: Shape): void {
    const it = this.items.get(shape)!;
    const cap = it.cap * 2;
    const mesh = this.newInstanced(it.mesh.geometry, this.mats.item, cap, false, false);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    (mesh.instanceMatrix.array as Float32Array).set(it.mesh.instanceMatrix.array as Float32Array);
    (mesh.instanceColor.array as Float32Array).set(it.mesh.instanceColor!.array as Float32Array);
    this.scene.remove(it.mesh); it.mesh.dispose();
    it.mesh = mesh; it.cap = cap;
  }

  // ------------------------------------------------------- aides visuelles
  private updateOverlays(g: Game, o: FrameOpts): void {
    const box = (obj: THREE.LineSegments, e: Ent | null) => {
      obj.visible = !!e && !e.dead;
      if (!obj.visible) return;
      const h = Math.max(0.5, e!.height + 0.3);
      obj.position.set(e!.cx, h / 2, e!.cy); obj.scale.set(e!.w + 0.1, h, e!.h + 0.1);
    };
    box(this.outline, o.hover && o.hover !== o.selected ? o.hover : null);
    box(this.selectBox, o.selected);
    (this.outline.material as THREE.LineBasicMaterial).color.set(o.demolish ? 0xff5a6a : 0xffffff);

    const def = o.tool ? B[o.tool] : null;
    this.ghost.visible = this.foot.visible = !!def;
    this.grid.visible = !!def || o.demolish;
    if (this.grid.visible) this.grid.position.set(o.cellX, 0.12, o.cellY);
    this.arrow.visible = false;
    let rangeFor: { key: string; x: number; y: number; w: number; h: number } | null = null;
    if (def) {
      const [fw, fh] = g.footprint(def, o.rot);
      const color = o.ghostOk ? 0x8cfbe8 : 0xff5a6a;
      if (this.ghostKey !== def.key) {
        this.ghostKey = def.key;
        this.ghost.geometry = def.kind === 'belt' ? new THREE.BoxGeometry(1, 0.12, 0.74).translate(0, 0.16, 0) : def.kind === 'slab' ? new THREE.BoxGeometry(0.98, 0.1, 0.98).translate(0, 0.05, 0) : modelFor(def.key).body;
      }
      (this.ghost.material as THREE.MeshBasicMaterial).color.set(color);
      (this.foot.material as THREE.MeshBasicMaterial).color.set(color);
      this.ghost.position.set(o.originX + fw / 2, 0.02, o.originY + fh / 2);
      this.ghost.rotation.y = -o.rot * Math.PI / 2;
      this.foot.position.set(o.originX + fw / 2, 0.14, o.originY + fh / 2); this.foot.scale.set(fw, fh, 1);
      const fake = { def, x: o.originX, y: o.originY, w: fw, h: fh, rot: o.rot } as Ent;
      const ports = def.kind === 'belt' ? [[o.originX + DX[o.rot], o.originY + DY[o.rot], o.rot]] : def.kind === 'splitter' ? [] : outputPorts(fake);
      if (ports.length) {
        this.arrow.visible = true;
        this.arrow.position.set(ports[0][0] + 0.5, 0.3, ports[0][1] + 0.5);
        this.arrow.rotation.y = -ports[0][2] * Math.PI / 2;
      }
      rangeFor = { key: def.key, x: o.originX, y: o.originY, w: fw, h: fh };
    } else if (o.selected && !o.selected.dead) {
      const e = o.selected;
      rangeFor = { key: e.def.key, x: e.x, y: e.y, w: e.w, h: e.h };
      const ports = outputPorts(e);
      if (ports.length && e.def.kind !== 'splitter') {
        this.arrow.visible = true;
        this.arrow.position.set(ports[0][0] + 0.5, 0.3, ports[0][1] + 0.5);
        this.arrow.rotation.y = -ports[0][2] * Math.PI / 2;
      }
    }
    // zone d'action (puits, scierie, épurateur, semeur, éventail)
    this.range.visible = false;
    if (rangeFor) {
      const kind = B[rangeFor.key].kind, cx = rangeFor.x + rangeFor.w / 2, cy = rangeFor.y + rangeFor.h / 2;
      const pts: number[] = [];
      const square = (hw: number, hh: number) => pts.push(-hw, 0, -hh, hw, 0, -hh, hw, 0, hh, -hw, 0, hh);
      const circle = (r: number) => { for (let i = 0; i < 48; i++) pts.push(Math.cos((i / 48) * 6.283) * r, 0, Math.sin((i / 48) * 6.283) * r); };
      if (kind === 'miner') square(rangeFor.w / 2 + 1, rangeFor.h / 2 + 1);
      else if (kind === 'sawmill') circle(5.3);
      else if (kind === 'scrubber') square(SCRUB_RANGE, SCRUB_RANGE);
      else if (kind === 'seeder') square(SEED_RANGE, SEED_RANGE);
      else if (kind === 'ring' || kind === 'tree') circle(7.5);
      if (pts.length) {
        this.range.geometry.dispose();
        this.range.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        this.range.position.set(cx, 0.25, cy); this.range.visible = true;
      }
    }
    // repère du tutoriel
    this.marker.visible = !!o.marker;
    if (o.marker) {
      this.marker.position.set(o.marker.x, 0, o.marker.y);
      this.marker.children[0].position.y = 3.4 + Math.sin(o.time * 4) * 0.4;
      this.marker.children[1].scale.setScalar(0.7 + 0.3 * Math.abs(Math.sin(o.time * 2)));
    }
    // ondes
    for (let i = 0; i < this.fxRings.length; i++) {
      const mesh = this.fxRings[i], r = o.rings[i];
      const t = r ? (o.time - r.t0) / r.dur : -1;
      mesh.visible = t >= 0 && t <= 1;
      if (!mesh.visible) continue;
      const ease = 1 - (1 - t) * (1 - t);
      mesh.position.set(r.x, 0.3, r.y); mesh.scale.setScalar(0.4 + r.size * ease);
      const mat = mesh.material as THREE.MeshBasicMaterial; mat.color.set(r.color); mat.opacity = 1 - t;
    }
    // curseurs des manettes
    while (this.cursorMeshes.length < o.cursors.length) {
      const c = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false, transparent: true }));
      c.renderOrder = 7; this.cursorMeshes.push(c); this.scene.add(c);
    }
    this.cursorMeshes.forEach((c, i) => {
      const p = o.cursors[i];
      c.visible = !!p;
      if (p) { c.position.set(Math.floor(p.x) + 0.5, 0.4 + 0.08 * Math.sin(o.time * 5), Math.floor(p.y) + 0.5); (c.material as THREE.MeshBasicMaterial).color.set(p.color); }
    });
  }

  private updateSmoke(g: Game, o: FrameOpts): void {
    const d = this.smokeData, b = this.bounds;
    for (const e of g.tickers) {
      if (e.status !== Status.Working) continue;
      const smoky = e.def.kind === 'generator' ? e.def.key !== 'pile' && e.flow > 0 : !!e.recipe && e.recipe.smoke > 0;
      if (!smoky || e.cx < b.x0 || e.cx > b.x1 || e.cy < b.y0 || e.cy > b.y1) continue;
      if (hash01(e.id, o.frame, 5) > o.dt * 5) continue;
      const i = d.next; d.next = (d.next + 1) % d.n;
      d.pos[i * 3] = e.cx - 0.3 + hash01(i, o.frame, 1) * 0.6; d.pos[i * 3 + 1] = e.height + 0.2; d.pos[i * 3 + 2] = e.cy - 0.3 + hash01(i, o.frame, 2) * 0.6;
      d.vel[i * 3] = 0.25 + g.wind * 0.5; d.vel[i * 3 + 1] = 0.9 + hash01(i, o.frame, 3) * 0.5; d.vel[i * 3 + 2] = -0.15;
      d.life[i] = 1;
    }
    for (let i = 0; i < d.n; i++) {
      if (d.life[i] <= 0) continue;
      d.life[i] = Math.max(0, d.life[i] - o.dt * 0.22);
      d.pos[i * 3] += d.vel[i * 3] * o.dt; d.pos[i * 3 + 1] += d.vel[i * 3 + 1] * o.dt; d.pos[i * 3 + 2] += d.vel[i * 3 + 2] * o.dt;
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.life.needsUpdate = true;
    (this.smoke.material as THREE.ShaderMaterial).uniforms.tint.value.setScalar(0.3 - 0.2 * g.sun.night);
  }

  /** Pictogramme au-dessus d'une machine arrêtée : on voit ce qui lui manque sans cliquer. */
  private icon(key: string): THREE.Texture {
    let t = this.iconTex.get(key);
    if (t) return t;
    t = canvasTex(64, (c, s) => {
      c.fillStyle = '#16171a'; c.beginPath(); c.arc(s / 2, s / 2, 29, 0, 6.3); c.fill();
      c.strokeStyle = '#ffa040'; c.lineWidth = 4; c.stroke();
      if (key.startsWith('in:')) {
        const it = ITEMS[+key.slice(3)];
        c.fillStyle = it.color; c.strokeStyle = '#000'; c.lineWidth = 2;
        c.beginPath();
        if (it.shape === 'boule') c.arc(32, 32, 13, 0, 6.3);
        else if (it.shape === 'gemme') { c.moveTo(32, 16); c.lineTo(48, 32); c.lineTo(32, 48); c.lineTo(16, 32); c.closePath(); }
        else if (it.shape === 'lingot') c.rect(15, 24, 34, 16);
        else if (it.shape === 'bonbonne') c.roundRect(23, 15, 18, 34, 7);
        else c.rect(19, 19, 26, 26);
        c.fill(); c.stroke();
      } else {
        c.fillStyle = '#ffa040'; c.font = 'bold 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(key === 'power' ? '⚡' : key === 'blocked' ? '⏸' : key === 'gas' ? '☁' : '∅', 32, 34);
      }
    });
    this.iconTex.set(key, t);
    return t;
  }

  private updateSprites(g: Game): void {
    const b = this.bounds;
    let k = 0;
    for (const e of g.tickers) {
      if (k >= 120) break;
      const s = e.status;
      if (s === Status.Working || s === Status.Idle || s === Status.Dark || s === Status.NoRecipe) continue;
      const kind = e.def.kind;
      if (kind === 'splitter' || kind === 'hub' || kind === 'storage' || kind === 'deco') continue;
      if (e.cx < b.x0 || e.cx > b.x1 || e.cy < b.y0 || e.cy > b.y1) continue;
      let sp = this.sprites[k];
      if (!sp) { sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, toneMapped: false })); sp.renderOrder = 8; this.sprites.push(sp); this.scene.add(sp); }
      const key = s === Status.NoInput ? `in:${e.missing}` : s === Status.NoPower ? 'power' : s === Status.Blocked ? 'blocked' : s === Status.NoGas ? 'gas' : 'empty';
      sp.material.map = this.icon(key); sp.material.needsUpdate = true;
      const sc = 0.7 + Math.max(e.w, e.h) * 0.14;
      sp.scale.set(sc, sc, 1); sp.position.set(e.cx, e.height + 1.1, e.cy); sp.visible = true;
      k++;
    }
    for (let i = k; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }
}
