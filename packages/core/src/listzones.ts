// Zones d'un écran de gestion : la liste de contenu (jeux, médias, fichiers, téléchargements,
// bibliothèque d'un ami…) et les actions de l'écran (« Retour », les autres gestes).
//
// Octobre 2026 : dans une longue liste, revenir aux actions du même écran demandait de la
// parcourir jusqu'au bout, et Exit quittait l'écran entier. Les règles :
// - la zone se décide par nature, jamais par longueur : une action montrée dans la liste de
//   contenu (carte d'un média, ligne à choisir, ligne de la Santé) est dans la liste ; toutes les
//   autres sont les actions de l'écran. Une liste d'options (Section.options : deux ou trois
//   réglages au choix) n'est pas une liste de contenu ;
// - Exit dans la liste ramène aux actions de l'écran : sur l'entrée par laquelle on y était entré,
//   sinon sur celle qui fait la même chose qu'Exit (« Retour »), sinon sur la première. Un second
//   Exit quitte l'écran ;
// - MagnaSave (F6 au clavier) bascule d'une zone à l'autre, sans étape de plus ; on retrouve dans
//   la liste l'élément qu'on y avait quitté ;
// - un appui de flipper suit l'ordre d'affichage de l'écran (visualOrder), de haut en bas, et passe
//   d'une zone à l'autre à leur bord ; il ne fait le tour qu'aux deux bouts de l'écran. Novembre
//   2026 : l'import du Juke-box au bureau (morceaux à gauche, choix à droite, « Importer » dessous)
//   suivait le rang des actions : du dernier morceau, on remontait aux choix du haut, puis on passait
//   à « Importer » par-dessus les morceaux ; un flipper tenu reste dans sa zone et s'arrête à son bout (il ne fait plus le tour),
//   puis accélère : par lettre sur une liste triée par nom (section par section), de trois en trois
//   sinon.
// Le rendu (app/renderer/library.js) montre la liste dans un cadre, avec son repère : « Exit ·
// sortir de la liste » tant qu'on y est, « MagnaSave · revenir à la liste » sinon.

export type ZoneName = 'list' | 'actions';

/** Ce qu'il faut d'un écran décrit (library.ts, Built) pour reconnaître sa liste de contenu. */
export interface ZoneSource {
  sections: readonly { options?: boolean; title?: string; side?: boolean; rows: readonly { action?: number; pick?: boolean }[] }[];
  media?: { cards: readonly { action?: number }[] };
  health?: { groups: readonly { lines: readonly { action?: number }[] }[] };
  /** Tableau des scores (son rendu à part) : portées, puis onglets, au-dessus des actions. */
  scoreboard?: { scopes?: readonly { action?: number }[]; tabs?: readonly { action?: number }[] };
}

/**
 * Actions montrées dans la liste de contenu, en ordre croissant : cartes des médias, lignes à
 * choisir (hors listes d'options), lignes de la Santé. Ce sont celles que le rendu ne répète
 * pas dans la liste des actions.
 */
export function listActions(source: ZoneSource, count: number): number[] {
  return [...listGroups(source, count).keys()].sort((a, b) => a - b);
}

/** Actions de la liste de contenu, chacune avec son groupe : sa section, les cartes, son domaine de la Santé. */
function listGroups(source: ZoneSource, count: number): Map<number, number> {
  const found = new Map<number, number>();
  let group = 0;
  const add = (a: number | undefined) => a !== undefined && Number.isInteger(a) && a >= 0 && a < count && !found.has(a) && found.set(a, group);
  for (const s of source.sections) {
    if (!s.options) for (const r of s.rows) if (r.pick) add(r.action);
    group++;
  }
  for (const c of source.media?.cards ?? []) add(c.action);
  group++;
  for (const g of source.health?.groups ?? []) {
    for (const l of g.lines) add(l.action);
    group++;
  }
  return found;
}

/**
 * Ordre d'affichage des actions d'un écran, de haut en bas, tel que le rendu les place
 * (app/renderer/library.js), celui des flippers :
 * - en borne (portrait), le contenu est au-dessus des actions de l'écran : les lignes à choisir et les
 *   cartes dans l'ordre des sections (la colonne latérale, Section.side, sous le reste ; les médias :
 *   sections sans titre, cartes, sections titrées ; la Santé : ses domaines), puis les actions que le
 *   contenu ne montre pas, dans leur ordre ;
 * - au bureau (`landscape`), le contenu est à gauche des actions : de même, le contenu d'abord ; avec
 *   une colonne latérale (les choix d'un import, en haut à droite, la liste à gauche, « Importer »
 *   dessous), la colonne, puis la liste, puis les actions.
 */
