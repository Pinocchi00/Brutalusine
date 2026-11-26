// La phrase d'aide de la barre de construction : pure, sans DOM, pour être testée seule.

/** Échappe les quatre caractères qui casseraient le HTML de la phrase. */
function escapeName(name: string): string {
  return name.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
}

/** La phrase d'aide de la barre : le nom de l'outil en gras, puis ce que fait le clic. HTML échappé. */
export function toolHint(tool: string | null, def: { name: string; kind: string } | null): string {
  if (tool === null || (tool !== 'demolir' && tool !== 'marteau' && def === null)) return '<b>Poings</b> · clique un arbre, un rocher, un débris, une bête ou une épave';
  if (tool === 'demolir') return '<b>Démolir</b> · clique ou glisse · tout est remboursé';
  if (tool === 'marteau') return '<b>Marteau</b> · clique ou glisse · refait dans la matière de l’ère';
  if (def!.kind === 'belt') return '<b>Convoyeur</b> · glisse pour tracer';
  if (def!.kind === 'slab') return `<b>${escapeName(def!.name)}</b> · clique ou glisse pour paver`;
  return `<b>${escapeName(def!.name)}</b> · clique pour poser · R pivote`;
}
