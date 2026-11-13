// Interface : le monde reste visible, l'action est près de la donnée, toute alerte dit sa cause.
// (Les douze lois du dossier UI/UX sont résumées dans docs/DESIGN.md.)

import {
  B, BUILD_BAR, BUILDINGS, ITEMS, MACHINE_RECIPES, NITEMS, RECIPES, UPGRADES, FUEL, I, quotaAt,
  type BuildingDef, type ItemDef, type Recipe,
} from '../sim/data';
import { ACCU_CAP, type Game } from '../sim/game';
import { Status, STATUS_TEXT, type Ent } from '../sim/ent';
import { prettyFormula } from '../sim/chem';
import { buildingIcon } from '../render/sprites';

export interface HudHost {
  game(): Game;
  selectTool(key: string | null): void;
  currentTool(): string | null;
  setRecipe(e: Ent, key: string): void;
  setFilter(e: Ent, id: number): void;
  buyUpgrade(key: string): void;
  ping(list: Ent[]): void;
  menu(action: string, value?: string): void;
  playerLines(): string[];
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.floor(n).toLocaleString('fr-FR'));

/** Icône d'objet : la forme double la couleur (rien d'essentiel ne dépend de la couleur seule). */
export function itemIcon(it: ItemDef, size = 16): string {
  const s = { rond: '<circle cx="8" cy="8" r="5.5"/>', carre: '<rect x="3" y="3" width="10" height="10"/>', losange: '<path d="M8 1.5 14.5 8 8 14.5 1.5 8Z"/>', triangle: '<path d="M8 2 14.5 13.5H1.5Z"/>', hexa: '<path d="M14 8 11 13.2H5L2 8 5 2.8h6Z"/>', goutte: '<path d="M8 1.5C11 6 13 8 13 10.5a5 5 0 0 1-10 0C3 8 5 6 8 1.5Z"/>' }[it.shape];
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 16 16" fill="${it.color}" stroke="#1B1446" stroke-width="1.2" aria-hidden="true">${s}</svg>`;
}
const itemTag = (id: number, n?: number | string) => `<button class="item" data-codex="i:${id}">${itemIcon(ITEMS[id])}${n !== undefined ? `<b>${n}</b> ` : ''}${esc(ITEMS[id].name)}</button>`;

function equation(r: Recipe): string {
  const side = (items: [number, number][], gases: [string, number][]) => [
    ...items.map(([id, n]) => `<span class="term">${n > 1 ? n + ' ' : ''}${itemIcon(ITEMS[id], 13)}${prettyFormula(ITEMS[id].formula)}</span>`),
    ...gases.map(([g, n]) => `<span class="term gas">${n > 1 ? n + ' ' : ''}${prettyFormula(g)}</span>`),
  ].join(' + ');
  return `${side(r.inputs, r.gasIn)} <span class="arrow">→</span> ${side(r.outputs, r.gasOut) || '<span class="term gas">énergie</span>'}`;
}

export class Hud {
  selected: Ent | null = null;
  private codexHistory: string[] = [];
  private lastUnlock = 0;
  private toastTimer = 0;
  private bannerTimer = 0;
  private barKey = '';

  constructor(private host: HudHost) {
    document.addEventListener('click', (ev) => this.onClick(ev));
    $('codex-search').addEventListener('input', () => this.renderCodexList());
    $('opt-volume').addEventListener('input', (ev) => host.menu('volume', (ev.target as HTMLInputElement).value));
    $('opt-tilt').addEventListener('change', (ev) => host.menu('tilt', String((ev.target as HTMLInputElement).checked)));
  }

