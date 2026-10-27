// Santé de la borne (Menu système > Borne) : un bilan qui réunit ce que d'autres écrans
// savent déjà, sans le recalculer autrement. L'espace disque des lecteurs qui comptent
// (tables, téléchargements, données) ; les tables qui ne démarrent pas, d'après le médecin
// (doctor.ts, playable.ts) ; les PuP-Packs que le médecin voit éteints en partie (cause et
// réparation) ; les médias que VPinMediaDB peut fournir, d'après l'index déjà
// téléchargé (mediadb.ts, aucun réseau) ; la configuration de la borne retenue contre les
// écrans branchés (configurations.ts), et le sens des tables en partie (gameorientation.ts) ; la version de VPX installée contre celle que Cyber
// Pinball connaît (manifeste de l'installeur, aucun réseau).
//
// L'application relève les faits en tâche de fond et les garde (app/src/health.ts) ; ce
// module en tire les lignes, chacune avec son état (OK, À vérifier, Bloquant) et ce qu'elle
// ouvre pour réparer : une entrée du menu système, le médecin d'une table, l'installation
// de VPX. health.test.ts vérifie chaque état et que chaque ligne mène à un écran réel.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareVersions } from './acquisition';
import { activeConfiguration, chooseConfiguration, chosenId, scoreConfiguration, type CabinetSet } from './configurations';
import type { Finding } from './doctor';
import { formatSize } from './fileops';
import { orientationFacts, orientationVerdict, type OrientationFacts } from './gameorientation';
import { formatDate, formatList, t, tn } from './i18n';
import type { IconName } from './icons';
import { matchScreens } from './match';
import { ROLES, type ObservedDisplay, type RoleId } from './model';
import { playBlockers } from './playable';
import { systemPathOf, type SystemItemId } from './systemmenu';
import { vpxDisplayName, type VpxDisplayIdFormat } from './vpx';

export type HealthState = 'ok' | 'check' | 'blocking';

/** Les contrôles, dans l'ordre de la page. */
export const HEALTH_CHECKS = ['disk', 'tables', 'pup', 'media', 'screens', 'vpx'] as const;
export type HealthCheckId = (typeof HEALTH_CHECKS)[number];

/** Où mène une ligne. */
export type HealthTarget =
  /** Une entrée du menu système (Téléchargements, Médias manquants, Configuration de la borne…). */
  | { kind: 'system'; item: SystemItemId }
  /** Le médecin de cette table. */
  | { kind: 'doctor'; file: string }
  /** Les tables à revoir au-delà de celles que la page montre, chacune vers son médecin. */
  | { kind: 'tables' }
  /** Télécharger et installer la version de VPX que Cyber Pinball connaît. */
  | { kind: 'install-vpx' };

/** Chaque sorte de cible : l'application en ouvre une pour chacune (app/src/health.ts). */
export const HEALTH_TARGET_KINDS = ['system', 'doctor', 'tables', 'install-vpx'] as const satisfies readonly HealthTarget['kind'][];

export interface HealthLine {
  check: HealthCheckId;
  state: HealthState;
  title: string;
  detail?: string;
  /** Ce que la ligne ouvre, écrit sous le détail (« Médecin de la table »). */
  go: string;
  target: HealthTarget;
}

// ---------- Faits relevés ----------

/** Ce qu'un lecteur porte de Cyber Pinball. */
export type DiskUse = 'tables' | 'downloads' | 'data';

export interface DiskFact {
  /** Racine du lecteur (« D:\ »). */
  root: string;
  uses: DiskUse[];
  /** Octets libres et capacité ; absents si le lecteur ne répond pas (débranché). */
  free?: number;
  total?: number;
}

/** Une table à revoir : ce qui l'empêche de démarrer, ou ce qui mérite un coup d'œil. */
export interface TableHealth {
  file: string;
  title: string;
  /** Le premier constat qui compte, tel que le médecin le dit. */
  reason: string;
  /** Constats du médecin qui empêchent de jouer (playBlockers) ; sinon à vérifier. */
  blocking: boolean;
}

