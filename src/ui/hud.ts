// Interface. Principes tirés du dossier UI/UX : une décision avant un menu, le monde reste visible,
// reconnaître plutôt que se souvenir (icône + mot), montrer la cause, dévoiler par couches, erreur récupérable.

import {
  B, BUILDINGS, CATEGORIES, ITEMS, NITEMS, RECIPES, I, quotaAt,
  type BuildingDef, type Category, type ItemDef, type Place, type Recipe, type Step,
} from '../sim/data';
import { ACCU_CAP, STORE_CAP, type Game } from '../sim/game';
import { Status, STATUS_TEXT, type Ent } from '../sim/ent';
import { prettyFormula } from '../sim/chem';
import { buildingIcon } from '../render/sprites';
import { hudIconUrl } from '../render/px/hudIcons';
import './px/top.css';
import './px/bottom.css';
import { sunDialSvg } from './px/sunDial';
import { toolHint } from './px/barHint';

export interface HudHost {
  game(): Game;
  tool(): string | null;
  selectTool(key: string | null): void;
  stepDone(step: Step): boolean;
  locate(place: Place): void;
  setRecipe(e: Ent, key: string): void;
  setFilter(e: Ent, id: number): void;
  feed(e: Ent): void;
  take(e: Ent): void;
  ping(list: Ent[]): void;
  menu(action: string, value?: string): void;
  playerLines(): string[];
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.floor(n).toLocaleString('fr-FR'));
const clock = (ticks: number) => `${Math.floor(ticks / 3600)} min ${String(Math.floor((ticks / 60) % 60)).padStart(2, '0')}`;

/** Icône d'objet : la forme double la couleur (rien d'essentiel ne dépend de la couleur seule). */
export function itemIcon(it: ItemDef, size = 18): string {
  const s = { boule: '<circle cx="8" cy="8" r="5.5"/>', bloc: '<rect x="3" y="3" width="10" height="10"/>', gemme: '<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/>', lingot: '<path d="M4 5h8l2.5 6h-13Z"/>', plaque: '<rect x="1.5" y="5" width="13" height="6"/>', bobine: '<path fill-rule="evenodd" d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 4a2 2 0 1 1 0 4a2 2 0 0 1 0-4Z"/>', rouage: '<path d="M8 1.5l1.6 2.3 2.7-.6.2 2.8 2.5 1.2-1.6 2.3 1 2.6-2.8.3-1.1 2.5L8 13.6l-2.5 1.3-1.1-2.5-2.8-.3 1-2.6L1 7.2l2.5-1.2.2-2.8 2.7.6Z"/>' }[it.shape];
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 16 16" fill="${it.color}" stroke="#000" stroke-opacity=".55" stroke-width="1" aria-hidden="true">${s}</svg>`;
}
const itemTag = (id: number, n?: number | string) => `<button class="item" data-codex="i:${id}">${itemIcon(ITEMS[id])}${n !== undefined ? `<b>${n}</b> ` : ''}${esc(ITEMS[id].name)}</button>`;

function equation(r: Recipe): string {
  const side = (items: [number, number][], gases: [string, number][]) => [
    ...items.map(([id, n]) => `<span class="term">${n > 1 ? n + ' ' : ''}${itemIcon(ITEMS[id], 15)}${prettyFormula(ITEMS[id].formula)}</span>`),
    ...gases.map(([g, n]) => `<span class="term gas">${n > 1 ? n + ' ' : ''}${prettyFormula(g)}</span>`),
  ].join(' + ');
  return `${side(r.inputs, r.gasIn)} <span class="arrow">→</span> ${side(r.outputs, r.gasOut) || '<span class="term gas">énergie</span>'}`;
}

/** Phrase simple : « 2 Hématite + 3 Charbon → 4 Fer ». */
export function recipeWords(r: Recipe): string {
  const side = (items: [number, number][]) => items.map(([id, n]) => `${n} ${ITEMS[id].name}`).join(' + ');
  return `${side(r.inputs)} → ${side(r.outputs) || 'énergie'}`;
}

export class Hud {
  selected: Ent | null = null;
  cat: Category = 'extraction';
  private readonly pixel = document.documentElement.dataset.rendu === 'pixel';
  private stepsOpen = false;
  private codexHistory: string[] = [];
  private seenUnlock = 0;
  private fresh = new Set<string>();
  private toastTimer = 0;
  private bannerTimer = 0;
  private barKey = '';
  private panelKey = '';
  private quotaKey = '';
  private lastTool: string | null = null;
  private alertsOpen = false;
  private alertsKey = '';
  private floats: HTMLElement[] = [];