  private onClick(ev: MouseEvent): void {
    const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tool],[data-recipe],[data-filter],[data-codex],[data-upgrade],[data-menu],[data-alert],[data-close]');
    if (!t) return;
    const d = t.dataset;
    const g = this.host.game();
    if (d.tool !== undefined) this.host.selectTool(this.host.currentTool() === d.tool ? null : d.tool);
    else if (d.recipe !== undefined && this.selected) { this.host.setRecipe(this.selected, d.recipe); this.renderPanel(g, true); }
    else if (d.filter !== undefined && this.selected) { this.host.setFilter(this.selected, +d.filter); this.renderPanel(g, true); }
    else if (d.codex !== undefined) this.openCodex(d.codex);
    else if (d.upgrade !== undefined) { this.host.buyUpgrade(d.upgrade); this.renderPanel(g, true); }
    else if (d.menu !== undefined) this.host.menu(d.menu);
    else if (d.alert !== undefined) {
      const [st, miss, key] = d.alert.split(':');
      this.host.ping(g.tickers.filter((e) => e.def.key === key && e.status === +st && (+st !== Status.NoInput || e.missing === +miss)));
    } else if (d.close !== undefined) {
      if (d.close === 'panel') this.select(null); else $(d.close).hidden = true;
    }
  }

  // ------------------------------------------------------------- sélection
  select(e: Ent | null): void {
    this.selected = e;
    $('panel').hidden = !e;
    if (e) this.renderPanel(this.host.game(), true);
  }

  toast(text: string): void {
    const el = $('toast');
    el.textContent = text; el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------- mise à jour (5 Hz)
  update(g: Game): void {
    this.renderQuota(g);
    this.renderTop(g);
    this.renderStock(g);
    this.renderAlerts(g);
    this.renderBar(g);
    if (this.selected) {
      if (this.selected.dead) this.select(null); else this.renderPanel(g, false);
    }
  }

  private renderQuota(g: Game): void {
    const q = quotaAt(g.quota);
    const rows = q.need.map(([id, n]) => {
      const have = Math.min(n, g.delivered[id]);
      return `<div class="need">${itemTag(id)}<span class="count">${fmt(have)} / ${fmt(n)}</span><div class="bar"><i style="width:${(100 * have / n).toFixed(1)}%"></i></div></div>`;
    }).join('');
    $('quota').innerHTML = `<div class="eyebrow">Quota ${String(g.quota + 1).padStart(2, '0')} · ${esc(q.title)}</div><h2>${esc(q.verb)}</h2>${rows}<p class="hint">${esc(q.hint)}</p>`;
  }

  private renderTop(g: Game): void {
    const s = g.sun;
    const hh = Math.floor(s.hour), mm = Math.floor((s.hour % 1) * 60);
    const reg = g.regions[g.hub.region];
    const demand = reg ? reg.lastDemand : 0, cap = reg ? reg.capacity : 0, sat = reg ? reg.sat : 1;
    const low = sat < 0.999 && demand > 0;
    const angle = s.t * 360;
    const ppm = g.ppm();
    const savoir = g.savoir > 0 ? `<button class="chip savoir" data-menu="savoir" title="Savoir à investir : clique sur la Tour">◆ ${g.savoir} Savoir</button>` : '';
    $('topbar').innerHTML = `
      <div class="chip" title="Le soleil alimente les héliostats et la canopée. Les ombres tournent."><svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true"><circle r="9.5" fill="none" stroke="#1B1446" stroke-width="1.5"/><path d="M-9.5 0A9.5 9.5 0 0 0 9.5 0Z" fill="#2E1C70" transform="rotate(${-angle + 117})"/><circle r="2.2" fill="${s.day ? '#FFC24A' : '#8CFBE8'}" transform="rotate(${angle - 207}) translate(6 0)"/></svg><b>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}</b> ${s.day ? 'jour' : g.bloom > 0.2 ? 'floraison' : 'nuit'}</div>
      <div class="chip ${low ? 'bad' : ''}" title="Réseau de la Tour : demande / capacité. Les dalles contiguës forment un même réseau.">⚡ <b>${Math.round(demand)}</b> / ${Math.round(cap)} W${low ? ` · ${Math.round(sat * 100)} %` : ''}${reg && reg.accus.length ? ` · ▮ ${Math.round(100 * reg.stored / (reg.accus.length * ACCU_CAP))} %` : ''}</div>
      <div class="chip" title="CO₂ atmosphérique. Plus il y en a, plus la jungle repousse vite : elle se nourrit de ce que l’usine rejette.">CO₂ <b>${Math.round(ppm)}</b> ppm</div>
      <div class="chip ${g.jungleHealth < 0.5 ? 'bad' : ''}" title="Santé moyenne des Éventails connus : canopée alentour, moins la fumée.">Jungle <b>${Math.round(g.jungleHealth * 100)} %</b></div>${savoir}`;
  }

  private renderStock(g: Game): void {
    let html = '';
    for (let i = 0; i < NITEMS; i++) {
      const n = g.stock[i];
      const rate = g.stats.rate(g.stats.prod, i) - g.stats.rate(g.stats.cons, i);
      if (n < 1 && Math.abs(rate) < 0.5) continue;
      html += `<button class="row" data-codex="i:${i}">${itemIcon(ITEMS[i])}<span class="name">${esc(ITEMS[i].name)}</span><span class="rate ${rate < -0.5 ? 'neg' : ''}">${Math.abs(rate) >= 0.5 ? (rate > 0 ? '+' : '−') + Math.abs(Math.round(rate)) + '/min' : ''}</span><b>${fmt(n)}</b></button>`;
    }
    $('stock').innerHTML = `<div class="eyebrow">Stock de la Tour</div>${html}`;
  }

  private renderAlerts(g: Game): void {
    const groups = new Map<string, { n: number; text: string }>();
    for (const e of g.tickers) {
      const s = e.status;
      if (s !== Status.NoInput && s !== Status.NoPower && s !== Status.NoResource && s !== Status.Blocked) continue;
      if (e.def.kind === 'solar' || e.def.kind === 'hub' || e.def.kind === 'splitter') continue;
      const key = `${s}:${s === Status.NoInput ? e.missing : -1}:${e.def.key}`;
      const cause = s === Status.NoInput ? `il manque ${ITEMS[e.missing]?.name ?? '…'}` : s === Status.NoPower ? 'pas de courant' : s === Status.Blocked ? 'sortie bloquée' : 'plus rien à extraire';
      const gr = groups.get(key);
      if (gr) gr.n++; else groups.set(key, { n: 1, text: `${e.def.name} : ${cause}` });
    }
    let html = '';
    for (const [key, gr] of [...groups].slice(0, 5)) html += `<button class="alert" data-alert="${key}"><b>${gr.n}</b> ${esc(gr.text)}<span class="go">voir</span></button>`;
    $('alerts').innerHTML = html;
  }

  private renderBar(g: Game): void {
    const tool = this.host.currentTool();
    const list = BUILD_BAR.map((k) => B[k]).filter((b) => g.unlocked(b));
    const key = list.map((b) => b.key).join() + '|' + tool + '|' + list.map((b) => this.affordable(g, b)).join('');
    if (key === this.barKey) return;
    this.barKey = key;
    const fresh = g.quota !== this.lastUnlock;
    $('buildbar').innerHTML = list.map((b, i) => {
      const hot = i < 9 ? String(i + 1) : i === 9 ? '0' : '';
      const cost = b.cost.map(([id, n]) => `${itemIcon(ITEMS[id], 13)}${n}`).join(' ');
      const isNew = fresh && b.unlock === g.quota && g.quota > 0;
      return `<button class="tool ${tool === b.key ? 'on' : ''} ${this.affordable(g, b) ? '' : 'poor'} ${isNew ? 'new' : ''}" data-tool="${b.key}" aria-label="${esc(b.name)}">
        <img src="${buildingIcon(b.key, b.w, b.h)}" alt=""><kbd>${hot}</kbd>
        <span class="tip"><b>${esc(b.name)}</b><span>${esc(b.desc)}</span><span class="cost">${cost}${b.power && b.kind !== 'generator' && b.kind !== 'solar' && b.kind !== 'battery' ? ` · ⚡ ${b.power} W` : ''}</span></span></button>`;
    }).join('');
    this.lastUnlock = g.quota;
  }

  private affordable(g: Game, b: BuildingDef): boolean {
    return b.cost.every(([id, n]) => g.stock[id] >= n);
  }

  // ------------------------------------------------------------- panneau
  private panelKey = '';
  private renderPanel(g: Game, force: boolean): void {
    const e = this.selected!;
    const k = e.def.kind;
    const reg = g.regions[e.region];
    let status = STATUS_TEXT[e.status];
    if (e.status === Status.NoInput && e.missing >= 0) status = `Il manque : ${ITEMS[e.missing].name}`;
    if (e.status === Status.Working && reg && reg.sat < 0.999) status = `Sous-alimenté : ${Math.round(reg.sat * 100)} % du courant demandé`;
    const cls = e.status === Status.Working ? 'ok' : e.status === Status.Idle || e.status === Status.Dark ? '' : 'bad';
    let body = '';
    if (k === 'machine' || k === 'scrubber' || k === 'ring') {
      const r = e.recipe;
      const list = k === 'machine' ? (MACHINE_RECIPES[e.def.key] ?? []).filter((x) => g.quota >= x.unlock) : [];
      if (list.length > 1) body += `<div class="recipes">${list.map((x) => `<button class="${x === r ? 'on' : ''}" data-recipe="${x.key}">${x.outputs.map(([id]) => itemIcon(ITEMS[id])).join('')} ${esc(x.name)}</button>`).join('')}</div>`;
      if (r) {
        body += `<div class="eq">${equation(r)}</div><p class="note">${esc(r.note)}</p>`;
        body += `<div class="bar big"><i style="width:${(e.working ? (100 * e.progress) / r.time : 0).toFixed(0)}%"></i></div>`;
        body += `<div class="io"><div><span class="eyebrow">Entrées</span>${r.inputs.map(([id, n]) => itemTag(id, `${e.buf![id]}/${n * 2}`)).join('') || '—'}${k === 'scrubber' ? `<span class="gasline">SO₂ capté : ${Math.floor(e.gas)}</span>` : ''}</div><div><span class="eyebrow">Sorties</span>${r.outputs.map(([id]) => itemTag(id, e.out![id])).join('')}</div></div>`;
        const perMin = (60 * 60) / r.time;
        body += `<p class="meta">Cadence nominale : ${r.outputs.map(([id, n]) => `${(n * perMin).toFixed(0)} ${ITEMS[id].name}`).join(', ')} / min · ⚡ ${e.def.power} W</p>`;
      }
      if (k === 'ring') body += `<p class="meta">Santé de la jungle alentour : <b>${Math.round(e.health * 100)} %</b>. Le rendement lui est proportionnel${g.bloom > 0.1 ? ' — <b>floraison : ×2</b>' : ''}.</p>`;
    } else if (k === 'miner') {
      let left = 0;
      const cells = e.cells!;
      for (let i = 0; i < cells.length; i += 2) left += g.world.amount(cells[i], cells[i + 1]);
      body += `<p class="meta">Reste à portée : <b>${fmt(left)}</b> unités · 60 / min · ⚡ ${e.def.power} W</p>`;
    } else if (k === 'sawmill') {
      body += `<p class="meta">Coupe la case la plus dense dans un rayon de 5. Une forêt à moitié pleine repousse le plus vite : couper moins, c’est récolter plus longtemps.</p>`;
    } else if (k === 'generator') {
      body += `<div class="io"><div><span class="eyebrow">Combustible</span>${Object.keys(FUEL).map((id) => itemTag(+id, e.buf![+id])).join('')}</div></div><p class="meta">Fournit <b>${Math.round(e.flow)} W</b> sur ${e.def.power}. Ne brûle que ce que le réseau demande.</p>`;
    } else if (k === 'solar') {
      body += `<p class="meta">Éclairement : <b>${Math.round(e.light * 100)} %</b> → ${Math.round(e.light * e.def.power)} W</p>`;
    } else if (k === 'battery') {
      body += `<div class="bar big"><i style="width:${(100 * e.energy / ACCU_CAP).toFixed(0)}%"></i></div><p class="meta">${(e.energy / 1000).toFixed(1)} / ${ACCU_CAP / 1000} kJ · ${e.flow >= 0 ? 'fournit' : 'absorbe'} ${Math.abs(Math.round(e.flow))} W</p>`;
    } else if (k === 'splitter') {
      body += `<p class="meta">Filtre : l’objet choisi va tout droit, les autres sur les côtés.</p><div class="filters"><button class="${e.filter < 0 ? 'on' : ''}" data-filter="-1">aucun</button>${ITEMS.filter((it) => g.stock[it.id] > 0 || g.stats.rate(g.stats.prod, it.id) > 0 || e.filter === it.id).map((it) => `<button class="${e.filter === it.id ? 'on' : ''}" data-filter="${it.id}" title="${esc(it.name)}">${itemIcon(it, 18)}</button>`).join('')}</div>`;
    } else if (k === 'tree') {
      body += `<p class="meta">Santé : <b>${Math.round(e.health * 100)} %</b>. Son cœur bat avec la canopée qui l’entoure. Un Cerclage en recueillerait la Lueur.</p>`;
    } else if (k === 'hub') {
      body += `<p class="meta">Étages : <b>${3 + e.level}</b>. Énergie de base : ${e.def.power} W.</p>`;
      body += `<div class="eyebrow">Savoir : ${g.savoir} à investir</div><div class="upgrades">${UPGRADES.map((u) => `<button data-upgrade="${u.key}" ${g.savoir < 1 ? 'disabled' : ''}><b>${esc(u.name)} · niv. ${g.upgrades[u.key]}</b><span>${esc(u.desc)}</span></button>`).join('')}</div>`;
      if (g.records.length) body += `<div class="eyebrow">Records</div><table class="records"><tr><th>Quota</th><th>Durée</th><th>Dalles</th><th>CO₂</th></tr>${g.records.slice(-6).map((r) => `<tr><td>${esc(quotaAt(r.quota).title)}</td><td>${Math.floor(r.ticks / 3600)} min ${String(Math.floor((r.ticks / 60) % 60)).padStart(2, '0')}</td><td>${r.slabs}</td><td>${fmt(r.co2)}</td></tr>`).join('')}</table>`;
    }
    const html = `<header><div><div class="eyebrow">${k === 'tree' ? 'Planète' : 'Bâtiment'}</div><h2>${esc(e.def.name)}</h2></div><button class="x" data-close="panel" aria-label="Fermer">✕</button></header>
      <div class="status ${cls}">${esc(status)}</div><p class="desc">${esc(e.def.desc)}</p>${body}`;
    if (!force && html === this.panelKey) return;
    this.panelKey = html;
    $('panel').innerHTML = html;
  }

  // ------------------------------------------------------------- bannière
  banner(g: Game): void {
    const rec = g.records[g.records.length - 1];
    const done = quotaAt(rec.quota), next = quotaAt(g.quota);
    const unlocked = [...BUILDINGS.filter((b) => b.unlock === g.quota).map((b) => b.name), ...RECIPES.filter((r) => r.unlock === g.quota && r.machine !== 'amphi').map((r) => r.name)];
    const el = $('banner');
    el.innerHTML = `<div class="eyebrow">Quota accompli</div><h1>${esc(done.title)}</h1>
      <div class="metrics"><span><b>${Math.floor(rec.ticks / 3600)} min ${String(Math.floor((rec.ticks / 60) % 60)).padStart(2, '0')}</b>durée</span><span><b>${rec.slabs}</b>dalles posées</span><span><b>${fmt(rec.co2)}</b>CO₂ émis</span></div>
      <p class="lore">${esc(next.lore)}</p>${unlocked.length ? `<p class="unlock">Débloqué : ${unlocked.map(esc).join(' · ')}</p>` : ''}`;
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

  private renderCodexList(): void {
    const g = this.host.game();
    const q = (document.getElementById('codex-search') as HTMLInputElement).value.trim().toLowerCase();
    const match = (s: string) => !q || s.toLowerCase().includes(q);
    // on ne montre que ce qui a été découvert : pas de divulgâchage
    const seen = (id: number) => id < 3 || id === I.biomasse || g.stock[id] > 0 || RECIPES.some((r) => g.quota >= r.unlock && (r.inputs.some(([x]) => x === id) || r.outputs.some(([x]) => x === id)));
    const items = ITEMS.filter((it) => seen(it.id) && (match(it.name) || match(it.formula))).map((it) => `<button data-codex="i:${it.id}">${itemIcon(it)} ${esc(it.name)} <small>${prettyFormula(it.formula)}</small></button>`);
    const builds = BUILDINGS.filter((b) => g.unlocked(b) && match(b.name)).map((b) => `<button data-codex="b:${b.key}"><img src="${buildingIcon(b.key, b.w, b.h)}" alt="" width="18" height="18"> ${esc(b.name)}</button>`);
    const recs = RECIPES.filter((r) => g.quota >= r.unlock && match(r.name)).map((r) => `<button data-codex="r:${r.key}">⚗ ${esc(r.name)}</button>`);
    $('codex-list').innerHTML = `<div class="eyebrow">Objets</div>${items.join('')}<div class="eyebrow">Bâtiments</div>${builds.join('')}<div class="eyebrow">Réactions</div>${recs.join('')}`;
  }

  private renderCodexEntry(entry: string): void {
    const g = this.host.game();
    const [type, id] = entry.split(':');
    const recipeCard = (r: Recipe) => `<button class="rcard" data-codex="r:${r.key}"><b>${esc(r.name)}</b> <small>${esc(B[r.machine]?.name ?? '')}</small><div class="eq">${equation(r)}</div></button>`;
    const known = (r: Recipe) => g.quota >= r.unlock;
    let html = '';
    if (type === 'i') {
      const it = ITEMS[+id];
      const made = RECIPES.filter((r) => known(r) && r.outputs.some(([x]) => x === it.id));
      const used = RECIPES.filter((r) => known(r) && r.inputs.some(([x]) => x === it.id));
      const builds = BUILDINGS.filter((b) => g.unlocked(b) && b.cost.some(([x]) => x === it.id));
      html = `<h2>${itemIcon(it, 24)} ${esc(it.name)} <small>${prettyFormula(it.formula)}</small></h2><p>${esc(it.desc)}</p>
        <div class="eyebrow">D’où ça vient</div>${made.map(recipeCard).join('') || '<p class="meta">Extrait du sol, de la jungle ou de la rivière — ou pas encore découvert.</p>'}
        <div class="eyebrow">À quoi ça sert</div>${used.map(recipeCard).join('')}${builds.length ? `<p class="meta">Construction : ${builds.map((b) => `<button class="link" data-codex="b:${b.key}">${esc(b.name)}</button>`).join(', ')}</p>` : ''}${!used.length && !builds.length ? '<p class="meta">Rien de connu pour l’instant.</p>' : ''}`;
    } else if (type === 'b') {
      const b = B[id];
      const recs = (MACHINE_RECIPES[b.key] ?? []).filter(known);
      html = `<h2><img src="${buildingIcon(b.key, b.w, b.h)}" alt="" width="36" height="36"> ${esc(b.name)}</h2><p>${esc(b.desc)}</p>
        <p class="meta">Emprise ${b.w}×${b.h} · Coût : ${b.cost.map(([x, n]) => itemTag(x, n)).join(' ') || '—'}${b.power ? ` · ⚡ ${b.power} W` : ''}</p>
        ${recs.length ? `<div class="eyebrow">Réactions</div>${recs.map(recipeCard).join('')}` : ''}`;
    } else {
      const r = RECIPES.find((x) => x.key === id)!;
      html = `<h2>${esc(r.name)}</h2><div class="eq big">${equation(r)}</div><p>${esc(r.note)}</p>
        <p class="meta">Dans : <button class="link" data-codex="b:${r.machine}">${esc(B[r.machine].name)}</button> · ${(r.time / 60).toFixed(1)} s par cycle</p>
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

  hint(text: string): void { const el = $('hint'); if (el.textContent !== text) el.textContent = text; }
}

export { I };