export interface TablesFacts {
  count: number;
  /** Les tables bloquées d'abord. */
  flagged: TableHealth[];
  /** Tables dont le script n'a jamais été lu : la ROM qu'elles demandent n'est pas connue. */
  unanalysed: number;
}

export interface MediaFacts {
  /** Date de l'index de VPinMediaDB gardé ; absente : jamais téléchargé. */
  index?: string;
  /** Tables à qui VPinMediaDB peut ajouter au moins un média, et combien de médias en tout. */
  tables: number;
  medias: number;
}

export interface ScreensFacts {
  /** Configurations enregistrées. */
  configurations: number;
  /** Configuration retenue (active) ; absente : aucune configuration enregistrée. */
  active?: { name: string; total: number; found: number; missing: string[]; extra: number; playfieldFound: boolean };
  /** Une autre configuration correspondrait mieux aux écrans branchés. */
  better?: string;
  /** Écrans branchés. */
  plugged: number;
  /** Sens des tables en partie sur le playfield branché ; absent sans playfield reconnu ni bord du joueur. */
  orientation?: OrientationFacts;
  /**
   * Rôles dont les écrans portent le même nom pour une version de VPX qui ne repère les écrans
   * que par leur nom (10.8.1) : elle ouvre leurs fenêtres sur le premier de ces écrans.
   */
  homonyms?: { name: string; roles: RoleId[] }[];
}

/** Une table dont le PuP-Pack ne se verra pas en partie, d'après son médecin. */
export interface PupHealth {
  file: string;
  title: string;
  /** Le constat, tel que le médecin le dit (« PuP-Pack coupé par le script de la table »). */
  reason: string;
  /** Réparé de lui-même avant la prochaine partie (PUP_PLAY_REPAIRS), sinon à faire dans le médecin. */
  auto: boolean;
}

export interface PupFacts {
  /** Tables qui ont un dossier pupvideos. */
  packs: number;
  flagged: PupHealth[];
}

export interface VpxFacts {
  /** Version installée et active ; absente : VPX n'est pas installé. */
  installed?: string;
  /** Version que Cyber Pinball installe (manifeste), sans réseau. */
  known?: string;
}

export interface HealthFacts {
  /** Fin du relevé (ISO). */
  at: string;
  disks: DiskFact[];
  tables?: TablesFacts;
  /** PuP-Packs des tables ; absent d'un relevé plus ancien. */
  pup?: PupFacts;
  media?: MediaFacts;
  screens?: ScreensFacts;
  vpx: VpxFacts;
}

// ---------- Seuils ----------

/** Sous 2 Go libres, un téléchargement de table avec son PuP-Pack ne passe plus : bloquant. */
export const DISK_BLOCKING_BYTES = 2 * 1024 ** 3;
/** Sous 10 Go, à vérifier avant la prochaine table. */
export const DISK_CHECK_BYTES = 10 * 1024 ** 3;
/** Tables montrées une par une ; au-delà, une ligne mène à la liste complète. */
export const HEALTH_TABLE_LINES = 5;

// ---------- Relevé de l'espace disque ----------

/** Lecteurs des dossiers qui comptent, un par racine, avec ce qu'ils portent. */
export function diskFacts(dirs: Partial<Record<DiskUse, string>>, measure: (dir: string) => { free: number; total: number } | undefined = diskSpace): DiskFact[] {
  const disks: DiskFact[] = [];
  for (const use of ['tables', 'downloads', 'data'] as const) {
    const dir = dirs[use];
    if (!dir) continue;
    const root = path.parse(path.resolve(dir)).root.toUpperCase();
    const known = disks.find((d) => d.root === root);
    if (known) {
      known.uses.push(use);
      continue;
    }
    disks.push({ root, uses: [use], ...measure(dir) });
  }
  return disks;
}

/** Octets libres et capacité du lecteur d'un dossier (le premier parent qui existe) ; undefined s'il ne répond pas. */
export function diskSpace(dir: string): { free: number; total: number } | undefined {
  let at = path.resolve(dir);
  while (!fs.existsSync(at)) {
    const up = path.dirname(at);
    if (up === at) return undefined;
    at = up;
  }
  try {
    const s = fs.statfsSync(at);
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return undefined;
  }
}

