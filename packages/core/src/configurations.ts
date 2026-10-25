// Configurations de borne : plusieurs jeux d'écrans pour une même installation
// (deux postes, un PC de bureau et une borne…). Chaque configuration est un modèle
// de borne complet (écrans, rôles, bord des flippers, son, boutons) avec son propre
// VPinballX.ini et sa mémoire des clés écrites ; les tables, les ROM et les médias
// restent communs. Celle à utiliser est reconnue d'après les écrans branchés.
// Ici, rien que du calcul : les fichiers sont lus et écrits par store.ts.

import * as path from 'node:path';
import { describeDisplay, fingerprintOf, modelKeyOfScreen } from './fingerprint';
import { formatList, t, tn } from './i18n';
import { matchScreens } from './match';
import type { Cabinet, ObservedDisplay, PhysicalScreen, RoleId } from './model';

export interface CabinetConfiguration extends Cabinet {
  /** Identifiant stable : il nomme le VPinballX.ini de la configuration et ne change pas au renommage. */
  id: string;
  /** Nom affiché, choisi par l'utilisateur (« Borne », « Bureau »…). */
  name: string;
  /**
   * VPinballX.ini de la configuration, dans le dossier de celui de l'emplacement
   * (Locations.vpxIni). Absent : ce fichier-là, celui de la configuration reprise
   * de l'ancien modèle, qui reste ainsi à sa place.
   */
  iniFile?: string;
}

export interface TrashedConfiguration extends CabinetConfiguration {
  deletedAt: string;
}

/** Choix fait sur l'écran « Quelle configuration ? » pour un jeu d'écrans branchés. */
export interface RememberedChoice {
  /** Empreintes des écrans branchés, triées. */
  screens: string[];
  id: string;
}

/** Contenu de cabinet.json : toutes les configurations de la borne. */
export interface CabinetSet {
  version: 2;
  configurations: CabinetConfiguration[];
  /** Dernière configuration utilisée, celle que lisent le menu, les réglages et l'assistant. */
  active?: string;
  /** Configuration imposée depuis le menu : la reconnaissance automatique est suspendue. */
  forced?: string;
  /** Choix de l'utilisateur quand les écrans ne désignaient pas une configuration à coup sûr (10 derniers). */
  remembered?: RememberedChoice[];
  /** Configurations supprimées depuis le menu, restaurables. */
  trash?: TrashedConfiguration[];
  updatedAt: string;
}

export const FIRST_CONFIGURATION = {
  id: 'borne',
  /** Nom donné à la première configuration, dans la langue de l'interface (renommable ensuite). */
  get name() {
    return t('Borne');
  },
} as const;
const REMEMBERED_KEPT = 10;

/**
 * Lit le contenu de cabinet.json, quel que soit son format. Un modèle d'avant les
 * configurations (un seul Cabinet) devient la configuration « Borne », reprise
 * telle quelle, qui garde le VPinballX.ini de l'emplacement.
 */
export function toCabinetSet(raw: unknown): { set: CabinetSet; migrated: boolean } {
  const value = raw as Partial<CabinetSet> & Partial<Cabinet>;
  if (value.version === 2 && Array.isArray(value.configurations)) return { set: value as CabinetSet, migrated: false };
  const cabinet = value as Cabinet;
  const configuration: CabinetConfiguration = { ...cabinet, ...FIRST_CONFIGURATION };
  return {
    set: { version: 2, configurations: [configuration], active: configuration.id, updatedAt: cabinet.updatedAt ?? new Date().toISOString() },
    migrated: true,
  };
}

/** Configuration que lisent le menu, les réglages et l'assistant : la dernière utilisée, sinon la première. */
export function activeConfiguration(set: CabinetSet): CabinetConfiguration | undefined {
  return set.configurations.find((c) => c.id === set.active) ?? set.configurations[0];
}

/** VPinballX.ini d'une configuration ; `baseIni` est celui de l'emplacement (Locations.vpxIni). */
export function configIniPath(baseIni: string, configuration: Cabinet | undefined): string {
  const iniFile = (configuration as Partial<CabinetConfiguration> | undefined)?.iniFile;
  return iniFile ? path.join(path.dirname(baseIni), iniFile) : baseIni;
}

// ---------- Reconnaissance ----------

/** Points de la reconnaissance : un écran retrouvé par son numéro de série compte le plus. */
export const CONFIGURATION_POINTS = { serial: 100, port: 60, model: 30, similar: 5, missing: -50, extra: -10 } as const;

