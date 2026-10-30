// Parcours « Ce qu'il manque pour jouer » : pour une table installée, la suite des étapes
// jusqu'à « Jouer », chacune avec son état (réglée, à faire, attendue, reçue…) et le geste
// suivant. Calculé sans réseau ni écriture, d'après ce que l'application sait déjà : VPX
// installé ou non, borne configurée, script de la table, constats du médecin (doctor.ts),
// base VPS en cache et liste d'attente (acquisition.ts).
//
// Pour une ROM absente : où la trouver (fichiers ROM de la base VPS, le nom exact d'abord
// et le jeu de la table d'abord, puis les révisions voisines), ce qui est déjà attendu ou
// reçu pour elle, la révision voisine déjà sur la borne. Cyber Pinball ne télécharge jamais
// à la place de l'utilisateur sur les forums à compte (docs/recherche/acquisition.md) : il
// ouvre la bonne page dans la fenêtre « Récupérer » et range le fichier que l'utilisateur y
// télécharge, rattaché à la table.
//
// Seuls le fichier .vpx et, si le script en demande une, la ROM sont obligatoires
// (playable.ts) : le chemin jusqu'à « Jouer » ne compte qu'eux, avec VPX et la borne. Le
// reste (rangement, contenu du DMD, fronton, PuP-Pack, affichage) est proposé à part,
// « Pour aller plus loin », sans jamais retenir « Jouer » ni compter dans « étape n sur N ».
//
// Les étapes déjà montrées pour une table sont retenues (<données>\parcours.json) : une
// étape réglée reste dans la liste, cochée, et le décompte « étape n sur N » ne bouge pas
// quand on reprend le parcours plus tard.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  liveLinks,
  NEED_LABELS,
  linkHost,
  recommendVersion,
  requirements,
  versionLabel,
  vpxVersions,
  type CabinetScreens,
  type LinkHost,
  type NeedKind,
  type WaitItem,
  type WaitList,
} from './acquisition';
import type { Finding, ScriptFacts } from './doctor';
import { formatDate, formatList, t, tn } from './i18n';
import { blocksPlay } from './playable';
import { neighbourRom, neighbourWarning, romFamilyOf } from './romalias';
import type { VpsDb, VpsGame, VpsTableFile } from './vps';

export type JourneyStepId = 'setup' | 'table' | 'rom' | 'tidy' | 'dmd' | 'backglass' | 'pup' | 'display' | 'play';

/** Chemin jusqu'à « Jouer » : VPX et la borne, la table, sa ROM. Seules ces étapes peuvent être indispensables. */
export const JOURNEY_PATH: readonly JourneyStepId[] = ['setup', 'table', 'rom', 'play'];

/** « Pour aller plus loin » : facultatives, proposées après le chemin, jamais indispensables. */
export const JOURNEY_EXTRAS: readonly JourneyStepId[] = ['tidy', 'dmd', 'backglass', 'pup', 'display'];

/** Toutes les étapes, dans l'ordre où elles sont montrées (mémoire des parcours). */
export const JOURNEY_STEPS: readonly JourneyStepId[] = ['setup', 'table', 'rom', 'tidy', 'dmd', 'backglass', 'pup', 'display', 'play'];

/**
 * - done : réglée ;
 * - todo : à faire (indispensable si `required`, conseillée sinon) ;
 * - waiting : page ouverte, fichier attendu ;
 * - received : fichier reçu, à installer ;
 * - pending : attend une étape précédente (« Jouer », la ROM tant que VPX manque) ;
 * - optional : facultative, pas faite ;
 * - unchecked : ne peut pas être vérifiée (script illisible, nom de ROM inconnu).
 */
export type JourneyState = 'done' | 'todo' | 'waiting' | 'received' | 'pending' | 'optional' | 'unchecked';

/** Un fichier de la base VPS qu'on peut aller chercher, et où. */
export interface FileSource {
  game: VpsGame;
  kind: NeedKind;
  file: VpsTableFile;
  url: string;
  host: LinkHost;
  /** ROM : nom du zip (t2_l8). */
  rom?: string;
  /** ROM d'une autre révision du même jeu que celle que demande le script. */
  neighbour?: boolean;
}