// ---------- Relevé des tables et des écrans ----------

/** Constats du médecin qui, sans empêcher de jouer, demandent un coup d'œil : la table a planté, son script est illisible. */
export const HEALTH_CHECK_FINDINGS = ['crashReport', 'scriptUnreadable'] as const satisfies readonly Finding['code'][];

/**
 * Tables à revoir d'après les constats du médecin (`findings` undefined : script jamais lu).
 * Bloquée : un constat qui empêche de jouer (playBlockers) ; à vérifier : HEALTH_CHECK_FINDINGS.
 */
export function tablesFacts(tables: { file: string; title: string; findings?: readonly Pick<Finding, 'code' | 'severity' | 'title'>[] }[]): TablesFacts {
  const flagged: TableHealth[] = [];
  let unanalysed = 0;
  for (const table of tables) {
    if (!table.findings) {
      unanalysed++;
      continue;
    }
    const blocker = playBlockers(table.findings)[0];
    const check = table.findings.find((f) => (HEALTH_CHECK_FINDINGS as readonly string[]).includes(f.code));
    const reason = blocker ?? check;
    if (reason) flagged.push({ file: table.file, title: table.title, reason: reason.title, blocking: Boolean(blocker) });
  }
  flagged.sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.title.localeCompare(b.title));
  return { count: tables.length, flagged, unanalysed };
}

/**
 * Constats du médecin qui empêchent un PuP-Pack de se voir en partie : pack introuvable ou mal
 * rangé, script qui le coupe, option absente ou faite pour une autre borne, pack qui cache le DMD,
 * journal de VPX qui ne l'a pas vu chargé. Ceux de simple information ne comptent pas.
 */
export const PUP_HEALTH_FINDINGS = [
  'pupMissing',
  'pupNested',
  'pupDisabledByScript',
  'scriptPatchStale',
  'pupOptionNotApplied',
  'pupOptionMismatch',
  'pupOptionUnsuited',
  'pupHidesDmd',
  'pupLog',
] as const satisfies readonly Finding['code'][];

/**
 * PuP-Packs à revoir : pour chaque table qui en a un (`hasPack`), le premier constat de
 * PUP_HEALTH_FINDINGS ; `autoRepairs` : ceux que le menu répare seul avant chaque partie.
 */
export function pupFacts(
  tables: { file: string; title: string; hasPack: boolean; findings?: readonly Pick<Finding, 'code' | 'severity' | 'title'>[] }[],
  autoRepairs: readonly string[] = [],
): PupFacts {
  const flagged: PupHealth[] = [];
  let packs = 0;
  for (const table of tables) {
    if (!table.hasPack) continue;
    packs++;
    const found = table.findings?.find((f) => f.severity !== 'info' && (PUP_HEALTH_FINDINGS as readonly string[]).includes(f.code));
    if (found) flagged.push({ file: table.file, title: table.title, reason: found.title, auto: autoRepairs.includes(found.code) });
  }
  flagged.sort((a, b) => a.title.localeCompare(b.title));
  return { packs, flagged };
}

/**
 * Écrans affectés à des rôles différents qui portent le même nom pour VPX (vpxDisplayName) :
 * une version qui ne les repère que par leur nom (`format` « name », VPX 10.8.1,
 * Window::GetDisplayConfig) prend le premier, et y ouvre les fenêtres des deux rôles. Le fronton
 * et le DMD se superposent alors sur un écran, l'autre reste au menu : les vidéos d'un PuP-Pack
 * faites pour le DMD se perdent derrière le fronton (poste à deux PL2294H, 27 octobre 2026).
 */