export interface ConfigurationScore {
  id: string;
  name: string;
  points: number;
  /** Écrans enregistrés dans la configuration. */
  total: number;
  /** Retrouvés par l'empreinte forte (numéro de série de l'EDID). */
  serial: number;
  /** Retrouvés par l'empreinte faible : même modèle, même port. */
  port: number;
  /** Retrouvés par le modèle et la taille seulement (empreinte faible, câble changé de port). */
  model: number;
  /** Écrans enregistrés introuvables (éteints, débranchés, ou ceux d'un autre poste). */
  missing: PhysicalScreen[];
  /** Parmi eux, ceux dont un autre exemplaire du même modèle est branché. */
  similar: number;
  /** Écrans branchés qui n'appartiennent pas à la configuration. */
  extra: ObservedDisplay[];
  playfieldFound: boolean;
  /**
   * Peut être choisie d'office : au moins un écran retrouvé, au plus un introuvable
   * (un écran éteint), et pas plus d'écrans en trop que d'écrans retrouvés.
   */
  candidate: boolean;
}

export function scoreConfiguration(configuration: CabinetConfiguration, observed: ObservedDisplay[]): ConfigurationScore {
  const match = matchScreens(configuration.screens, observed);
  let serial = 0;
  let port = 0;
  let model = 0;
  for (const fp of match.matched.keys()) {
    const screen = configuration.screens.find((s) => s.fingerprint === fp)!;
    if (match.approximate.includes(fp)) model++;
    else if (screen.strength === 'strong') serial++;
    else port++;
  }
  const missing = configuration.screens.filter((s) => match.missing.includes(s.fingerprint));
  const freeModels = new Set(match.unknown.map((d) => fingerprintOf(d).modelKey));
  const similar = missing.filter((s) => freeModels.has(modelKeyOfScreen(s))).length;
  const found = serial + port + model;
  const P = CONFIGURATION_POINTS;
  return {
    id: configuration.id,
    name: configuration.name,
    points: serial * P.serial + port * P.port + model * P.model + similar * P.similar + missing.length * P.missing + match.unknown.length * P.extra,
    total: configuration.screens.length,
    serial,
    port,
    model,
    missing,
    similar,
    extra: match.unknown,
    playfieldFound: !configuration.roles.playfield || match.matched.has(configuration.roles.playfield),
    candidate: found >= 1 && missing.length <= 1 && match.unknown.length <= found,
  };
}

export type ConfigurationChoice =
  /** Imposée depuis le menu. */
  | { status: 'forced'; id: string; scores: ConfigurationScore[] }
  /** Reconnue d'office ; `partial` quand un de ses écrans est introuvable. */
  | { status: 'recognized'; id: string; partial: boolean; scores: ConfigurationScore[] }
  /** Choisie par l'utilisateur pour ces mêmes écrans, la dernière fois qu'ils ont été branchés. */
  | { status: 'remembered'; id: string; scores: ConfigurationScore[] }
  /** Plusieurs configurations correspondent autant : l'utilisateur choisit. */
  | { status: 'ambiguous'; tied: string[]; scores: ConfigurationScore[] }
  /** Aucune ne correspond : l'utilisateur choisit, ou crée une configuration. */
  | { status: 'unknown'; scores: ConfigurationScore[] };

/** Empreintes des écrans branchés, triées : la clé des choix mémorisés. */
export function screensSignature(observed: ObservedDisplay[]): string[] {
  return observed.map((d) => fingerprintOf(d).key).sort();
}

/**
 * Configuration à utiliser avec ces écrans. Les scores sont triés, le meilleur en
 * tête. Une seule configuration candidate et complète l'emporte toujours ; sinon un
 * choix mémorisé pour ces écrans, sinon la meilleure candidate si elle est seule à
 * ce score.
 */
export function chooseConfiguration(set: CabinetSet, observed: ObservedDisplay[]): ConfigurationChoice {
  const scores = set.configurations.map((c) => scoreConfiguration(c, observed)).sort((a, b) => b.points - a.points);
  if (set.forced && set.configurations.some((c) => c.id === set.forced)) return { status: 'forced', id: set.forced, scores };
  const candidates = scores.filter((s) => s.candidate);
  const best = candidates[0];
  const tied = best ? candidates.filter((s) => s.points === best.points) : [];
  if (best && tied.length === 1 && best.missing.length === 0) return { status: 'recognized', id: best.id, partial: false, scores };
  const signature = screensSignature(observed).join('|');
  const remembered = set.remembered?.find((r) => r.screens.join('|') === signature && set.configurations.some((c) => c.id === r.id));
  if (remembered) return { status: 'remembered', id: remembered.id, scores };
  if (best && tied.length === 1) return { status: 'recognized', id: best.id, partial: true, scores };
  if (tied.length > 1) return { status: 'ambiguous', tied: tied.map((s) => s.id), scores };
  return { status: 'unknown', scores };
}