export type JourneyAction =
  | { kind: 'installVpx' }
  /** Assistant de la borne (écrans, boutons, son). */
  | { kind: 'setup' }
  /** Correction du médecin, sur place. */
  | { kind: 'repair'; finding: Finding }
  /** Page du fichier dans la fenêtre « Récupérer » (ou téléchargement direct, connecté). */
  | { kind: 'fetch'; source: FileSource }
  /** Plusieurs fichiers d'une même partie : la galerie des fichiers (aperçu, popularité), Start récupère celui choisi. */
  | { kind: 'choose'; sources: FileSource[] }
  | { kind: 'reopen'; item: WaitItem }
  /** Fichiers reçus : plan d'import, puis retour au parcours. */
  | { kind: 'install'; items: WaitItem[] }
  | { kind: 'scanDownloads' }
  /** Catalogue, recherche préremplie (rien de connu dans la base VPS). */
  | { kind: 'search'; text: string }
  /** Le fichier est déjà là : glisser sur l'écran, ou le choisir sur ce PC. */
  | { kind: 'addFile' }
  | { kind: 'play' };

export interface JourneyChoice {
  action: JourneyAction;
  label: string;
  detail?: string;
  /** Geste conseillé pour l'étape : le premier proposé, le seul allumé. */
  primary?: boolean;
}

export interface JourneyStep {
  id: JourneyStepId;
  title: string;
  state: JourneyState;
  /** Sans elle, la table ne se lance pas. */
  required: boolean;
  /** Où en est l'étape et ce que fait le geste conseillé, en deux phrases au plus. */
  detail: string;
  /** À savoir avant de choisir : droits d'une ROM, révision voisine. */
  note?: string;
  choices: JourneyChoice[];
}

export interface Journey {
  /** Le chemin jusqu'à « Jouer » (JOURNEY_PATH) : « étape n sur N » ne compte que lui. */
  steps: JourneyStep[];
  /** « Pour aller plus loin » (JOURNEY_EXTRAS) : facultatives, jamais indispensables. */
  extras: JourneyStep[];
  /** Étape du chemin à faire maintenant : la première indispensable pas réglée, sinon « Jouer ». */
  current: number;
  /** Tout l'indispensable est réglé. */
  ready: boolean;
  /** Étapes du chemin réglées, hors « Jouer ». */
  settled: number;
  /** Étapes indispensables qui restent, hors « Jouer ». */
  remaining: number;
  /** Améliorations proposées et pas faites. */
  proposed: number;
}

export interface JourneyInput {
  /** Fichier .vpx de la table : relie les éléments de la liste d'attente au parcours. */
  file: string;
  /** Jeu VPS de la table (.info), et fichier VPS dont elle vient (provenance). */
  vpsId?: string;
  sourceFileId?: string;
  vpxInstalled: boolean;
  cabinetConfigured: boolean;
  screens: CabinetScreens;
  /** Script lu (ou son erreur) ; absent si VPX n'a jamais pu le lire. */
  script?: ScriptFacts | { error: string };
  /** Constats du médecin pour cette table. */
  findings: Finding[];
  /** Base VPS en cache ; absente, le parcours propose de chercher et d'ajouter le fichier soi-même. */
  vps?: VpsDb;
  waitList?: WaitList;
  /** Étapes déjà montrées pour cette table (parcours repris). */
  seen?: readonly JourneyStepId[];
}

// ---------------------------------------------------------------------------
// Où trouver un fichier

/**
 * Fichiers ROM de la base VPS pour ces noms : le nom exact d'abord, celui du jeu de la
 * table d'abord, le plus récent d'abord ; puis les autres révisions du même jeu (même
 * famille, « t2_l6 » pour « t2_l8 »), la plus proche d'abord. Seuls les liens vivants.
 */