export function homonymousRoles(
  roles: Partial<Record<RoleId, string>>,
  saved: Parameters<typeof matchScreens>[0],
  observed: ObservedDisplay[],
  format: VpxDisplayIdFormat | undefined,
): { name: string; roles: RoleId[] }[] {
  if (format !== 'name') return [];
  const match = matchScreens(saved, observed);
  const byName = new Map<string, { displays: ObservedDisplay[]; roles: RoleId[] }>();
  for (const role of ROLES) {
    const fp = roles[role.id];
    const display = fp ? match.matched.get(fp) : undefined;
    if (!display) continue;
    const name = vpxDisplayName(display);
    const entry = byName.get(name) ?? { displays: [], roles: [] };
    if (!entry.displays.includes(display)) entry.displays.push(display);
    entry.roles.push(role.id);
    byName.set(name, entry);
  }
  // Deux rôles sur un même écran (zones) sont voulus : seuls comptent des écrans distincts.
  return [...byName].filter(([, e]) => e.displays.length > 1).map(([name, e]) => ({ name, roles: e.roles }));
}

/** Configuration retenue (active) contre les écrans branchés, et celle que la reconnaissance choisirait aujourd'hui. */
export function screensFacts(set: CabinetSet | undefined, observed: ObservedDisplay[], format?: VpxDisplayIdFormat): ScreensFacts {
  const configurations = set?.configurations.length ?? 0;
  const active = set && activeConfiguration(set);
  if (!set || !active) return { configurations, plugged: observed.length };
  const score = scoreConfiguration(active, observed);
  const chosen = chosenId(chooseConfiguration(set, observed));
  const orientation = orientationFacts(active, observed);
  const homonyms = homonymousRoles(active.roles, active.screens, observed, format);
  return {
    configurations,
    plugged: observed.length,
    active: {
      name: active.name,
      total: score.total,
      found: score.serial + score.port + score.model,
      missing: score.missing.map((s) => s.label),
      extra: score.extra.length,
      playfieldFound: score.playfieldFound,
    },
    better: chosen && chosen !== active.id ? set.configurations.find((c) => c.id === chosen)?.name : undefined,
    ...(orientation && { orientation }),
    ...(homonyms.length && { homonyms }),
  };
}

// ---------- Lignes ----------

const SYSTEM = (item: SystemItemId): HealthTarget => ({ kind: 'system', item });

function useLabel(use: DiskUse): string {
  switch (use) {
    case 'tables':
      return t('tables');
    case 'downloads':
      return t('téléchargements');
    case 'data':
      return t('données de Cyber Pinball');
  }
}

/** Lettre du lecteur (« D: »), ou sa racine telle quelle (partage réseau). */
function driveName(root: string): string {
  return /^[A-Z]:\\$/.test(root) ? root.slice(0, 2) : root;
}

export function diskLines(disks: DiskFact[]): HealthLine[] {
  return disks.map((d) => {
    const title = t('{drive} — {uses}', { drive: driveName(d.root), uses: d.uses.map(useLabel).join(t(', ')) });
    if (d.free === undefined) {
      // Le lecteur des tables ne répond plus (disque externe débranché) : rien ne démarre.
      const blocking = d.uses.includes('tables');
      return {
        check: 'disk',
        state: blocking ? 'blocking' : 'check',
        title,
        detail: t('Le lecteur ne répond pas : débranché, ou plus accessible'),
        go: t('Faire de la place — Téléchargements'),
        target: SYSTEM('downloads'),
      };
    }
    const space = d.total ? t('{free} libres sur {total}', { free: formatSize(d.free), total: formatSize(d.total) }) : t('{free} libres', { free: formatSize(d.free) });
    const state: HealthState = d.free < DISK_BLOCKING_BYTES ? 'blocking' : d.free < DISK_CHECK_BYTES ? 'check' : 'ok';
    return {
      check: 'disk',
      state,
      title,
      detail: state === 'ok' ? space : t('{space} : moins de {limit}', { space, limit: formatSize(state === 'blocking' ? DISK_BLOCKING_BYTES : DISK_CHECK_BYTES) }),
      go: state === 'ok' ? t('Téléchargements') : t('Faire de la place — Téléchargements'),
      target: SYSTEM('downloads'),
    };
  });
}