export function visualOrder(source: ZoneSource, count: number, landscape = false): number[] {
  const side = source.sections.filter((s) => s.side);
  const out: number[] = [];
  const seen = new Set<number>();
  const add = (a: number | undefined) => {
    if (a === undefined || !Number.isInteger(a) || a < 0 || a >= count || seen.has(a)) return;
    seen.add(a);
    out.push(a);
  };
  const rows = (list: ZoneSource['sections']) => {
    for (const s of list) for (const r of s.rows) if (r.pick) add(r.action);
  };
  if (source.health) for (const g of source.health.groups) for (const l of g.lines) add(l.action);
  else if (source.scoreboard) for (const c of [...(source.scoreboard.scopes ?? []), ...(source.scoreboard.tabs ?? [])]) add(c.action);
  else {
    const main = source.sections.filter((s) => !s.side);
    const sections = landscape ? [...side, ...main] : [...main, ...side];
    if (source.media) {
      rows(sections.filter((s) => !s.title));
      for (const c of source.media.cards) add(c.action);
      rows(sections.filter((s) => s.title));
    } else rows(sections);
  }
  for (let i = 0; i < count; i++) add(i);
  return out;
}

/** Les deux zones d'un écran : rangs des actions de la liste, rangs des autres. */
export interface Zones {
  list: number[];
  actions: number[];
  /** Groupe de chaque élément de la liste (même rang que `list`) : sa section, pour le saut par lettre. */
  groups: number[];
}

/** Zones de l'écran ; undefined quand il n'a pas de liste de contenu, ou rien d'autre qu'elle. */
export function screenZones(source: ZoneSource, count: number): Zones | undefined {
  const found = listGroups(source, count);
  const list = [...found.keys()].sort((a, b) => a - b);
  if (!list.length || list.length === count) return undefined;
  return { list, actions: Array.from({ length: count }, (_, i) => i).filter((i) => !found.has(i)), groups: list.map((i) => found.get(i)!) };
}

export function zoneOf(z: Zones, index: number): ZoneName {
  return z.list.includes(index) ? 'list' : 'actions';
}

/** Ce qu'un écran retient de ses zones (par identité d'action, focus.ts) : d'où l'on est entré dans la liste, où on l'a quittée. */
export interface ZoneMemory {
  /** Action de l'écran choisie juste avant d'entrer dans la liste. */
  entry?: string;
  /** Élément de la liste choisi juste avant d'en sortir. */
  inList?: string;
}

/**
 * Mémoire après un changement de choix : passé des actions à la liste, l'action quittée est
 * l'entrée ; passé de la liste aux actions, l'élément quitté est la position à retrouver.
 */
export function rememberZones(z: Zones, memory: ZoneMemory, before: { index: number; id: string | undefined }, after: number): ZoneMemory {
  const from = zoneOf(z, before.index);
  if (from === zoneOf(z, after)) return memory;
  return from === 'actions' ? { ...memory, entry: before.id } : { ...memory, inList: before.id };
}

/**
 * Appui d'un flipper (ou Tab) : l'élément suivant ou précédent dans l'ordre d'affichage (`order`,
 * visualOrder), d'une zone à l'autre à leur bord ; le tour ne se fait qu'aux deux bouts de l'écran.
 * Sans ordre donné : le rang voisin.
 */
export function zoneStep(_z: Zones | undefined, count: number, cursor: number, dir: -1 | 1, order?: readonly number[]): number {
  if (count <= 0) return 0;
  if (!order || order.length !== count) return (cursor + dir + count) % count;
  const at = order.indexOf(cursor);
  if (at < 0) return order[0]!;
  return order[(at + dir + order.length) % order.length]!;
}

/** Flipper tenu : `stride` éléments plus loin dans la zone du choix, arrêté à son bout. */
export function zoneHold(z: Zones, cursor: number, dir: -1 | 1, stride = 1): number {
  const zone = z[zoneOf(z, cursor)];
  const at = zone.indexOf(cursor);
  return zone[Math.min(zone.length - 1, Math.max(0, at + dir * stride))]!;
}

/** Rang d'une action d'identité `id` dans une zone ; -1 si elle n'y est plus. */
function inZone(zone: readonly number[], ids: readonly (string | undefined)[], id: string | undefined): number {
  if (id === undefined) return -1;
  return zone.find((i) => ids[i] === id) ?? -1;
}

/**
 * Exit dans la liste : l'action par laquelle on y était entré, sinon celle qui fait la même chose
 * qu'Exit (`back`, « Retour »), sinon la première de l'écran. Jamais hors de l'écran.
 */
export function leaveList(z: Zones, ids: readonly (string | undefined)[], memory: ZoneMemory, back: number | undefined): number {
  const entry = inZone(z.actions, ids, memory.entry);
  if (entry >= 0) return entry;
  if (back !== undefined && z.actions.includes(back)) return back;
  return z.actions[0]!;
}