export function romSources(vps: VpsDb | undefined, roms: string[], vpsId?: string): FileSource[] {
  if (!vps || !roms.length) return [];
  const wanted = new Set(roms.map((r) => r.toLowerCase()));
  const families = new Set(roms.filter((r) => r.includes('_')).map(romFamilyOf));
  const out: FileSource[] = [];
  const seen = new Set<string>();
  for (const game of vps.games) {
    for (const r of game.romFiles ?? []) {
      const name = (r.version ?? '').trim();
      const link = liveLinks(r)[0];
      if (!name || !link) continue;
      const exact = wanted.has(name.toLowerCase());
      if (!exact && !(name.includes('_') && families.has(romFamilyOf(name)))) continue;
      const key = `${name.toLowerCase()} ${link.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Même identifiant que le catalogue : un élément de la liste d'attente sert aux deux.
      const file = { ...r, id: r.id ?? `rom:${name}` } as VpsTableFile;
      out.push({ game, kind: 'rom', file, url: link.url, host: linkHost(link.url), rom: name, neighbour: exact ? undefined : true });
    }
  }
  const best = neighbourRom(roms[0]!, out.filter((s) => s.neighbour).map((s) => s.rom!));
  return out.sort(
    (a, b) =>
      Number(Boolean(a.neighbour)) - Number(Boolean(b.neighbour)) ||
      Number(b.rom === best) - Number(a.rom === best) ||
      Number(b.game.id === vpsId) - Number(a.game.id === vpsId) ||
      (b.file.updatedAt ?? 0) - (a.file.updatedAt ?? 0),
  );
}

/** Fichiers d'une sorte (table, fronton, PuP-Pack) pour le jeu de la table, le plus adapté à la borne d'abord. */
export function gameSources(vps: VpsDb | undefined, vpsId: string | undefined, kind: 'table' | 'b2s' | 'pup', screens: CabinetScreens, sourceFileId?: string): FileSource[] {
  const game = vpsId ? vps?.games.find((g) => g.id === vpsId) : undefined;
  if (!game) return [];
  const versions = vpxVersions(game);
  const version = versions.find((v) => v.id === sourceFileId) ?? recommendVersion(game)?.file ?? versions[0];
  if (!version) return [];
  let files: VpsTableFile[];
  if (kind === 'table') {
    const table = liveLinks(version).length ? version : recommendVersion(game)?.file;
    files = table ? [table] : [];
  } else files = requirements(game, version, { screens, roms: new Set(), installed: true }).find((n) => n.kind === kind)?.files ?? [];
  return files.flatMap((file) => {
    const link = liveLinks(file)[0];
    return link ? [{ game, kind, file, url: link.url, host: linkHost(link.url) }] : [];
  });
}

/** « vpforums.org · compte nécessaire » */
export function hostDetail(host: LinkHost): string {
  return host.account ? t('{site} · compte nécessaire', { site: host.label }) : host.label;
}

// ---------------------------------------------------------------------------
// Le parcours

const RIGHTS_NOTE = () => t('Protégée par le droit d’auteur : ne la récupérez que si vous y avez droit.');

/** Éléments de la liste d'attente encore utiles pour cette étape (attendus ou reçus). */
function activeItems(input: JourneyInput, test: (i: WaitItem) => boolean): WaitItem[] {
  return (input.waitList?.items ?? []).filter((i) => i.state !== 'installed' && test(i));
}

const sameFile = (a: string | undefined, b: string) => Boolean(a) && path.resolve(a!).toLowerCase() === path.resolve(b).toLowerCase();

function repairChoice(finding: Finding, primary = false): JourneyChoice {
  return { action: { kind: 'repair', finding }, label: finding.fix!.label, detail: t('Réparé sur place ; ce qui est retiré part dans la corbeille'), primary };
}

function fetchChoice(source: FileSource, label: string): JourneyChoice {
  return {
    action: { kind: 'fetch', source },
    label,
    detail: hostDetail(source.host),
  };
}

/**
 * Tous les fichiers d'une partie, quand la base VPS en connaît plusieurs : le premier est
 * proposé d'office, les autres se choisissent en galerie (aperçu, popularité, auteur, date).
 * Un seul jeu à la fois : la galerie récupère pour le jeu de la table.
 */
function chooseChoice(sources: FileSource[]): JourneyChoice[] {
  const same = sources.filter((s) => s.game.id === sources[0]?.game.id);
  if (same.length < 2) return [];
  return [{ action: { kind: 'choose', sources: same }, label: t('{kind} : voir les {n} au choix', { kind: NEED_LABELS[same[0]!.kind], n: same.length }), detail: t('Aperçu, téléchargements, note, auteur et date de chacun') }];
}

const addFileChoice = (): JourneyChoice => ({ action: { kind: 'addFile' }, label: t('J’ai déjà le fichier'), detail: t('Le glisser sur cet écran, ou le choisir sur ce PC') });

/**
 * Ce qu'on attend ou a reçu pour une étape : reçu, l'installer ; attendu, rouvrir sa page
 * (ou le chercher dans Téléchargements). undefined s'il n'y a rien.
 */
function waitState(items: WaitItem[]): { state: JourneyState; detail: string; choices: JourneyChoice[] } | undefined {
  const received = items.filter((i) => i.state === 'received' && i.received);
  if (received.length) {
    const first = received[0]!;
    return {
      state: 'received',
      detail: t('Reçu : {file} ({site}). Le plan s’affiche avant toute écriture, puis la table est revérifiée.', { file: path.basename(first.received!.file), site: linkHost(first.page).label }),
      choices: [
        {
          action: { kind: 'install', items: received },
          label: tn(received.length, 'Installer le fichier reçu', 'Installer les {n} fichiers reçus'),
          detail: t('Plan, puis vérification de la table'),
          primary: true,
        },
      ],
    };
  }
  const waiting = items.find((i) => i.state === 'waiting');
  if (!waiting) return undefined;
  const host = linkHost(waiting.page);
  return {
    state: 'waiting',
    detail: t('Page ouverte le {date} sur {site} : téléchargez-y le fichier, il sera rattaché à cette table tout seul.', { date: formatDate(Date.parse(waiting.addedAt), { day: '2-digit', month: '2-digit' }), site: host.label }),
    choices: [
      { action: { kind: 'reopen', item: waiting }, label: t('Rouvrir la page : {label}', { label: waiting.label }), detail: hostDetail(host), primary: true },
      { action: { kind: 'scanDownloads' }, label: t('Chercher dans Téléchargements'), detail: t('Si vous l’avez téléchargé dans votre propre navigateur') },
    ],
  };
}

function setupStep(input: JourneyInput): JourneyStep {
  const choices: JourneyChoice[] = [];
  if (!input.vpxInstalled) choices.push({ action: { kind: 'installVpx' }, label: t('Installer Visual Pinball X'), detail: t('Téléchargé depuis GitHub et vérifié'), primary: true });
  if (!input.cabinetConfigured) choices.push({ action: { kind: 'setup' }, label: t('Configurer la borne'), detail: t('Écrans, boutons et son, avec l’assistant'), primary: !choices.length });
  const detail = !input.vpxInstalled
    ? input.cabinetConfigured
      ? t('Visual Pinball X n’est pas installé : c’est lui qui joue les tables.')
      : t('Visual Pinball X n’est pas installé, et la borne n’est pas configurée.')
    : !input.cabinetConfigured
      ? t('La borne n’est pas configurée : VPX ne sait pas sur quels écrans mettre la table, le fronton et le DMD.')
      : t('Visual Pinball X installé, borne configurée.');
  return { id: 'setup', title: t('Borne et VPX'), state: choices.length ? 'todo' : 'done', required: true, detail, choices };
}

/** Constats de rangement de la table : proposés, jamais indispensables (la table se lance). */
const TIDY_CODES: readonly Finding['code'][] = ['outsideFolder', 'scriptOverride', 'scriptPatchStale', 'scriptCoreCompat', 'crashReport'];

/** Le fichier .vpx : là, puisque la table est installée ; ce que demande son script. */
function tableStep(input: JourneyInput): JourneyStep {
  const script = input.script && !('error' in input.script) ? input.script : undefined;
  const file = path.basename(input.file);
  const detail = !script
    ? t('{file} est là.', { file })
    : script.usesPinmame && script.roms.length
      ? t('{file} est là ; son script demande la ROM {rom}.', { file, rom: formatList(script.roms, 'or') })
      : script.usesPinmame
        ? t('{file} est là ; son script utilise PinMAME.', { file })
        : t('{file} est là ; son script ne demande pas de ROM.', { file });
  return { id: 'table', title: t('Table'), state: 'done', required: true, detail, choices: [] };
}

/** Table hors de son dossier, script remplacé, rapport de plantage : à ranger, si on veut. */
function tidyStep(input: JourneyInput): JourneyStep | undefined {
  const found = input.findings.filter((f) => TIDY_CODES.includes(f.code));
  const title = t('Rangement de la table');
  if (!found.length) return input.seen?.includes('tidy') ? { id: 'tidy', title, state: 'done', required: false, detail: t('Rien à ranger.'), choices: [] } : undefined;
  return {
    id: 'tidy',
    title,
    state: 'todo',
    required: false,
    detail: found.length > 1 ? `${formatList(found.map((f) => f.title))}. ${found[0]!.detail}` : `${found[0]!.title}. ${found[0]!.detail}`,
    choices: found.filter((f) => f.fix).map((f, i) => repairChoice(f, i === 0)),
  };
}

const ROM_FIXED_HERE: readonly Finding['code'][] = ['romNotLinked', 'romMisplaced', 'romScattered', 'romNested', 'romAliasHistoric', 'romAliasObsolete'];

function romStep(input: JourneyInput): JourneyStep | undefined {
  const script = input.script;
  const seen = input.seen?.includes('rom');
  const step = (state: JourneyState, detail: string, extra: Partial<JourneyStep> = {}): JourneyStep => ({ id: 'rom', title: 'ROM', state, required: true, detail, choices: [], ...extra });
  if (!script) return !input.vpxInstalled || seen ? step('pending', t('Le nom de la ROM est écrit dans le script de la table, que VPX sait lire : il faut d’abord VPX.')) : undefined;
  if ('error' in script) return step('unchecked', t('Le script n’a pas pu être lu : la ROM n’est pas vérifiée.'), { required: false });
  if (!script.usesPinmame) return seen ? step('done', t('Cette table n’en a pas besoin.')) : undefined;
  if (!script.roms.length) return step('unchecked', t('La table utilise PinMAME, mais le nom de sa ROM n’apparaît pas clairement dans son script.'), { required: false });

  const found = input.findings.filter((f) => f.code.startsWith('rom') && f.code !== 'romCopy' && f.code !== 'romUnknown');
  const main = found.find((f) => f.severity === 'error') ?? found.find((f) => f.severity === 'warning') ?? found[0];
  const rom = main?.rom ?? script.roms[0]!;
  const title = t('ROM {rom}', { rom });
  if (!main) return step('done', t('Présente : la table la trouve.'), { title: t('ROM {rom}', { rom: formatList(script.roms, 'or') }) });

  // Révision voisine chargée par un alias : la table joue.
  if (main.code === 'romAlias' && main.severity === 'info') {
    return step('done', t('Révision voisine {neighbour} chargée à la place de {rom}, par un alias.', { neighbour: main.neighbour ?? '', rom }), { title, note: neighbourWarning() });
  }
  // Dans la bibliothèque, trouvée par le dossier commun de PinMAME : la table joue.
  if (main.code === 'romNotLinked' && main.severity === 'info') return step('done', t('Dans la bibliothèque de ROM ; la table la trouve par le dossier commun de PinMAME.'), { title });
  // Une correction sur place suffit : lier, ranger, écrire ou retirer un alias.
  if (main.fix && ROM_FIXED_HERE.includes(main.code)) {
    return step('todo', `${main.title}. ${main.detail}`, { title, required: blocksPlay(main), choices: [repairChoice(main, true)] });
  }

  // Rien qui empêche PinMAME de la lire (un rappel, une copie à part) : la table joue.
  if (!blocksPlay(main)) return step('done', t('Présente : la table la trouve.'), { title });

  // La ROM n'est pas sur la borne : la récupérer.
  const targets = [...new Set([rom, ...(main.code === 'romMissing' && !main.fix ? script.roms : [])])];
  const items = activeItems(input, (i) => i.kind === 'rom' && (targets.some((r) => r.toLowerCase() === i.rom?.toLowerCase()) || sameFile(i.table, input.file)));
  const sources = romSources(input.vps, targets, input.vpsId);
  const exact = sources.filter((s) => !s.neighbour);
  const near = sources.filter((s) => s.neighbour);
  const aliasHere = main.code === 'romAlias' && main.fix ? main : undefined;
  const choices: JourneyChoice[] = [];
  const waiting = waitState(items);
  let detail: string;
  let note = RIGHTS_NOTE();
  if (waiting) {
    detail = waiting.detail;
    choices.push(...waiting.choices);
  } else if (exact.length) {
    detail = t('La table ne démarre pas sans {rom}.zip. Ouvrez sa page sur {site}, connectez-vous et téléchargez-la : elle sera rattachée à cette table, puis installée.', { rom, site: exact[0]!.host.label });
  } else if (aliasHere) {
    detail = t('La table ne démarre pas sans {rom}.zip, et la base VPS ne connaît aucun lien pour elle. {neighbour}.zip, du même jeu, est déjà sur la borne : un alias peut la faire charger à sa place.', { rom, neighbour: aliasHere.neighbour ?? '' });
    note = neighbourWarning();
  } else if (near.length) {
    detail = t('La table ne démarre pas sans {rom}.zip, que la base VPS ne propose pas. Elle donne {neighbour}, une autre révision du même jeu : un alias la fera charger à la place.', { rom, neighbour: near[0]!.rom! });
    note = `${RIGHTS_NOTE()} ${neighbourWarning()}`;
  } else {
    detail = input.vps
      ? t('La table ne démarre pas sans {rom}.zip, et la base VPS ne connaît aucun lien pour elle. Cherchez-la dans le catalogue, ou ajoutez le fichier si vous l’avez.', { rom })
      : t('La table ne démarre pas sans {rom}.zip. La base VPS n’est pas sur cette borne (jamais téléchargée, pas de réseau) : ajoutez le fichier si vous l’avez.', { rom });
  }
  for (const s of exact.slice(0, 2)) choices.push(fetchChoice(s, exact.length > 1 ? t('Récupérer la ROM {rom} ({site})', { rom: s.rom!, site: s.host.label }) : t('Récupérer la ROM {rom}', { rom: s.rom! })));
  if (!waiting && exact.length > 2) choices.push(...chooseChoice(exact));
  if (aliasHere) choices.push({ ...repairChoice(aliasHere), label: t('Jouer avec {neighbour}, révision voisine', { neighbour: aliasHere.neighbour ?? '' }), detail: t('Déjà sur la borne ; réglages et records non repris') });
  else if (near.length) choices.push(fetchChoice(near[0]!, t('Récupérer {rom}, révision voisine', { rom: near[0]!.rom! })));
  // Alias vers une ROM absente : on peut aussi revenir à la ROM demandée.
  if (main.code === 'romMissing' && main.fix) choices.push(repairChoice(main));
  choices.push(addFileChoice());
  if (!exact.length && input.vps) choices.push({ action: { kind: 'search', text: rom }, label: t('Chercher {rom} dans le catalogue', { rom }), detail: t('Recherche par titre, initiales ou nom de ROM') });
  if (!choices.some((c) => c.primary)) choices[0]!.primary = true;
  return { id: 'rom', title, state: waiting?.state ?? 'todo', required: true, detail, note, choices };
}

/**
 * Dossier FlexDMD / UltraDMD que charge le script : facultatif. Sans lui, l'emplacement du
 * DMD garde le DMD de la ROM (ou reste vide pour une table sans ROM) ; proposé, jamais exigé.
 */
function dmdStep(input: JourneyInput): JourneyStep | undefined {
  const script = input.script && !('error' in input.script) ? input.script : undefined;
  const finding = input.findings.find((f) => f.code === 'dmdFolderMissing');
  const title = t('Contenu du DMD');
  if (!finding) {
    return script?.dmdFolder || input.seen?.includes('dmd')
      ? { id: 'dmd', title, state: 'done', required: false, detail: script?.dmdFolder ? t('Dossier « {folder} » présent.', { folder: script.dmdFolder }) : t('Présent.'), choices: [] }
      : undefined;
  }
  if (finding.fix) return { id: 'dmd', title, state: 'todo', required: false, detail: `${finding.title}. ${finding.detail}`, choices: [repairChoice(finding, true)] };
  // Le dossier est livré avec la table d'origine : récupérer de nouveau son archive.
  const sources = gameSources(input.vps, input.vpsId, 'table', input.screens, input.sourceFileId);
  const items = activeItems(input, (i) => i.kind === 'table' && (sameFile(i.table, input.file) || (Boolean(input.vpsId) && i.gameId === input.vpsId)));
  const waiting = waitState(items);
  const choices: JourneyChoice[] = [...(waiting?.choices ?? [])];
  for (const s of sources.slice(0, 1)) choices.push(fetchChoice(s, t('Récupérer la table d’origine ({version})', { version: versionLabel(s.file) })));
  choices.push({ ...addFileChoice(), label: t('J’ai l’archive de la table') });
  if (!choices.some((c) => c.primary)) choices[0]!.primary = true;
  const folder = script?.dmdFolder ?? '';
  return {
    id: 'dmd',
    title,
    state: waiting?.state ?? 'optional',
    required: false,
    detail:
      waiting?.detail ??
      (script?.usesPinmame
        ? t('Le DMD de la ROM s’affiche à sa place. Le dossier « {folder} » ajoute celui que dessine le script ; l’archive de la table d’origine le contient.', { folder })
        : t('La table se lance sans lui. Le dossier « {folder} » contient les images du DMD que dessine le script ; l’archive de la table d’origine le contient.', { folder })),
    choices,
  };
}

/** Fronton ou PuP-Pack absents : facultatifs, à récupérer pour le jeu de la table. */
function extraStep(input: JourneyInput, id: 'backglass' | 'pup', kind: 'b2s' | 'pup', title: string, missingDetail: string, fetchLabel: (s: FileSource) => string): JourneyStep {
  const sources = gameSources(input.vps, input.vpsId, kind, input.screens, input.sourceFileId);
  const items = activeItems(input, (i) => i.kind === kind && (sameFile(i.table, input.file) || (Boolean(input.vpsId) && i.gameId === input.vpsId)));
  const waiting = waitState(items);
  const choices: JourneyChoice[] = [...(waiting?.choices ?? [])];
  for (const s of sources.slice(0, 1)) choices.push(fetchChoice(s, fetchLabel(s)));
  if (!waiting) choices.push(...chooseChoice(sources));
  choices.push(addFileChoice());
  if (!choices.some((c) => c.primary)) choices[0]!.primary = true;
  return { id, title, state: waiting?.state ?? 'optional', required: false, detail: waiting?.detail ?? missingDetail, choices };
}

function backglassStep(input: JourneyInput): JourneyStep | undefined {
  if (!input.screens.backglass && !input.seen?.includes('backglass')) return undefined;
  const title = t('Fronton');
  const misnamed = input.findings.find((f) => f.code === 'backglassMisnamed');
  if (misnamed?.fix) return { id: 'backglass', title, state: 'todo', required: false, detail: `${misnamed.title}. ${misnamed.detail}`, choices: [repairChoice(misnamed, true)] };
  if (!input.findings.some((f) => f.code === 'backglassMissing')) return { id: 'backglass', title, state: 'done', required: false, detail: t('Présent : VPX l’affiche sur l’écran du fronton.'), choices: [] };
  if (!input.screens.backglass) return { id: 'backglass', title, state: 'done', required: false, detail: t('Inutile : la borne n’a pas d’écran de fronton.'), choices: [] };
  return extraStep(input, 'backglass', 'b2s', title, t('Facultatif : sans lui, le menu garde son image sur l’écran du fronton pendant la partie.'), (s) => t('Récupérer le fronton : {label}', { label: versionLabel(s.file) }));
}

const PUP_FIXES: readonly Finding['code'][] = ['pupMissing', 'pupNotLoaded', 'pupNested', 'pupDisabledByScript', 'pupOptionNotApplied', 'pupOptionUnsuited', 'pupHidesDmd', 'pupPlaylistOrder', 'pupFileNames'];

function pupStep(input: JourneyInput): JourneyStep | undefined {
  const script = input.script && !('error' in input.script) ? input.script : undefined;
  const found = input.findings.filter((f) => PUP_FIXES.includes(f.code) && f.severity !== 'info');
  if (!script?.pup && !found.length && !input.seen?.includes('pup')) return undefined;
  const title = 'PuP-Pack';
  const fixable = found.find((f) => f.fix);
  if (fixable) return { id: 'pup', title, state: 'todo', required: false, detail: `${fixable.title}. ${fixable.detail}`, choices: [repairChoice(fixable, true)] };
  // Coupé par un script qu'on ne sait pas réécrire (table protégée) : à changer à la main.
  const off = found.find((f) => f.code === 'pupDisabledByScript');
  if (off) return { id: 'pup', title, state: 'todo', required: false, detail: `${off.title}. ${off.detail}`, choices: [] };
  if (found.some((f) => f.code === 'pupMissing')) {
    return extraStep(input, 'pup', 'pup', title, t('Facultatif : le script charge un PuP-Pack (vidéos sur le fronton et l’afficheur) ; la table se joue sans.'), (s) => t('Récupérer le PuP-Pack : {label}', { label: versionLabel(s.file) }));
  }
  return { id: 'pup', title, state: 'done', required: false, detail: script?.pup ? t('Rangé là où le plugin PUP le cherche.') : t('Rien à faire.'), choices: [] };
}

function displayStep(input: JourneyInput): JourneyStep | undefined {
  const found = input.findings.filter((f) => (f.code === 'tableOrientation' || f.code === 'manualView' || f.code === 'tableWindows' || f.code === 'fullDmdHidden') && f.fix);
  if (!found.length) return input.seen?.includes('display') ? { id: 'display', title: t('Affichage'), state: 'done', required: false, detail: t('Cadrage et écrans de la configuration de la borne.'), choices: [] } : undefined;
  return {
    id: 'display',
    title: t('Affichage'),
    state: found.some((f) => f.severity === 'warning') ? 'todo' : 'optional',
    required: false,
    detail: `${found[0]!.title}. ${found[0]!.detail}`,
    choices: found.map((f, i) => repairChoice(f, i === 0)),
  };
}

/** Le parcours de cette table, de la borne à « Jouer », et ce qu'on peut ajouter ensuite. */
export function planJourney(input: JourneyInput): Journey {
  const present = (list: (JourneyStep | undefined)[]) => list.filter((s): s is JourneyStep => Boolean(s));
  const steps = present([setupStep(input), tableStep(input), romStep(input)]);
  // La règle (playable.ts) : rien de « Pour aller plus loin » ne retient « Jouer ».
  const extras = present([tidyStep(input), dmdStep(input), backglassStep(input), pupStep(input), displayStep(input)]).map((s) => ({ ...s, required: false }));
  const blockers = steps.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => s.required && s.state !== 'done');
  const ready = !blockers.length;
  steps.push({
    id: 'play',
    title: t('Jouer'),
    state: ready ? 'todo' : 'pending',
    required: true,
    detail: ready
      ? t('Tout l’indispensable est là.')
      : tn(blockers.length, 'Dès que l’étape {list} est réglée.', 'Dès que les étapes {list} sont réglées.', { list: formatList(blockers.map((b) => String(b.n))) }),
    choices: ready ? [{ action: { kind: 'play' }, label: t('Jouer'), primary: true }] : [],
  });
  const current = ready ? steps.length - 1 : steps.indexOf(blockers[0]!.s);
  return {
    steps,
    extras,
    current,
    ready,
    settled: steps.filter((s) => s.id !== 'play' && s.state === 'done').length,
    remaining: blockers.length,
    proposed: extras.filter((s) => s.state !== 'done' && s.choices.length > 0).length,
  };
}

/**
 * Gestes proposés à l'écran, dans l'ordre : ceux de l'étape courante (le conseillé en
 * tête), puis le premier de chaque autre étape du chemin pas réglée, puis le premier de
 * chaque amélioration (« Pour aller plus loin » : un fronton, le contenu du DMD).
 */
export function journeyChoices(journey: Journey): { step: JourneyStep; choice: JourneyChoice }[] {
  const now = journey.steps[journey.current]!;
  const out = now.choices.map((choice) => ({ step: now, choice }));
  for (const s of [...journey.steps, ...journey.extras]) {
    if (s === now || s.state === 'done' || !s.choices.length) continue;
    out.push({ step: s, choice: { ...s.choices[0]!, primary: false } });
    // Plusieurs fichiers au choix : la galerie reste à portée, même hors de l'étape en cours (fronton, PuP-Pack).
    const choose = s.choices.find((c) => c.action.kind === 'choose');
    if (choose && choose !== s.choices[0]) out.push({ step: s, choice: { ...choose, primary: false } });
  }
  return out;
}

/** « Étape 3 sur 4 » : le chemin jusqu'à « Jouer » seulement. */
export function journeyPosition(journey: Journey): string {
  return t('Étape {n} sur {total}', { n: journey.current + 1, total: journey.steps.length });
}

/** « 2 étapes réglées · 1 indispensable à faire », et les améliorations proposées. */
export function journeySummary(journey: Journey): string {
  const settled = tn(journey.settled, '{n} étape réglée', '{n} étapes réglées');
  const state = journey.ready ? t('prête à jouer') : tn(journey.remaining, '{n} indispensable à faire', '{n} indispensables à faire');
  const more = journey.proposed ? ` · ${tn(journey.proposed, '{n} amélioration proposée', '{n} améliorations proposées')}` : '';
  return `${settled} · ${state}${more}`;
}

// ---------------------------------------------------------------------------
// Parcours retenus : <données>\parcours.json

export interface JourneyRecord {
  title: string;
  steps: JourneyStepId[];
  startedAt: string;
  updatedAt: string;
  /** Position au dernier passage, pour la reprendre sans recalculer (« étape 3 sur 5 »). */
  position?: string;
  ready?: boolean;
}

export interface JourneyMemory {
  /** Par fichier .vpx, en minuscules. */
  tables: Record<string, JourneyRecord>;
}

export function journeysFile(dataDir: string): string {
  return path.join(dataDir, 'parcours.json');
}

export function loadJourneys(dataDir: string): JourneyMemory {
  try {
    const raw = JSON.parse(fs.readFileSync(journeysFile(dataDir), 'utf8').replace(/^﻿/, '')) as { tables?: unknown };
    const tables: Record<string, JourneyRecord> = {};
    if (raw.tables && typeof raw.tables === 'object') {
      for (const [file, r] of Object.entries(raw.tables as Record<string, JourneyRecord>)) {
        if (r && Array.isArray(r.steps) && typeof r.title === 'string') tables[file] = { ...r, steps: r.steps.filter((s) => JOURNEY_STEPS.includes(s)) };
      }
    }
    return { tables };
  } catch {
    return { tables: {} };
  }
}

export function saveJourneys(dataDir: string, memory: JourneyMemory): void {
  const file = journeysFile(dataDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(memory, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function journeyRecord(memory: JourneyMemory, file: string): JourneyRecord | undefined {
  return memory.tables[file.toLowerCase()];
}

/** Retient les étapes montrées et la position ; les étapes déjà retenues le restent. */
export function rememberJourney(memory: JourneyMemory, file: string, title: string, journey: Journey, now = new Date()): JourneyRecord {
  const key = file.toLowerCase();
  const previous = memory.tables[key];
  const steps = JOURNEY_STEPS.filter((id) => previous?.steps.includes(id) || [...journey.steps, ...journey.extras].some((s) => s.id === id));
  const record: JourneyRecord = { title, steps, startedAt: previous?.startedAt ?? now.toISOString(), updatedAt: now.toISOString(), position: journeyPosition(journey), ready: journey.ready };
  memory.tables[key] = record;
  return record;
}

/** Parcours terminé (partie lancée depuis le parcours) ou table supprimée. */
export function forgetJourney(memory: JourneyMemory, file: string): boolean {
  const key = file.toLowerCase();
  if (!memory.tables[key]) return false;
  delete memory.tables[key];
  return true;
}