export function tableLines(facts: TablesFacts): HealthLine[] {
  if (!facts.count) return [{ check: 'tables', state: 'check', title: t('Aucune table'), detail: t('Rien à jouer pour l’instant'), go: t('Ajouter une table'), target: SYSTEM('add-table') }];
  const lines: HealthLine[] = facts.flagged.slice(0, HEALTH_TABLE_LINES).map((f) => ({
    check: 'tables',
    state: f.blocking ? 'blocking' : 'check',
    title: f.title,
    detail: f.reason,
    go: t('Ouvrir le médecin de la table'),
    target: { kind: 'doctor', file: f.file },
  }));
  const more = facts.flagged.slice(HEALTH_TABLE_LINES);
  if (more.length) {
    lines.push({
      check: 'tables',
      state: more.some((f) => f.blocking) ? 'blocking' : 'check',
      title: tn(more.length, '… et {n} autre table', '… et {n} autres tables'),
      detail: more.slice(0, 3).map((f) => f.title).join(t(', ')) + (more.length > 3 ? '…' : ''),
      go: t('Voir toutes les tables à revoir'),
      target: { kind: 'tables' },
    });
  }
  if (facts.unanalysed) {
    lines.push({
      check: 'tables',
      state: 'check',
      title: tn(facts.unanalysed, '{n} table jamais analysée', '{n} tables jamais analysées'),
      detail: t('Leur script n’a pas encore été lu : la ROM qu’elles demandent n’est pas connue'),
      go: t('Lire les scripts — Bibliothèque de ROM'),
      target: SYSTEM('roms'),
    });
  }
  if (!lines.length) {
    lines.push({
      check: 'tables',
      state: 'ok',
      title: t('Aucune ROM demandée ne manque'),
      detail: tn(facts.count, '{n} table, selon les scripts analysés', '{n} tables, selon les scripts analysés'),
      go: t('Bibliothèque de ROM'),
      target: SYSTEM('roms'),
    });
  }
  return lines;
}

/**
 * PuP-Packs : une ligne par table dont le pack ne se verra pas, vers son médecin (la cause et la
 * réparation en un geste) ; une ligne OK quand tous sont prêts ; rien sans aucun pack.
 */
export function pupLines(facts: PupFacts): HealthLine[] {
  if (!facts.packs) return [];
  const go = t('Ouvrir le médecin de la table');
  const lines: HealthLine[] = facts.flagged.map((f) => ({
    check: 'pup',
    state: 'check',
    title: f.title,
    detail: f.auto ? t('{reason} — réparé de lui-même avant la prochaine partie', { reason: f.reason }) : f.reason,
    go,
    target: { kind: 'doctor', file: f.file },
  }));
  if (!lines.length) {
    lines.push({
      check: 'pup',
      state: 'ok',
      title: tn(facts.packs, '{n} PuP-Pack prêt', '{n} PuP-Packs prêts'),
      detail: t('Rangés sous le nom que cherche la table, option faite pour la borne, allumés par le script'),
      go: t('Ajouter une table'),
      target: SYSTEM('add-table'),
    });
  }
  return lines;
}

export function mediaLines(facts: MediaFacts): HealthLine[] {
  const go = t('Voir les médias manquants');
  const target = SYSTEM('missing-media');
  if (!facts.index) {
    return [{ check: 'media', state: 'check', title: t('Jamais cherché sur VPinMediaDB'), detail: t('« Trouver les médias manquants » télécharge son index (environ 2 Mo) et propose ce qui manque à chaque table'), go, target }];
  }
  const day = formatDate(facts.index);
  if (!facts.tables) return [{ check: 'media', state: 'ok', title: t('Rien à compléter depuis VPinMediaDB'), detail: t('Selon l’index gardé, du {day}', { day }), go, target }];
  return [
    {
      check: 'media',
      state: 'check',
      title: tn(facts.tables, 'VPinMediaDB a des médias pour {n} table', 'VPinMediaDB a des médias pour {n} tables'),
      detail: tn(facts.medias, '{n} média qui leur manque (index du {day})', '{n} médias qui leur manquent (index du {day})', { day }),
      go,
      target,
    },
  ];
}