/** Configuration retenue, ou undefined quand l'utilisateur doit choisir. */
export function chosenId(choice: ConfigurationChoice): string | undefined {
  return 'id' in choice ? choice.id : undefined;
}

/** « 3 écrans sur 4 retrouvés (2 par numéro de série, 1 par modèle et port) ; introuvable : … ; 1 écran branché en plus ». */
export function explainScore(score: ConfigurationScore): string {
  const found = score.serial + score.port + score.model;
  const how = [
    score.serial && t('{n} par numéro de série', { n: score.serial }),
    score.port && t('{n} par modèle et port', { n: score.port }),
    score.model && t('{n} par modèle et taille', { n: score.model }),
  ].filter(Boolean);
  const parts = [`${tn(found, '{n} écran sur {total} retrouvé', '{n} écrans sur {total} retrouvés', { total: score.total })}${how.length ? ` (${how.join(', ')})` : ''}`];
  if (score.missing.length) {
    const names = score.missing.map((s) => quoted(s.label)).join(', ');
    const similar = score.similar ? ` ${t('(le même modèle est branché, mais pas cet exemplaire)')}` : '';
    parts.push(`${tn(score.missing.length, 'introuvable : {names}', 'introuvables : {names}', { names })}${similar}`);
  }
  if (score.extra.length) parts.push(tn(score.extra.length, '{n} écran branché en plus', '{n} écrans branchés en plus'));
  return t('{parts} — score {points}', { parts: parts.join(t(' ; ')), points: score.points });
}

/** Nom (d'une configuration, d'un écran) entre guillemets, à la façon de la langue. */
function quoted(name: string): string {
  return t('« {name} »', { name });
}

/** Une phrase par choix, pour le menu, la synchronisation et la console. */
export function explainChoice(set: CabinetSet, choice: ConfigurationChoice): string {
  const name = (id: string) => quoted(set.configurations.find((c) => c.id === id)?.name ?? id);
  const scoreOf = (id: string) => choice.scores.find((s) => s.id === id)!;
  const runnerUp = (id: string) => choice.scores.find((s) => s.id !== id);
  switch (choice.status) {
    case 'forced':
      return t('{name} imposée depuis le menu (reconnaissance automatique suspendue) : {score}.', { name: name(choice.id), score: explainScore(scoreOf(choice.id)) });
    case 'recognized': {
      const other = runnerUp(choice.id);
      const params = {
        name: name(choice.id),
        score: explainScore(scoreOf(choice.id)),
        versus: other ? t(', devant {name} (score {points})', { name: quoted(other.name), points: other.points }) : '',
      };
      return choice.partial ? t('{name} retrouvée en partie : {score}{versus}.', params) : t('{name} reconnue : {score}{versus}.', params);
    }
    case 'remembered':
      return t('{name}, choisie pour ces mêmes écrans la dernière fois : {score}.', { name: name(choice.id), score: explainScore(scoreOf(choice.id)) });
    case 'ambiguous':
      return t('{names} correspondent autant aux écrans branchés (score {points}).', { names: formatList(choice.tied.map(name)), points: scoreOf(choice.tied[0]!).points });
    case 'unknown':
      return choice.scores.length
        ? t('Aucune configuration ne correspond aux écrans branchés (la plus proche : {name}, {score}).', { name: name(choice.scores[0]!.id), score: explainScore(choice.scores[0]!) })
        : t('Aucune configuration enregistrée.');
  }
}

/** « S22E450 (1920 × 1080), PLX2283HSU (1920 × 1080) » : les écrans branchés, pour l'écran de choix. */
export function describeDisplays(observed: ObservedDisplay[]): string {
  return observed.map(describeDisplay).join(', ') || t('aucun');
}

// ---------- Modifications ----------

/** Retient le choix de l'utilisateur pour ces écrans et en fait la configuration active. */
export function rememberChoice(set: CabinetSet, observed: ObservedDisplay[], id: string): CabinetSet {
  const screens = screensSignature(observed);
  const others = (set.remembered ?? []).filter((r) => r.screens.join('|') !== screens.join('|'));
  return { ...set, active: id, remembered: [...others, { screens, id }].slice(-REMEMBERED_KEPT) };
}

