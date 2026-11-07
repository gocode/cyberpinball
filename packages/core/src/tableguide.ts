// Guide du jeu d'une table : quelques pages qui disent ce qu'il faut viser et comment, les coups
// numérotés à leur place sur le plateau vu de dessus. Rédigés par Claude d'après le script, la
// feuille de règles et la carte de chaque table, rangés dans guides/ et reconnus par
// le jeu VPS de la table. Les coups sont désignés par le nom de leur élément dans le .vpx : leurs
// positions viennent du .vpx du joueur (readVpxPlayfield), jamais d'une saisie à la main, sauf
// `at` quand aucun élément ne marque le coup. Une autre recréation du même jeu (d'autres noms
// d'éléments) n'a pas le guide : des pastilles mal placées seraient pires que pas de guide.

import { GUIDES } from './guides';
import type { VpxPlayfield } from './vpxinfo';

/** Un coup : son nom, et l'élément (ou les éléments) qui marque son entrée, sinon sa position. */
export interface GuideShot {
  name: string;
  el?: string | string[];
  at?: [number, number];
}

/** D'où part un tir : flipper gauche, flipper droit, lanceur. */
export type GuideFrom = 'l' | 'r' | 'plunger';

export interface GuidePage {
  title: string;
  /** Tous les coups allumés (page « Le but »). */
  all?: boolean;
  /** Coups allumés sur cette page, chacun avec sa précision. */
  shots?: Record<string, string>;
  /** Tirs : [d'où, coup, 2 pour le second temps]. */
  paths?: [GuideFrom, number, 2?][];
  /** Légende des deux temps. */
  phases?: string[];
  intro?: string;
  steps?: string[];
  final?: string;
  tips?: [string, string][];
  warn?: string;
  note?: string | string[];
}

export interface TableGuide {
  /** Identifiant du guide (nom de son fichier). */
  id: string;
  /** Jeux VPS auxquels il s'applique. */
  vps: string[];
  title: string;
  /** « Fabricant · année ». */
  sub: string;
  /** Ligne de source, en bas de chaque page. */
  source: string;
  shots: Record<string, GuideShot>;
  pages: GuidePage[];
  /** Pour la relecture seulement : d'où vient chaque affirmation, ce qui reste à vérifier. */
  sources?: string[];
  doutes?: string[];
}

/** Guide d'un jeu VPS, s'il y en a un. */
export function guideFor(vpsId: string | undefined, guides: readonly TableGuide[] = GUIDES): TableGuide | undefined {
  return vpsId ? guides.find((g) => g.vps.includes(vpsId)) : undefined;
}

/** Plateau du guide, en unités du plateau (origine en haut à gauche, y vers les flippers). */
export interface PlacedGuide {
  guide: TableGuide;
  width: number;
  height: number;
  /** Coups placés (ceux dont l'élément manque n'y sont pas). */
  shots: Record<string, { name: string; x: number; y: number }>;
  /** Flippers dessinés : [départ, bout]. */
  bats: [[number, number], [number, number]][];
  /** Bout de chaque flipper, d'où partent les tirs, et le lanceur. */
  from: Record<GuideFrom, [number, number]>;
  /** Plateau dessiné d'après les éléments, quand la table n'a pas d'image à plat. */
  schema: { type: 'wall' | 'ramp' | 'bumper' | 'target' | 'kicker'; pts: [number, number][] }[];
  /** Coups désignés par un élément, et ceux trouvés dans la table. */
  named: number;
  found: number;
}

const mean = (pts: [number, number][]): [number, number] => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

/**
 * Place le guide sur le plateau de la table : chaque coup au centre de ses éléments, les flippers
 * principaux (les deux plus bas, de part et d'autre du milieu), le lanceur. Indéfini si moins des
 * trois quarts des coups désignés par un élément se trouvent dans la table : ce n'est pas la
 * recréation pour laquelle le guide a été écrit.
 */