  constructor(private host: HudHost) {
    document.addEventListener('click', (ev) => this.onClick(ev));
    $('codex-search').addEventListener('input', () => this.renderCodexList());
    $('opt-music').addEventListener('input', (ev) => host.menu('music', (ev.target as HTMLInputElement).value));
    $('opt-sfx').addEventListener('input', (ev) => host.menu('sfx', (ev.target as HTMLInputElement).value));
  }

  private onClick(ev: MouseEvent): void {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tool],[data-hands],[data-cat],[data-recipe],[data-filter],[data-codex],[data-act],[data-menu],[data-alert],[data-alert-toggle],[data-steps-toggle],[data-close],[data-go]');
    if (!t) return;
    const d = t.dataset;
    const g = this.host.game();
    if (d.stepsToggle !== undefined) {
      this.stepsOpen = !this.stepsOpen;
      this.renderQuota(g);
      if (ev.detail === 0) document.querySelector<HTMLElement>('[data-steps-toggle]')?.focus();
    }
    else if (d.alertToggle !== undefined) { this.alertsOpen = !this.alertsOpen; this.renderAlerts(g); }
    else if (d.hands !== undefined) { this.host.selectTool(null); this.lastTool = null; this.barKey = ''; }
    else if (d.tool !== undefined) { this.fresh.delete(d.tool); this.host.selectTool(this.host.tool() === d.tool ? null : d.tool); this.lastTool = this.host.tool(); this.barKey = ''; }
    else if (d.cat !== undefined) { this.cat = d.cat as Category; this.barKey = ''; this.renderBar(g); }
    else if (d.go !== undefined) this.host.locate(d.go as Place);
    else if (d.recipe !== undefined && this.selected) { this.host.setRecipe(this.selected, d.recipe); this.renderPanel(g, true); }
    else if (d.filter !== undefined && this.selected) { this.host.setFilter(this.selected, +d.filter); this.renderPanel(g, true); }
    else if (d.codex !== undefined) this.openCodex(d.codex);
    else if (d.act !== undefined && this.selected) { if (d.act === 'feed') this.host.feed(this.selected); else this.host.take(this.selected); this.renderPanel(g, true); }
    else if (d.menu !== undefined) this.host.menu(d.menu);
    else if (d.alert !== undefined) {
      const [st, miss, key] = d.alert.split(':');
      this.host.ping(g.tickers.filter((e) => e.def.key === key && e.status === +st && (+st !== Status.NoInput || e.missing === +miss)));
    } else if (d.close !== undefined) {
      if (d.close === 'panel') this.select(null); else $(d.close).hidden = true;
    }
  }

  select(e: Ent | null): void {
    this.selected = e;
    $('panel').hidden = !e;
    if (e) this.renderPanel(this.host.game(), true);
  }

  toast(text: string, ms = 2600): void {
    const el = $('toast');
    el.textContent = text; el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  /** Un gain qui monte au-dessus d'un point de l'écran, clignote et disparaît (rendu pixel). */
  float(text: string, x: number, y: number): void {
    const el = document.createElement('span');
    el.className = 'float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $('hud').append(el);
    void el.offsetWidth;
    el.classList.add('rise');
    this.floats.push(el);
    while (this.floats.length > 8) this.floats.shift()!.remove();
    window.setTimeout(() => el.classList.add('blink'), 900);
    window.setTimeout(() => el.classList.remove('blink'), 1050);
    window.setTimeout(() => {
      el.remove();
      const i = this.floats.indexOf(el);
      if (i >= 0) this.floats.splice(i, 1);
    }, 1300);
  }

  /** Infobulle au curseur : ce qu'on survole, ou pourquoi on ne peut pas poser. */
  tip(html: string | null, x = 0, y = 0): void {
    const el = $('tip');
    if (!html) { el.hidden = true; return; }
    if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
    el.hidden = false;
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.min(window.innerWidth - w - 8, x + 18)}px`;
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y + 18))}px`;
  }

  // ------------------------------------------------------- mise à jour (5 Hz)
  update(g: Game): void {
    this.renderQuota(g);
    this.renderTop(g);
    this.renderStock(g);
    this.renderAlerts(g);
    this.renderBar(g);
    if (this.selected) { if (this.selected.dead) this.select(null); else this.renderPanel(g, false); }
  }

  /** Première étape non faite du quota en cours (le tutoriel est la liste d'étapes elle-même). */
  currentStep(g: Game): Step | null {
    for (const s of quotaAt(g.quota).steps) if (!this.host.stepDone(s)) return s;
    return null;
  }

  private renderQuota(g: Game): void {
    const q = quotaAt(g.quota);
    const rows = q.need.map(([id, n]) => {
      const have = Math.min(n, g.delivered[id]);
      return `<div class="need">${itemTag(id)}<span class="count">${fmt(have)} / ${fmt(n)}</span><div class="bar"><i style="width:${(100 * have / n).toFixed(1)}%"></i></div></div>`;
    }).join('');
    const html = `<div class="eyebrow">Quota ${String(g.quota + 1).padStart(2, '0')} · ${esc(q.title)}</div><h2>${esc(q.verb)}</h2>${rows}<p class="why">${esc(q.why)}</p>${this.quotaSteps(q)}`;
    if (html !== this.quotaKey) { this.quotaKey = html; $('quota').innerHTML = html; }
  }

  /** Les étapes : en pixel, un pli qui montre l'étape en cours et déplie le reste. */
  private quotaSteps(q: ReturnType<typeof quotaAt>): string {
    const total = q.steps.length;
    if (!total) return '';
    let seenNow = false;
    const rows = q.steps.map((s) => {
      const done = this.host.stepDone(s);
      const now = !done && !seenNow;
      if (now) seenNow = true;
      const go = now && (s.t === 'build' || s.t === 'gather') && s.go ? `<button class="go" data-go="${s.go}">Y aller</button>` : '';
      return `<li class="${done ? 'done' : now ? 'now' : ''}"><span>${esc(s.text)}</span>${go}</li>`;
    }).join('');
    if (!this.pixel) return `<ul class="steps">${rows}</ul>`;
    const index = q.steps.findIndex((s) => !this.host.stepDone(s));
    const current = index < 0 ? total : index + 1;
    const toggle = `<button class="steps-toggle" data-steps-toggle="1" aria-expanded="${this.stepsOpen}">Étape ${current} / ${total}</button>`;
    return `${toggle}<ul class="steps${this.stepsOpen ? ' open' : ''}">${rows}</ul>`;
  }

  private renderTop(g: Game): void {
    const s = g.sun, p = g.power;
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour % 1) * 60);
    const low = p.sat < 0.999 && p.lastDemand > 0;
    const use = p.capacity > 0 ? Math.min(1, p.lastDemand / p.capacity) : 0;
    const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const title = 'Un jour dure 10 minutes. Les Héliostats ne produisent que le jour.';
    const dial = this.pixel
      ? `<div class="chip dial" title="${title}">${sunDialSvg(s.t)}<b>${time}</b><span class="sr">${s.day ? 'jour' : 'nuit'}</span></div>`
      : `<div class="chip" title="${title}"><b>${time}</b>${s.day ? 'jour' : 'nuit'}</div>`;
    $('topbar').innerHTML = `
      ${dial}
      <div class="chip ${low ? 'bad' : ''}" title="Énergie : ce que l’usine demande / ce que tu peux fournir. Si la demande dépasse, tout ralentit.">Énergie <b>${Math.round(p.lastDemand)}</b> / ${Math.round(p.capacity)} W<span class="meter"><i style="width:${Math.round(use * 100)}%"></i></span>${low ? `<b>${Math.round(p.sat * 100)} %</b>` : ''}${p.storeMax ? ` · réserve ${Math.round((100 * p.stored) / p.storeMax)} %` : ''}</div>`;
  }

  private renderStock(g: Game): void {
    let html = '';
    for (let i = 0; i < NITEMS; i++) {
      const n = g.stock[i];
      const rate = g.stats.rate(g.stats.prod, i) - g.stats.rate(g.stats.cons, i);
      if (n < 1 && Math.abs(rate) < 0.5) continue;
      html += `<button class="row" data-codex="i:${i}">${itemIcon(ITEMS[i])}<span class="name">${esc(ITEMS[i].name)}</span><span class="rate ${rate < -0.5 ? 'neg' : ''}">${Math.abs(rate) >= 0.5 ? (rate > 0 ? '+' : '−') + Math.abs(Math.round(rate)) + '/min' : ''}</span><b>${fmt(n)}</b></button>`;
    }
    $('stock').innerHTML = `<div class="eyebrow">${this.pixel ? 'Stock' : 'Ton stock'}</div>${html || '<p class="meta">Vide pour l’instant.</p>'}`;
  }

  private renderAlerts(g: Game): void {
    const groups = new Map<string, { n: number; text: string }>();
    for (const e of g.tickers) {
      const s = e.status;
      if (s !== Status.NoInput && s !== Status.NoPower && s !== Status.NoResource && s !== Status.Blocked) continue;
      const k = e.def.kind;
      if (k === 'solar' || k === 'hub' || k === 'splitter' || k === 'storage' || k === 'generator') continue;
      const key = `${s}:${s === Status.NoInput ? e.missing : -1}:${e.def.key}`;
      const cause = s === Status.NoInput ? `il manque ${ITEMS[e.missing]?.name ?? '…'}` : s === Status.NoPower ? 'pas assez de courant' : s === Status.Blocked ? 'sortie bloquée' : 'plus rien à extraire';
      const gr = groups.get(key);
      if (gr) gr.n++; else groups.set(key, { n: 1, text: `${e.def.name} : ${cause}` });
    }
    // une seule ligne repliée quand plusieurs causes s'accumulent : les bulles sur les machines disent déjà le détail
    const list = [...groups];
    let html = '';
    if (list.length > 1) {
      const total = list.reduce((s, [, gr]) => s + gr.n, 0);
      html += `<button class="alert sum" data-alert-toggle="1" aria-expanded="${this.alertsOpen}"><b>${total}</b> machines arrêtées<span class="see">${this.alertsOpen ? 'replier' : 'détails'}</span></button>`;
    }
    if (list.length === 1 || this.alertsOpen) for (const [key, gr] of list.slice(0, 5)) html += `<button class="alert" data-alert="${key}"><b>${gr.n}</b> ${esc(gr.text)}<span class="see">montrer</span></button>`;
    if (!list.length) this.alertsOpen = false;
    if (html !== this.alertsKey) { this.alertsKey = html; $('alerts').innerHTML = html; }
  }

  /** La bulle d'aide d'une case de bâtiment : nom, description, recette, courant et coût. */
  private toolTipbox(b: BuildingDef, g: Game): string {
    const cost = b.cost.map(([id, n]) => `<span class="${g.stock[id] < n ? 'lack' : ''}">${itemIcon(ITEMS[id], 15)}${n} ${esc(ITEMS[id].name)}</span>`).join(' · ');
    const rec = b.recipes.length ? `<span>${esc(recipeWords(b.recipes[0]))}</span>` : '';
    const pw = b.power ? `<span>${['generator', 'solar', 'wind', 'hydro', 'hub'].includes(b.kind) ? `Fournit jusqu’à ${b.power} W` : b.kind === 'battery' ? '' : `Consomme ${b.power} W`}</span>` : '';
    return `<span class="tipbox"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>${rec}${pw}<span class="cost">${cost}</span></span>`;
  }

  private renderBar(g: Game): void {
    const tool = this.host.tool();
    if (g.quota !== this.seenUnlock) {
      for (const b of BUILDINGS) if (b.cat && b.unlock === g.quota && g.quota > 0) this.fresh.add(b.key);
      this.seenUnlock = g.quota;
      const first = BUILDINGS.find((b) => b.cat && b.unlock === g.quota);
      if (first?.cat && g.quota > 0) this.cat = first.cat;
    }
    // la barre suit l'outil seulement quand il vient de changer (pipette, raccourci) : on reste libre de feuilleter
    if (tool !== this.lastTool) {
      this.lastTool = tool;
      if (tool && tool !== 'demolir' && B[tool].cat) this.cat = B[tool].cat!;
    }
    const cats = CATEGORIES.filter((c) => BUILDINGS.some((b) => b.cat === c.key && g.unlocked(b)));
    const list = BUILDINGS.filter((b) => b.cat === this.cat && g.unlocked(b));
    const toolDef = tool && tool !== 'demolir' ? B[tool] ?? null : null;
    const pays = this.pixel && toolDef ? toolDef.cost.map(([id, n]) => (g.stock[id] >= n ? 1 : 0)).join('') : '';
    const key = [this.cat, tool, cats.length, list.map((b) => b.key + (g.affordable(b) ? 1 : 0)).join(), [...this.fresh].join(), pays].join('|');
    if (key === this.barKey) return;
    this.barKey = key;
    $('cats').innerHTML = cats.map((c) => `<button class="${c.key === this.cat ? 'on' : ''} ${BUILDINGS.some((b) => b.cat === c.key && this.fresh.has(b.key)) ? 'fresh' : ''}" data-cat="${c.key}">${c.name}</button>`).join('');
    if (this.pixel) {
      const cost = toolDef && toolDef.cost.length ? ` · ${toolDef.cost.map(([id, n]) => `<span class="${g.stock[id] < n ? 'lack' : ''}">${n} ${esc(ITEMS[id].name)}</span>`).join(' · ')}` : '';
      const hint = `<p class="hint">${toolHint(tool, toolDef)}${cost}</p>`;
      const tools = list.map((b, i) => {
        return `<button class="tool ${tool === b.key ? 'on' : ''} ${g.affordable(b) ? '' : 'poor'} ${this.fresh.has(b.key) ? 'fresh' : ''}" data-tool="${b.key}">
        <kbd>${i < 9 ? i + 1 : ''}</kbd><img src="${hudIconUrl(b.key)}" alt="" width="64" height="56"><span class="nm">${esc(b.name)}</span>
        ${this.toolTipbox(b, g)}</button>`;
      }).join('');
      const hands = `<button class="tool hands ${tool === null ? 'on' : ''}" data-hands="1"><kbd></kbd><img src="${hudIconUrl('poings')}" alt="" width="64" height="56"><span class="nm">Poings</span><span class="tipbox"><b>Poings</b><span>Mains libres : déracine, pioche, ramasse. Clic droit lâche aussi l’outil.</span></span></button>`;
      const demolish = `<button class="tool demolish ${tool === 'demolir' ? 'on' : ''}" data-tool="demolir"><kbd>X</kbd><img src="${hudIconUrl('demolir')}" alt="" width="64" height="56"><span class="nm">Démolir</span><span class="tipbox"><b>Démolir</b><span>Clique ou glisse sur ce que tu veux retirer. Tout est remboursé.</span></span></button>`;
      $('tools').innerHTML = hint + tools + hands + demolish;
      return;
    }
    $('tools').innerHTML = list.map((b, i) => {
      return `<button class="tool ${tool === b.key ? 'on' : ''} ${g.affordable(b) ? '' : 'poor'} ${this.fresh.has(b.key) ? 'fresh' : ''}" data-tool="${b.key}">
        <kbd>${i < 9 ? i + 1 : ''}</kbd><img src="${buildingIcon(b.key)}" alt=""><span class="nm">${esc(b.name)}</span>
        ${this.toolTipbox(b, g)}</button>`;
    }).join('') + `<button class="tool demolish ${tool === 'demolir' ? 'on' : ''}" data-tool="demolir"><kbd>X</kbd><svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true"><path d="M17 17 41 41M41 17 17 41" stroke="#ff6a5a" stroke-width="6" stroke-linecap="square"/></svg><span class="nm">Démolir</span><span class="tipbox"><b>Démolir</b><span>Clique ou glisse sur ce que tu veux retirer. Tout est remboursé.</span></span></button>`;
  }

  /** Bâtiments de la catégorie affichée, dans l'ordre des touches 1 à 9. */
  toolsInCategory(g: Game): string[] { return BUILDINGS.filter((b) => b.cat === this.cat && g.unlocked(b)).map((b) => b.key); }
  nextCategory(g: Game, dir: number): void {
    const cats = CATEGORIES.filter((c) => BUILDINGS.some((b) => b.cat === c.key && g.unlocked(b)));
    const i = cats.findIndex((c) => c.key === this.cat);
    this.cat = cats[(i + dir + cats.length) % cats.length].key;
    this.barKey = ''; this.renderBar(g);
  }

  // ------------------------------------------------------------- panneau
  /** État d'une entité en une phrase qui dit la cause. */
  statusLine(g: Game, e: Ent): { text: string; cls: string } {
    let text = STATUS_TEXT[e.status];
    if (e.status === Status.NoInput && e.missing >= 0) text = `Il manque : ${ITEMS[e.missing].name}`;
    if (e.status === Status.Working && g.power.sat < 0.999 && e.def.power && !['generator', 'solar', 'wind', 'hydro', 'battery'].includes(e.def.kind)) text = `Au ralenti : ${Math.round(g.power.sat * 100)} % du courant demandé`;
    if (e.def.kind === 'storage') text = `${e.outCount} / ${STORE_CAP} objets`;
    if (e.def.kind === 'hub') text = 'Reçoit tout ce qui arrive';
    if (e.def.kind === 'splitter') text = e.def.filter ? (e.filter >= 0 ? `Laisse passer : ${ITEMS[e.filter].name}` : 'Choisis l’objet à laisser passer') : 'Répartit le flux';
    const cls = e.status === Status.Working || e.def.kind === 'hub' ? 'ok' : e.status === Status.Idle || e.status === Status.Dark || e.def.kind === 'splitter' || e.def.kind === 'storage' ? '' : 'bad';
    return { text, cls: e.def.kind === 'splitter' && e.def.filter && e.filter < 0 ? 'bad' : cls };
  }

  private renderPanel(g: Game, force: boolean): void {
    const e = this.selected!;
    const k = e.def.kind;
    const st = this.statusLine(g, e);
    let body = '';
    const give = '<button class="act" data-act="feed">Donner depuis mon stock</button>', grab = '<button class="act" data-act="take">Prendre la sortie</button>';
    if (k === 'machine') {
      const r = e.recipe;
      const list = e.def.recipes.filter((x) => g.quota >= x.unlock);
      if (list.length > 1) body += `<div class="recipes">${list.map((x) => `<button class="${x === r ? 'on' : ''}" data-recipe="${x.key}">${esc(x.name)}</button>`).join('')}</div>`;
      if (r) {
        body += `<div class="eq">${equation(r)}</div><p class="note">${esc(recipeWords(r))}. ${esc(r.note)}</p>`;
        body += `<div class="bar big"><i style="width:${(e.working ? (100 * e.progress) / r.time : 0).toFixed(0)}%"></i></div>`;
        body += `<div class="io"><div><span class="eyebrow">Entrées</span>${r.inputs.map(([id, n]) => itemTag(id, `${e.buf![id]}/${n * 2}`)).join('') || '—'}${give}</div><div><span class="eyebrow">Sorties</span>${r.outputs.map(([id]) => itemTag(id, e.out![id])).join('')}${grab}</div></div>`;
        const perMin = (3600 / r.time) * e.def.speed;
        body += `<p class="meta">À plein régime : ${r.outputs.map(([id, n]) => `${(n * perMin).toFixed(0)} ${ITEMS[id].name}`).join(', ')} par minute · consomme ${e.def.power} W</p>`;
      }
    } else if (k === 'miner') {
      let left = 0;
      const cells = e.cells!;
      for (let i = 0; i < cells.length; i += 2) left += g.world.amount(cells[i], cells[i + 1]);
      body += `<p class="meta">Reste sous le Puits : <b>${fmt(left)}</b> · ${Math.round(60 * e.def.speed)} par minute · consomme ${e.def.power} W</p>`;
    } else if (k === 'sawmill') {
      body += `<p class="meta">Jusqu’à 40 bois par minute. Les arbres repoussent là où ils étaient, sauf sous une dalle.</p>${grab}`;
    } else if (k === 'generator') {
      body += `<div class="io"><div><span class="eyebrow">Combustible</span>${e.def.fuels.map((id) => itemTag(id, e.buf![id])).join('')}${give}</div></div><p class="meta">Fournit <b>${Math.round(e.flow)} W</b> sur ${e.def.power}. Ne brûle que ce que l’usine demande.</p>`;
    } else if (k === 'solar') {
      body += `<p class="meta">Éclairement : <b>${Math.round(e.light * 100)} %</b> → ${Math.round(e.light * e.def.power)} W</p>`;
    } else if (k === 'wind') {
      body += `<p class="meta">Vent : <b>${Math.round(g.wind * 100)} %</b> → ${Math.round(e.flow)} W</p>`;
    } else if (k === 'hydro') {
      body += `<p class="meta">Fournit <b>${e.def.power} W</b> en continu.</p>`;
    } else if (k === 'battery') {
      body += `<div class="bar big"><i style="width:${(100 * e.energy / ACCU_CAP).toFixed(0)}%"></i></div><p class="meta">${(e.energy / 1000).toFixed(1)} / ${ACCU_CAP / 1000} kJ · ${e.flow >= 0 ? 'fournit' : 'se charge de'} ${Math.abs(Math.round(e.flow))} W</p>`;
    } else if (k === 'storage') {
      body += `<div class="io"><div><span class="eyebrow">Contenu</span>${ITEMS.filter((it) => e.out![it.id] > 0).map((it) => itemTag(it.id, e.out![it.id])).join('') || '—'}${grab}</div></div>`;
    } else if (k === 'splitter' && e.def.filter) {
      body += `<div class="filters">${ITEMS.filter((it) => g.stock[it.id] > 0 || g.made[it.id] || e.filter === it.id).map((it) => `<button class="${e.filter === it.id ? 'on' : ''}" data-filter="${it.id}">${itemIcon(it)}${esc(it.name)}</button>`).join('')}</div>`;
    } else if (k === 'hub') {
      body += `<p class="meta">Énergie fournie : ${e.def.power} W. Objets reçus : ${fmt(e.done)}.</p>`;
      if (g.records.length) body += `<div class="eyebrow">Tes records</div><table class="records"><tr><th>Quota</th><th>Durée</th><th>Bâtiments</th></tr>${g.records.slice(-6).map((r) => `<tr><td>${esc(quotaAt(r.quota).title)}</td><td>${clock(r.ticks)}</td><td>${r.buildings}</td></tr>`).join('')}</table>`;
    }
    const html = `<header><div><div class="eyebrow">${esc(CATEGORIES.find((c) => c.key === e.def.cat)?.name ?? 'Monument')}</div><h2>${esc(e.def.name)}</h2></div><button class="x" data-close="panel" aria-label="Fermer">✕</button></header>
      <div class="status ${st.cls}">${esc(st.text)}</div><p class="desc">${esc(e.def.desc)}</p>${body}`;
    if (!force && html === this.panelKey) return;
    this.panelKey = html;
    $('panel').innerHTML = html;
  }

  // ------------------------------------------------------------- bannière
  banner(g: Game): void {
    const rec = g.records[g.records.length - 1];
    const done = quotaAt(rec.quota), next = quotaAt(g.quota);
    const unlocked = BUILDINGS.filter((b) => b.cat && b.unlock === g.quota).map((b) => b.name);
    const el = $('banner');
    el.innerHTML = `<div class="eyebrow">Quota accompli</div><h1>${esc(done.title)}</h1>
      <div class="metrics"><span><b>${clock(rec.ticks)}</b>durée</span><span><b>${rec.buildings}</b>bâtiments</span></div>
      <p class="lore">${esc(next.lore)}</p>${unlocked.length ? `<p class="unlock">Nouveau : ${unlocked.map(esc).join(' · ')}</p>` : ''}`;
    el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => { el.hidden = true; }, 9000);
  }

  // ------------------------------------------------------------- atlas
  openCodex(entry?: string): void {
    $('codex').hidden = false;
    if (entry) { this.codexHistory.push(entry); this.renderCodexEntry(entry); }
    else (document.getElementById('codex-search') as HTMLInputElement).focus();
    this.renderCodexList();
  }
  closeCodex(): void { $('codex').hidden = true; }
  get codexOpen(): boolean { return !$('codex').hidden; }
  get guideOpen(): boolean { return !$('guide').hidden; }
  showGuide(show: boolean): void { $('guide').hidden = !show; }

  private renderCodexList(): void {
    const g = this.host.game();
    const q = (document.getElementById('codex-search') as HTMLInputElement).value.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    // on ne montre que ce qui a été découvert : pas de divulgâchage
    const seen = (id: number) => id < 3 || id === I.bois || g.stock[id] > 0 || g.made[id] === 1 || RECIPES.some((r) => g.quota >= r.unlock && (r.inputs.some(([x]) => x === id) || r.outputs.some(([x]) => x === id)));
    const items = ITEMS.filter((it) => seen(it.id) && (match(it.name) || match(it.formula))).map((it) => `<button data-codex="i:${it.id}">${itemIcon(it)} ${esc(it.name)} <small>${prettyFormula(it.formula)}</small></button>`);
    const builds = BUILDINGS.filter((b) => g.unlocked(b) && match(b.name)).map((b) => this.pixel
      ? `<button data-codex="b:${b.key}"><img src="${hudIconUrl(b.key)}" alt="" width="32" height="28"> ${esc(b.name)}</button>`
      : `<button data-codex="b:${b.key}"><img src="${buildingIcon(b.key)}" alt="" width="24" height="24"> ${esc(b.name)}</button>`);
    const recs = RECIPES.filter((r) => g.quota >= r.unlock && match(r.name)).map((r) => `<button data-codex="r:${r.key}">${esc(r.name)}</button>`);
    $('codex-list').innerHTML = `<div class="eyebrow">Objets</div>${items.join('')}<div class="eyebrow">Bâtiments</div>${builds.join('')}<div class="eyebrow">Recettes</div>${recs.join('')}`;
  }

  private renderCodexEntry(entry: string): void {
    const g = this.host.game();
    const [type, id] = entry.split(':');
    const where = (r: Recipe) => BUILDINGS.find((b) => b.recipes.includes(r) || (b.kind === 'generator' && r.key.startsWith('combustion') && r.inputs.some(([x]) => b.fuels.includes(x))));
    const recipeCard = (r: Recipe) => `<button class="rcard" data-codex="r:${r.key}"><b>${esc(r.name)}</b> <small>${esc(where(r)?.name ?? '')}</small><div class="eq">${equation(r)}</div></button>`;
    const known = (r: Recipe) => g.quota >= r.unlock;
    let html = '';
    if (type === 'i') {
      const it = ITEMS[+id];
      const made = RECIPES.filter((r) => known(r) && r.outputs.some(([x]) => x === it.id));
      const used = RECIPES.filter((r) => known(r) && r.inputs.some(([x]) => x === it.id));
      const builds = BUILDINGS.filter((b) => g.unlocked(b) && b.cost.some(([x]) => x === it.id));
      html = `<h2>${itemIcon(it, 28)} ${esc(it.name)} <small>${prettyFormula(it.formula)}</small></h2><p>${esc(it.desc)}</p>
        <div class="eyebrow">D’où ça vient</div>${made.map(recipeCard).join('') || '<p class="meta">Se récolte dans le monde : à la main, ou avec un Puits ou une Scierie.</p>'}
        <div class="eyebrow">À quoi ça sert</div>${used.map(recipeCard).join('')}${builds.length ? `<p class="meta">Pour construire : ${builds.map((b) => `<button class="link" data-codex="b:${b.key}">${esc(b.name)}</button>`).join(', ')}</p>` : ''}${!used.length && !builds.length ? '<p class="meta">Rien de connu pour l’instant.</p>' : ''}`;
    } else if (type === 'b') {
      const b = B[id];
      const recs = b.recipes.filter(known);
      const icon = this.pixel
        ? `<img src="${hudIconUrl(b.key)}" alt="" width="64" height="56">`
        : `<img src="${buildingIcon(b.key)}" alt="" width="52" height="52">`;
      html = `<h2>${icon} ${esc(b.name)}</h2><p>${esc(b.desc)}</p>
        <p class="meta">Emprise ${b.w}×${b.h} · Coût : ${b.cost.map(([x, n]) => itemTag(x, n)).join(' ') || '—'}${b.power ? ` · ${b.power} W` : ''}</p>
        ${recs.length ? `<div class="eyebrow">Recettes</div>${recs.map(recipeCard).join('')}` : ''}`;
    } else {
      const r = RECIPES.find((x) => x.key === id)!;
      const b = where(r);
      html = `<h2>${esc(r.name)}</h2><div class="eq big">${equation(r)}</div><p>${esc(recipeWords(r))}. ${esc(r.note)}</p>
        <p class="meta">${b ? `Dans : <button class="link" data-codex="b:${b.key}">${esc(b.name)}</button> · ` : ''}${(r.time / 60).toFixed(1)} s par cycle</p>
        <div class="eyebrow">Objets</div><p>${[...r.inputs, ...r.outputs].map(([x]) => itemTag(x)).join(' ')}</p>`;
    }
    const back = this.codexHistory.length > 1 ? `<button class="link" data-menu="codex-back">← retour</button>` : '';
    $('codex-entry').innerHTML = back + html;
  }

  codexBack(): void {
    this.codexHistory.pop();
    const prev = this.codexHistory[this.codexHistory.length - 1];
    if (prev) this.renderCodexEntry(prev);
  }

  // ------------------------------------------------------------- menu
  toggleMenu(show?: boolean): boolean {
    const el = $('menu');
    el.hidden = show === undefined ? !el.hidden : !show;
    if (!el.hidden) $('players').innerHTML = this.host.playerLines().map((l) => `<li>${l}</li>`).join('');
    return !el.hidden;
  }
  get menuOpen(): boolean { return !$('menu').hidden; }
}