/** Imposer une configuration (id), ou revenir à la reconnaissance automatique (undefined). */
export function forceConfiguration(set: CabinetSet, id: string | undefined): CabinetSet {
  const next: CabinetSet = { ...set, forced: id };
  if (id) next.active = id;
  else delete next.forced;
  return next;
}

/** Écran du navigateur intégré d'une configuration : un rôle, ou undefined pour automatique. */
export function setBrowserScreen(set: CabinetSet, id: string, role: RoleId | undefined): CabinetSet {
  return {
    ...set,
    configurations: set.configurations.map((c) => {
      if (c.id !== id) return c;
      const { browserScreen: _old, ...rest } = c;
      return role ? { ...rest, browserScreen: role } : rest;
    }),
  };
}

export function renameConfiguration(set: CabinetSet, id: string, name: string): CabinetSet {
  const clean = name.trim();
  if (!clean) return set;
  return { ...set, configurations: set.configurations.map((c) => (c.id === id ? { ...c, name: uniqueName(set, clean, id) } : c)) };
}

/**
 * Met une configuration à la corbeille. Son VPinballX.ini reste sur le disque, pour
 * la restaurer telle quelle. La dernière configuration ne se supprime pas.
 */
export function trashConfiguration(set: CabinetSet, id: string, now = new Date()): CabinetSet {
  const target = set.configurations.find((c) => c.id === id);
  if (!target || set.configurations.length < 2) return set;
  const next: CabinetSet = {
    ...set,
    configurations: set.configurations.filter((c) => c.id !== id),
    remembered: set.remembered?.filter((r) => r.id !== id),
    trash: [...(set.trash ?? []), { ...target, deletedAt: now.toISOString() }],
  };
  if (next.forced === id) delete next.forced;
  if (next.active === id) delete next.active;
  return next;
}

export function restoreConfiguration(set: CabinetSet, id: string): CabinetSet {
  const target = set.trash?.find((c) => c.id === id);
  if (!target) return set;
  const { deletedAt: _deletedAt, ...configuration } = target;
  return {
    ...set,
    configurations: [...set.configurations, { ...configuration, name: uniqueName(set, configuration.name, id) }],
    trash: set.trash!.filter((c) => c.id !== id),
  };
}

/**
 * Ajoute une configuration (assistant, « Nouvelle configuration ») et en fait la
 * configuration active. Son VPinballX.ini est un fichier à elle, à côté de celui de
 * l'emplacement.
 */
export function addConfiguration(set: CabinetSet | undefined, cabinet: Cabinet, name?: string): { set: CabinetSet; configuration: CabinetConfiguration } {
  const base: CabinetSet = set ?? { version: 2, configurations: [], updatedAt: new Date().toISOString() };
  const first = base.configurations.length === 0 && !base.trash?.length;
  const wanted = name?.trim() || (first ? FIRST_CONFIGURATION.name : defaultName(cabinet));
  const id = first ? FIRST_CONFIGURATION.id : uniqueId(base, wanted);
  const { id: _id, name: _name, iniFile: _iniFile, ...model } = cabinet as Partial<CabinetConfiguration> & Cabinet;
  const configuration: CabinetConfiguration = { ...model, id, name: uniqueName(base, wanted, id), ...(!first && { iniFile: `VPinballX-${id}.ini` }) };
  return { set: { ...base, configurations: [...base.configurations, configuration], active: id }, configuration };
}

/** « Poste à 3 écrans » : nom proposé à une nouvelle configuration, à renommer dans le menu. */
function defaultName(cabinet: Cabinet): string {
  return tn(cabinet.screens.length, 'Poste à {n} écran', 'Poste à {n} écrans');
}

function uniqueName(set: CabinetSet, name: string, id: string): string {
  const taken = new Set(set.configurations.filter((c) => c.id !== id).map((c) => c.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; ; n++) if (!taken.has(`${name} ${n}`.toLowerCase())) return `${name} ${n}`;
}

/** Identifiant tiré du nom, unique parmi les configurations et la corbeille (dont les .ini restent sur le disque). */
function uniqueId(set: CabinetSet, name: string): string {
  const slug =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'configuration';
  const taken = new Set([...set.configurations, ...(set.trash ?? [])].map((c) => c.id));
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.has(`${slug}-${n}`)) return `${slug}-${n}`;
}