export function placeGuide(guide: TableGuide, pf: VpxPlayfield): PlacedGuide | undefined {
  const width = pf.right - pf.left;
  const height = pf.bottom - pf.top;
  const local = (p: [number, number]): [number, number] => [p[0] - pf.left, p[1] - pf.top];
  const byName = new Map<string, VpxPlayfield['items']>();
  for (const item of pf.items) {
    const key = item.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }
  const shots: PlacedGuide['shots'] = {};
  let named = 0;
  let found = 0;
  for (const [n, s] of Object.entries(guide.shots)) {
    if (s.at) {
      shots[n] = { name: s.name, x: s.at[0] - pf.left, y: s.at[1] - pf.top };
      continue;
    }
    named++;
    const pts = [s.el ?? []].flat().flatMap((name) => (byName.get(name.toLowerCase()) ?? []).map((i) => mean(i.pts)));
    if (!pts.length) continue;
    found++;
    const [x, y] = local(mean(pts));
    shots[n] = { name: s.name, x, y };
  }
  if (named && found < named * 0.75) return undefined;
  const flips = pf.items.filter((i) => i.type === 'flipper').map((i) => local(i.pts[0]!)).sort((a, b) => b[1] - a[1]);
  const lp = flips.find((p) => p[0] < width / 2) ?? [width * 0.3, height * 0.85];
  const rp = flips.find((p) => p[0] >= width / 2) ?? [width * 0.62, height * 0.85];
  const len = width * 0.11;
  const plunger = pf.items.find((i) => i.type === 'plunger');
  const schema: PlacedGuide['schema'] = [];
  for (const i of pf.items) {
    if (i.type === 'wall' || i.type === 'ramp' || i.type === 'bumper' || i.type === 'target' || i.type === 'kicker') schema.push({ type: i.type, pts: i.pts.map(local) });
  }
  return {
    guide,
    width,
    height,
    shots,
    bats: [
      [lp, [lp[0] + len, lp[1] + len * 0.5]],
      [rp, [rp[0] - len, rp[1] + len * 0.5]],
    ],
    from: { l: [lp[0] + len * 0.95, lp[1] + len * 0.3], r: [rp[0] - len * 0.95, rp[1] + len * 0.3], plunger: plunger ? local(plunger.pts[0]!) : [width * 0.94, height * 0.95] },
    schema,
    named,
    found,
  };
}

/** Tracé d'un tir, en unités du plateau : une courbe du flipper (ou du lanceur) au coup, et l'angle de la flèche. */
export function guidePath(placed: PlacedGuide, from: GuideFrom, to: number): { d: string; end: [number, number]; angle: number } | undefined {
  const shot = placed.shots[String(to)];
  if (!shot) return undefined;
  const { width: w, height: h } = placed;
  const end: [number, number] = [shot.x, shot.y + h * 0.04];
  let d: string;
  let control: [number, number];
  if (from === 'plunger') {
    const [px, py] = placed.from.plunger;
    const turn = Math.min(py - h * 0.1, shot.y + h * 0.12);
    control = [px, end[1]];
    d = `M${px} ${py} L${px} ${turn} Q${px} ${end[1]} ${end[0]} ${end[1]}`;
  } else {
    const [x0, y0] = placed.from[from];
    control = [(x0 + shot.x) / 2 + (from === 'l' ? 0.095 : -0.095) * w, (y0 + shot.y) / 2 + 0.06 * h];
    d = `M${x0} ${y0} Q${control[0]} ${control[1]} ${end[0]} ${end[1]}`;
  }
  return { d, end, angle: (Math.atan2(end[1] - control[1], end[0] - control[0]) * 180) / Math.PI };
}

/** Une page du guide, telle que la dessine le rendu (app/renderer/guide.js), en unités du plateau. */
export interface GuideView {
  kind: 'guide';
  source: string;
  /** Guide en français montré dans une autre langue. */
  french: boolean;
  title: string;
  sub: string;
  index: number;
  count: number;
  page: GuidePage;
  width: number;
  height: number;
  aspect: number;
  /** Adresse de l'image du plateau à plat ; sans elle, le plateau est dessiné (schema). */
  image?: string;
  schema?: PlacedGuide['schema'];
  shots: { n: string; name: string; x: number; y: number; lit: boolean; detail?: string }[];
  bats: PlacedGuide['bats'];
  paths: { d: string; end: [number, number]; angle: number; second: boolean }[];
}

/** Pages du guide placé : le plateau, tous ses coups (allumés ceux de la page, avec leur précision), les tirs de la page. */
export function guideViews(placed: PlacedGuide, opts: { image?: string; french: boolean }): GuideView[] {
  const g = placed.guide;
  return g.pages.map((page, index) => ({
    kind: 'guide' as const,
    source: g.source,
    french: opts.french,
    title: g.title,
    sub: g.sub,
    index,
    count: g.pages.length,
    page,
    width: placed.width,
    height: placed.height,
    aspect: placed.width / placed.height,
    image: opts.image,
    schema: opts.image ? undefined : placed.schema,
    shots: Object.entries(placed.shots).map(([n, s]) => ({ n, name: s.name, x: s.x, y: s.y, lit: page.shots?.[n] !== undefined, detail: page.shots?.[n] })),
    bats: placed.bats,
    paths: (page.paths ?? []).flatMap(([from, to, second]) => {
      const path = guidePath(placed, from, to);
      return path ? [{ ...path, second: second === 2 }] : [];
    }),
  }));
}