/** Retour dans la liste : l'élément qu'on y avait quitté, sinon son premier. */
export function enterList(z: Zones, ids: readonly (string | undefined)[], memory: ZoneMemory): number {
  const back = inZone(z.list, ids, memory.inList);
  return back >= 0 ? back : z.list[0]!;
}

/** MagnaSave (F6) : l'autre zone, à l'endroit qu'elle retient. */
export function switchZone(z: Zones, ids: readonly (string | undefined)[], cursor: number, memory: ZoneMemory, back: number | undefined): number {
  return zoneOf(z, cursor) === 'list' ? leaveList(z, ids, memory, back) : enterList(z, ids, memory);
}

// ---------- Flipper tenu : accélération et lettres ----------

/** Tenu au-delà, le défilement accélère. */
export const HOLD_FAST_MS = 1000;
/** Liste triée par nom, flipper tenu : une lettre au plus dans ce délai, le temps de la lire. */
export const LETTER_EVERY_MS = 250;
/** Liste qui n'est pas triée par nom, flipper tenu : de tant en tant. */
export const HOLD_FAST_STRIDE = 3;

/** Initiale d'un nom pour le saut par lettre : la lettre sans accent, « # » pour un chiffre ou un signe. */
export function initialOf(label: string): string {
  const first = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .charAt(0)
    .toUpperCase();
  return /^\p{L}$/u.test(first) ? first : '#';
}

/**
 * Initiales des noms dans l'ordre alphabétique (« # » d'abord) : la liste est triée par nom. Un
 * élément mis en tête (la table « probable » d'« Ajouter à un jeu ») n'y change rien.
 */
export function sortedByName(labels: readonly string[]): boolean {
  const rank = (s: string) => (initialOf(s) === '#' ? '' : initialOf(s));
  const sorted = (list: readonly string[]) => list.length >= 2 && list.every((l, i) => i === 0 || rank(l).localeCompare(rank(list[i - 1]!), 'fr') >= 0);
  return sorted(labels) || sorted(labels.slice(1));
}

/**
 * La liste se parcourt par lettre : chacun de ses groupes (sections : « Sur votre borne »,
 * « Absentes de votre borne »…) est trié par nom, ou n'a qu'un élément.
 */
export function zoneByName(z: Zones, labels: readonly string[]): boolean {
  if (z.list.length < 2) return false;
  const runs = new Map<number, string[]>();
  z.list.forEach((i, k) => runs.set(z.groups[k]!, [...(runs.get(z.groups[k]!) ?? []), labels[i] ?? '']));
  return [...runs.values()].every((run) => run.length < 2 || sortedByName(run));
}

/**
 * Saut par lettre dans la liste (triée par nom, groupe par groupe) : vers l'avant, le premier
 * élément de la lettre suivante ou du groupe suivant (le dernier de la liste s'il n'y en a plus) ;
 * vers l'arrière, le premier de sa lettre, ou de la lettre d'avant s'il y est déjà.
 */
export function letterJump(z: Zones, labels: readonly string[], cursor: number, dir: -1 | 1): number {
  const list = z.list;
  const at = Math.max(0, list.indexOf(cursor));
  const letter = (k: number) => `${z.groups[k]} ${initialOf(labels[list[k]!] ?? '')}`;
  if (dir === 1) {
    for (let k = at + 1; k < list.length; k++) if (letter(k) !== letter(at)) return list[k]!;
    return list[list.length - 1]!;
  }
  let start = at;
  while (start > 0 && letter(start - 1) === letter(at)) start--;
  if (start < at) return list[start]!;
  if (start === 0) return list[0]!;
  let prev = start - 1;
  while (prev > 0 && letter(prev - 1) === letter(start - 1)) prev--;
  return list[prev]!;
}

/** Où mène un flipper tenu depuis `heldMs` (première répétition comprise). `lastJumpMs` : depuis le dernier saut de lettre. */
export function holdMove(
  z: Zones,
  labels: readonly string[],
  cursor: number,
  dir: -1 | 1,
  heldMs: number,
  lastJumpMs: number,
): { cursor: number; letter?: string } {
  if (heldMs < HOLD_FAST_MS) return { cursor: zoneHold(z, cursor, dir) };
  if (zoneOf(z, cursor) === 'list' && zoneByName(z, labels)) {
    if (lastJumpMs < LETTER_EVERY_MS) return { cursor, letter: initialOf(labels[cursor] ?? '') };
    const next = letterJump(z, labels, cursor, dir);
    return { cursor: next, letter: initialOf(labels[next] ?? '') };
  }
  return { cursor: zoneHold(z, cursor, dir, HOLD_FAST_STRIDE) };
}