export function screensLines(facts: ScreensFacts): HealthLine[] {
  const go = t('Ouvrir la configuration de la borne');
  const target = SYSTEM('cabinet');
  const line = (state: HealthState, title: string, detail: string): HealthLine[] => [{ check: 'screens', state, title, detail, go, target }];
  const plugged = tn(facts.plugged, '{n} écran branché', '{n} écrans branchés');
  const a = facts.active;
  if (!a) return line('blocking', t('Aucune configuration de la borne'), t('{plugged} ; l’assistant les décrit une fois pour toutes', { plugged }));
  const name = t('« {name} »', { name: a.name });
  const found = tn(a.found, '{n} écran sur {total} retrouvé', '{n} écrans sur {total} retrouvés', { total: a.total });
  const missing = a.missing.length ? tn(a.missing.length, 'introuvable : {names}', 'introuvables : {names}', { names: a.missing.map((m) => t('« {name} »', { name: m })).join(t(', ')) }) : '';
  const better = facts.better ? t('« {better} » correspondrait aux écrans branchés', { better: facts.better }) : '';
  const parts = [found, missing, a.extra ? tn(a.extra, '{n} écran branché en plus', '{n} écrans branchés en plus') : '', a.found ? '' : better].filter(Boolean).join(t(' ; '));
  if (!a.found) return line('blocking', t('{name} : aucun de ses écrans n’est branché', { name }), parts);
  if (!a.playfieldFound) return line('blocking', t('{name} : l’écran du playfield est introuvable', { name }), parts);
  const sense = [...(facts.orientation ? orientationLines(facts.orientation) : []), ...homonymLines(facts.homonyms ?? [])];
  if (facts.better) return [...line('check', t('{name} retenue, « {better} » correspondrait mieux', { name, better: facts.better }), parts), ...sense];
  if (a.missing.length) return [...line('check', t('{name} retrouvée en partie', { name }), parts), ...sense];
  return [...line('ok', t('{name} reconnue', { name }), parts), ...sense];
}

/**
 * Écrans que VPX confond (homonymousRoles) : ses fenêtres de ces rôles s'ouvrent toutes sur le
 * premier. Rien à régler dans Cyber Pinball : la cause et ce qu'elle cache sont dits.
 */
function homonymLines(homonyms: { name: string; roles: RoleId[] }[]): HealthLine[] {
  return homonyms.map((h) => {
    const roles = h.roles.map((id) => ROLES.find((r) => r.id === id)?.label ?? id);
    return {
      check: 'screens',
      state: 'check',
      title: t('VPX confond deux écrans « {name} »', { name: h.name }),
      detail: t('Il repère les écrans par leur seul nom et ouvre {roles} sur le premier : ils s’y superposent, et les vidéos d’un PuP-Pack faites pour l’un se cachent derrière l’autre', {
        roles: formatList(roles, 'and'),
      }),
      go: t('Ouvrir la configuration de la borne'),
      target: SYSTEM('cabinet'),
    };
  });
}

/** Sens des tables en partie : « Orientation et taille du playfield » le règle de nouveau. */
function orientationLines(facts: OrientationFacts): HealthLine[] {
  const verdict = orientationVerdict(facts);
  return [{ check: 'screens', state: verdict.state, title: verdict.title, detail: verdict.detail, go: t('Ouvrir la configuration de la borne'), target: SYSTEM('cabinet') }];
}

export function vpxLines(facts: VpxFacts): HealthLine[] {
  const install = (version: string | undefined) => (version ? t('Installer VPX {version}', { version }) : t('Installer VPX'));
  if (!facts.installed) {
    return [{ check: 'vpx', state: 'blocking', title: t('Visual Pinball X n’est pas installé'), detail: t('Aucune table ne peut démarrer'), go: install(facts.known), target: { kind: 'install-vpx' } }];
  }
  const title = t('VPX {version} installé', { version: facts.installed });
  if (facts.known && compareVersions(facts.installed, facts.known) < 0) {
    return [
      {
        check: 'vpx',
        state: 'check',
        title,
        detail: t('Cyber Pinball connaît {version} : l’installer garde l’ancienne version à côté', { version: facts.known }),
        go: install(facts.known),
        target: { kind: 'install-vpx' },
      },
    ];
  }
  return [{ check: 'vpx', state: 'ok', title, detail: t('La plus récente que Cyber Pinball connaisse, sans chercher en ligne'), go: t('Ouvrir les réglages de VPX'), target: SYSTEM('vpx-settings') }];
}

/** Toutes les lignes, contrôle par contrôle ; un contrôle sans fait relevé (pas de racine, pas de modèle de borne) est omis. */
export function healthLines(facts: HealthFacts): HealthLine[] {
  return [
    ...diskLines(facts.disks),
    ...(facts.tables ? tableLines(facts.tables) : []),
    ...(facts.pup ? pupLines(facts.pup) : []),
    ...(facts.media ? mediaLines(facts.media) : []),
    ...(facts.screens ? screensLines(facts.screens) : []),
    ...vpxLines(facts.vpx),
  ];
}

/** Un point bloquant : pastille rouge sur l'entrée, jusqu'à la roue dentée. */
export function healthAttention(facts: HealthFacts | undefined): boolean {
  return Boolean(facts && healthLines(facts).some((l) => l.state === 'blocking'));
}

/** Intertitre et icône de chaque contrôle. */
export function healthCheckInfo(check: HealthCheckId): { title: string; icon: IconName } {
  switch (check) {
    case 'disk':
      return { title: t('Espace disque'), icon: 'drive' };
    case 'tables':
      return { title: t('Tables'), icon: 'tables' };
    case 'pup':
      return { title: t('PuP-Packs'), icon: 'video' };
    case 'media':
      return { title: t('Médias'), icon: 'image' };
    case 'screens':
      return { title: t('Écrans'), icon: 'screens' };
    case 'vpx':
      return { title: 'Visual Pinball X', icon: 'play' }; // i18n-ignore : nom du logiciel
  }
}

/** Signe et mot d'un état, jamais la couleur seule. */
export function healthStateLabel(state: HealthState): { word: string; sign: string; tone: 'ok' | 'warning' | 'error' } {
  switch (state) {
    case 'ok':
      return { word: t('OK'), sign: '✓', tone: 'ok' };
    case 'check':
      return { word: t('À vérifier'), sign: '!', tone: 'warning' };
    case 'blocking':
      return { word: t('Bloquant'), sign: '✕', tone: 'error' };
  }
}

/** Une cible mène à un écran réel : une entrée du menu système doit être dans l'arbre des rubriques. */
export function targetReachable(target: HealthTarget): boolean {
  return target.kind !== 'system' || systemPathOf(target.item) !== undefined;
}

// ---------- Cache ----------

/** Dernier relevé, gardé d'un lancement à l'autre : la page et la pastille sont là dès le démarrage. */
export function healthCacheFile(dataDir: string): string {
  return path.join(dataDir, 'cache', 'sante.json');
}

export function loadHealthFacts(dataDir: string): HealthFacts | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(healthCacheFile(dataDir), 'utf8')) as Partial<HealthFacts>;
    return typeof raw.at === 'string' && Array.isArray(raw.disks) && raw.vpx && typeof raw.vpx === 'object' ? (raw as HealthFacts) : undefined;
  } catch {
    return undefined;
  }
}

export function saveHealthFacts(dataDir: string, facts: HealthFacts): void {
  const file = healthCacheFile(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(facts, null, 2));
}

/** « Vérifié il y a 3 min », « à l'instant », « il y a 2 h », sinon la date. */
export function healthAge(at: string, now = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return t('Vérifié à l’instant');
  if (minutes < 60) return t('Vérifié il y a {n} min', { n: minutes });
  if (minutes < 24 * 60) return t('Vérifié il y a {n} h', { n: Math.floor(minutes / 60) });
  return t('Vérifié le {day}', { day: formatDate(at) });
}
