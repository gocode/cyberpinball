// Écran « Réglages » : les réglages de VPX modifiables depuis l'interface, sans
// ouvrir VPX ni un fichier .ini. La liste vient du schéma de la version
// installée (packages/installer/vpx-settings), les écritures passent par
// IniDocument (le reste du fichier intact) et writeWithBackup.
//
// openSettings({ scope: 'global' })            VPinballX.ini, pour toutes les tables ;
// openSettings({ scope: 'table', table })      .ini de surcharge rangé à côté du .vpx.
//
// Une fenêtre plein écran sur le playfield, pilotée aux boutons (flippers pour
// se déplacer et changer une valeur, Start pour éditer ou valider, Exit pour
// revenir) ou à la souris et au clavier.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app, ipcMain, type BrowserWindow, type Input, type Rectangle } from 'electron';
import {
  applySetting,
  describeMapping,
  navigationKeys,
  vpxActionLabel,
  withoutButtonKeys,
  edgeRotation,
  findTableIni,
  IniDocument,
  isEditorSection,
  isLiveVisual,
  isOwned,
  isTableOnly,
  loadOwnedMemory,
  numericChoices,
  playfieldRotation,
  readTextIfExists,
  sameValue,
  settingId,
  settingState,
  formatNumber,
  language,
  t,
  tn,
  VPX_AUDIO_OWNED_KEYS,
  VPX_ESSENTIALS,
  VPX_PLAY_SETTINGS,
  vpxOwnedKeys,
  loadCabinet,
  writeWithBackup,
  type Cabinet,
  type CabinetButtons,
  type EssentialSetting,
  type FlipperEdge,
  type RoleId,
  type ObservedDisplay,
  type Rotation,
  type SettingState,
  type SettingValue,
  type TableEntry,
  type VpxSettingDef,
  type VpxSettingsSchema,
} from '@cyberpinball/core';
import { loadManifest, loadVpxSettingsSchema } from '@cyberpinball/installer';
import { backupDir, locations, vpxInstall, vpxProfile } from './paths';
import { activeVpxIni } from './vpx-ini';
import { describeReset, resetButtons } from './buttons-reset';
import { coverDisplay } from './cover-display';
import { createWindow, primaryRect } from './offscreen';
import { LayoutReport } from './layout-check';
import { relaunchCovered } from './screen-guard';

export type SettingsTarget = { scope: 'global' } | { scope: 'table'; table: TableEntry };

export interface OpenSettingsOptions {
  /** Zone de l'écran à couvrir (DIP) ; par défaut l'écran principal. */
  bounds?: Rectangle;
  /** Appelé à la fermeture, par exemple pour rendre le focus au menu. */
  onClose?: () => void;
  /** Rotation horaire de la mise en page, pour un joueur placé au bord des flippers. */
  rotation?: Rotation;
}

const FLIPPER_EDGES: FlipperEdge[] = ['bottom', 'left', 'top', 'right'];

/**
 * Bord des flippers forcé par CYBERPINBALL_FLIPPERS (bottom, left, top, right),
 * pour tester la rotation sans modifier cabinet.json.
 */
export function forcedRotation(): Rotation | undefined {
  const edge = process.env.CYBERPINBALL_FLIPPERS?.trim().toLowerCase();
  if (!edge) return undefined;
  if (FLIPPER_EDGES.includes(edge as FlipperEdge)) return edgeRotation(edge as FlipperEdge);
  console.log(`CYBERPINBALL_FLIPPERS : « ${edge} » ignoré (attendu : ${FLIPPER_EDGES.join(', ')}).`);
  return undefined;
}

/**
 * Rotation des fenêtres affichées sur le playfield : celle du modèle de borne,
 * ramenée à l'orientation actuelle de l'écran (`playfield`, tel que Windows le
 * décrit, si retrouvé), sauf bord forcé.
 */
export function menuRotation(cabinet: Cabinet | undefined, playfield: ObservedDisplay | undefined): Rotation {
  return forcedRotation() ?? playfieldRotation(cabinet, playfield);
}

/**
 * Touches de l'écran : flippers, Start et Exit de la borne (étape « Boutons » de
 * l'assistant, sinon touches par défaut des encodeurs), plus celles d'un clavier,
 * tant qu'aucun bouton ne les envoie.
 */
function settingsKeys(buttons: CabinetButtons | undefined) {
  return {
    ...navigationKeys(buttons),
    pageUp: withoutButtonKeys(['PageUp'], buttons),
    pageDown: withoutButtonKeys(['PageDown'], buttons),
    tab: withoutButtonKeys(['Tab'], buttons),
    reset: withoutButtonKeys(['Delete'], buttons),
  };
}
let KEYS = settingsKeys(undefined);

type Tab = 'essentials' | 'advanced';

/** Liste « Surcharges de cette table » dans l'onglet Avancé. */
const OVERRIDES = '\u0000overrides';

interface Choice {
  label: string;
  /** undefined : revenir à la valeur par défaut (ou à la valeur générale pour une table). */
  value: SettingValue | undefined;
  note?: string;
}

type Panel =
  | { kind: 'choices'; id: string; choices: Choice[]; index: number }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'info'; id?: string; title: string; lines: string[]; actions: { label: string; run: () => void }[]; index: number };

type Row =
  | { kind: 'group'; title: string }
  | { kind: 'setting'; def: VpxSettingDef; essential?: EssentialSetting }
  | { kind: 'section'; name: string }
  | { kind: 'overrides' }
  | { kind: 'extra'; section: string; key: string; value: string };

interface Session {
  target: SettingsTarget;
  win: BrowserWindow;
  schema: VpxSettingsSchema;
  defs: Map<string, VpxSettingDef>;
  essentials: Map<string, EssentialSetting>;
  owned: Set<string>;
  globalIni: IniDocument;
  tableIni?: IniDocument;
  table?: TableIniLocation;
  tab: Tab;
  /** Section ouverte dans l'onglet Avancé. */
  section?: string;
  /** -1 : barre des onglets ; sinon indice dans rows(). */
  cursor: number;
  /** Position dans la liste des sections, pour y revenir. */
  sectionCursor: number;
  panel?: Panel;
  notice?: { text: string; tone: 'ok' | 'error' };
  onClose?: () => void;
  closed: Promise<void>;
}

const loc = locations();
let session: Session | undefined;

/**
 * Clés écrites par Cyber Pinball ; les clés audio seulement une fois l'étape « Son » de
 * l'assistant faite, les priorités des plugins pour les fenêtres affectées, et celles de
 * [Plugin.DMDUtil] quand la dernière synchronisation a trouvé un DMD réel.
 */
function ownedKeys(): Set<string> {
  const cabinet = loadCabinet(loc.dataDir);
  const dmd = 'Plugin.DMDUtil.';
  const dmdKeys = Object.keys(loadOwnedMemory(loc.dataDir, activeVpxIni(loc)) ?? {})
    .filter((id) => id.startsWith(dmd))
    .map((id) => id.slice(dmd.length));
  const input = 'Input.';
  const inputKeys = Object.keys(loadOwnedMemory(loc.dataDir, activeVpxIni(loc)) ?? {})
    .filter((id) => id.startsWith(input))
    .map((id) => id.slice(input.length));
  const roles = cabinet ? (Object.keys(cabinet.roles) as RoleId[]) : undefined;
  return vpxOwnedKeys(vpxProfile(loc).profile, cabinet?.vpxManual, Boolean(cabinet?.audio), { roles, dmdKeys, inputKeys });
}
let ipcReady = false;
/** États calculés depuis la dernière lecture des fichiers (un affichage en demande des milliers). */
const states = new Map<VpxSettingDef, SettingState>();

export function isSettingsOpen(): boolean {
  return session !== undefined;
}

/**
 * Ouvre l'écran de réglages ; la promesse se résout à sa fermeture.
 * Point d'entrée pour le menu (réglages généraux) et pour la fiche d'une table.
 */
export function openSettings(target: SettingsTarget, options: OpenSettingsOptions = {}): Promise<void> {
  if (session) {
    session.win.focus();
    return session.closed;
  }
  registerIpc();
  KEYS = settingsKeys(loadCabinet(loc.dataDir)?.buttons);
  const schema = currentSchema();
  const win = createWindow({
    title: t('Cyber Pinball — Réglages'),
    frame: false,
    show: false,
    backgroundColor: '#030807',
    webPreferences: { preload: path.join(__dirname, 'settings-preload.js'), contextIsolation: true, sandbox: true },
  });
  coverDisplay(win, options.bounds ?? primaryRect());
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && handleKey(input)) event.preventDefault();
  });

  let resolveClosed!: () => void;
  const s: Session = {
    target,
    win,
    schema: schema ?? { vpx: '?', sourceCommit: '', source: '', count: 0, settings: [] },
    defs: new Map(),
    essentials: new Map(),
    owned: ownedKeys(),
    globalIni: IniDocument.parse(''),
    tab: 'essentials',
    cursor: 0,
    sectionCursor: 0,
    onClose: options.onClose,
    closed: new Promise((resolve) => (resolveClosed = resolve)),
  };
  for (const def of s.schema.settings) s.defs.set(settingId(def.section, def.key), def);
  for (const group of VPX_ESSENTIALS) for (const e of group.settings) s.essentials.set(settingId(e.section, e.key), e);
  if (target.scope === 'table') s.table = tableIniLocation(target.table);
  session = s;
  reload();
  s.cursor = firstSelectable(rows(), 0, 1);
  if (!schema) s.notice = { text: t('Aucun schéma de réglages pour cette version de VPX : lancez « npm run vpx-schema ».'), tone: 'error' };

  win.on('closed', () => {
    if (session === s) session = undefined;
    s.onClose?.();
    resolveClosed();
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'settings.html'), { query: { rotation: String(options.rotation ?? 0) } });
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  return s.closed;
}

/** Schéma de la version de VPX installée, sinon de celle que Cyber Pinball installerait. */
export function currentSchema(): VpxSettingsSchema | undefined {
  const version = vpxInstall(loc)?.version ?? loadManifest().find((c) => c.id === 'vpx')?.version;
  return version ? loadVpxSettingsSchema(version) : undefined;
}

export interface TableIniLocation {
  /** Fichier lu : la copie du bac à sable si elle existe, sinon celui que VPX lit. */
  file: string;
  /** Fichier que VPX lit (à côté du .vpx). */
  vpxPath: string;
  /** Fichier écrit. */
  writePath: string;
  exists: boolean;
}

/**
 * Où lire et écrire le .ini de la table. En bac à sable (CYBERPINBALL_HOME), on
 * n'écrit jamais à côté du vrai .vpx : une copie est rangée dans le bac à sable,
 * et l'original n'est que lu tant que la copie n'existe pas.
 */
export function tableIniLocation(table: TableEntry): TableIniLocation {
  const found = findTableIni(table.file);
  if (!loc.sandbox) return { file: found.path, vpxPath: found.path, writePath: found.path, exists: found.exists };
  const copy = path.join(loc.dataDir, 'sandbox', 'tables', path.dirname(table.id), path.basename(found.path));
  if (fs.existsSync(copy)) return { file: copy, vpxPath: found.path, writePath: copy, exists: true };
  return { file: found.path, vpxPath: found.path, writePath: copy, exists: found.exists };
}

function reload(): void {
  const s = session!;
  states.clear();
  s.globalIni = IniDocument.parse(readTextIfExists(activeVpxIni(loc)));
  if (s.table) {
    s.table = s.target.scope === 'table' ? tableIniLocation(s.target.table) : s.table;
    s.tableIni = IniDocument.parse(readTextIfExists(s.table!.file));
  }
}

function close(): void {
  session?.win.close();
}

// ---------------------------------------------------------------------------
// Lignes affichées

function rows(): Row[] {
  const s = session!;
  if (s.tab === 'essentials') {
    return VPX_ESSENTIALS.flatMap((group) => {
      const settings = group.settings.flatMap((e) => {
        const def = s.defs.get(settingId(e.section, e.key));
        // Pour une table, les réglages visuels se font en partie (isLiveVisual) : pas ici.
        if (def && s.target.scope === 'table' && isLiveVisual(def)) return [];
        return def ? [{ kind: 'setting' as const, def, essential: e }] : [];
      });
      return settings.length ? [{ kind: 'group' as const, title: group.title }, ...settings] : [];
    });
  }
  if (s.section === OVERRIDES) {
    return s.schema.settings.filter((def) => stateOf(def).table !== undefined).map((def) => ({ kind: 'setting' as const, def }));
  }
  if (s.section !== undefined) {
    const defs = s.schema.settings.filter((d) => d.section === s.section).map((def) => ({ kind: 'setting' as const, def }));
    const extras = extraEntries().filter((e) => e.section === s.section).map((e) => ({ kind: 'extra' as const, ...e }));
    return [...defs, ...extras];
  }
  const list: Row[] = sections().map((name) => ({ kind: 'section' as const, name }));
  if (s.tableIni && overrideCount() > 0) list.unshift({ kind: 'overrides' });
  return list;
}

function sections(): string[] {
  const names = [...new Set(session!.schema.settings.map((d) => d.section))];
  for (const e of extraEntries()) if (!names.includes(e.section)) names.push(e.section);
  return names;
}

/** Clés présentes dans les fichiers mais absentes du schéma : réglages enregistrés par les plugins ou les tables. */
function extraEntries(): { section: string; key: string; value: string }[] {
  const s = session!;
  const doc = s.tableIni ?? s.globalIni;
  const known = new Set([...s.defs.keys()].map((k) => k.toLowerCase()));
  return doc.entries().filter((e) => !known.has(settingId(e.section, e.key).toLowerCase()));
}

function overrideCount(section?: string): number {
  const s = session!;
  return s.schema.settings.filter((d) => (section === undefined || d.section === section) && stateOf(d).table !== undefined).length;
}

function modifiedCount(section: string): number {
  return session!.schema.settings.filter((d) => d.section === section && isModified(stateOf(d))).length;
}

function stateOf(def: VpxSettingDef): SettingState {
  const s = session!;
  let state = states.get(def);
  if (!state) states.set(def, (state = settingState(def, s.globalIni, s.tableIni)));
  return state;
}

function isModified(state: SettingState): boolean {
  return state.global !== undefined && !sameValue(state.def, state.global, state.def.default);
}

const selectable = (row: Row | undefined) => row !== undefined && row.kind !== 'group';

function firstSelectable(list: Row[], from: number, direction: 1 | -1): number {
  for (let i = from; i >= 0 && i < list.length; i += direction) if (selectable(list[i])) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Ce qu'on peut faire d'un réglage

type Lock = 'owned' | 'tableOnly' | 'editor' | 'live' | undefined;

function lockOf(def: VpxSettingDef): Lock {
  const s = session!;
  // Pour une table, un réglage visuel se fait en partie, même si Cyber Pinball le gère pour toutes.
  if (s.target.scope === 'table' && isLiveVisual(def)) return 'live';
  if (isOwned(s.owned, def.section, def.key)) return 'owned';
  if (s.target.scope === 'global' && isTableOnly(def)) return 'tableOnly';
  if (s.target.scope === 'table' && isEditorSection(def.section)) return 'editor';
  return undefined;
}

function openRow(row: Row): void {
  const s = session!;
  if (row.kind === 'section') {
    s.sectionCursor = s.cursor;
    s.section = row.name;
    s.cursor = firstSelectable(rows(), 0, 1);
    return;
  }
  if (row.kind === 'overrides') {
    s.sectionCursor = s.cursor;
    s.section = OVERRIDES;
    s.cursor = firstSelectable(rows(), 0, 1);
    return;
  }
  if (row.kind === 'extra') {
    const mapping = inputMapping(row);
    s.panel = mapping
      ? info(
          t('{name} : {value}', { name: mapping.label, value: mapping.keys }),
          [`[${row.section}] ${row.key} = ${row.value === '' ? t('(vide : touche par défaut de VPX)') : row.value}`, mapping.why],
          [
            { label: t('Affecter les boutons de la borne'), run: () => relaunchWizard(true) },
            { label: t('Remettre les touches par défaut des encodeurs'), run: () => resetButtonsHere() },
          ],
        )
      : info(`[${row.section}] ${row.key}`, [
          t('Valeur : {value}', { value: row.value === '' ? t('(vide)') : row.value }),
          t('Ce réglage a été enregistré par un plugin ou par une table ; le schéma de VPX ne le décrit pas, il n’est donc pas modifiable ici.'),
        ]);
    return;
  }
  if (row.kind !== 'setting') return;
  const def = row.def;
  const id = settingId(def.section, def.key);
  const state = stateOf(def);
  const lock = lockOf(def);
  if (lock === 'owned') {
    const origin = ownedOrigin(def);
    const actions = origin.wizard ? [{ label: wizardLabel(origin.wizard), run: relaunchWizard }] : [];
    if (state.table !== undefined) actions.unshift({ label: t('Retirer la surcharge de cette table'), run: () => save(def, undefined) });
    const overridden =
      origin.wizard === 'screens'
        ? t('Attention : cette table le surcharge, ce qui peut envoyer VPX sur le mauvais écran.')
        : t('Attention : cette table le surcharge.');
    s.panel = info(
      label(row),
      [
        t('Réglage géré par Cyber Pinball : {why}', { why: afterColon(origin.why) }),
        ...(state.table !== undefined ? [overridden] : []),
        origin.how,
      ],
      actions,
      id,
    );
    return;
  }
  if (lock === 'tableOnly') {
    s.panel = info(label(row), [t('Ce réglage se règle table par table : ouvrez la fiche d’une table, puis ses réglages.')], [], id);
    return;
  }
  if (lock === 'editor') {
    s.panel = info(label(row), [t('Réglage de l’éditeur de tables de VPX : une valeur propre à une table n’aurait aucun effet pendant une partie.')], [], id);
    return;
  }
  if (lock === 'live') {
    s.panel = info(
      label(row),
      [
        t('Réglage visuel : il se juge sur la table lancée. Fiche de la table > « Régler l’affichage en partie » (ou, pendant une partie, les deux MagnaSave ensemble), puis enregistrer pour cette table.'),
        ...(state.table !== undefined ? [t('Cette table a sa propre valeur ; la retirer lui rend le réglage général.')] : []),
      ],
      state.table !== undefined ? [{ label: t('Retirer la valeur de cette table'), run: () => save(def, undefined) }] : [],
      id,
    );
    return;
  }
  if (def.type === 'string' || def.color) {
    const current = state.effective;
    s.panel = { kind: 'text', id, text: current === undefined ? '' : def.color ? hex(Number(current)) : String(current) };
    return;
  }
  const choices = choicesFor(def, state, row.kind === 'setting' ? row.essential : undefined);
  const explicit = s.target.scope === 'table' ? state.table : state.global;
  const index = explicit === undefined ? 0 : Math.max(0, choices.findIndex((c, i) => i > 0 && sameValue(def, c.value, explicit)));
  s.panel = { kind: 'choices', id, choices, index };
}

function choicesFor(def: VpxSettingDef, state: SettingState, essential?: EssentialSetting): Choice[] {
  const s = session!;
  const fallback =
    s.target.scope === 'table'
      ? isTableOnly(def)
        ? { label: t('Valeur prévue par la table'), note: t('retire la surcharge') }
        : { label: t('Comme le réglage général : {value}', { value: format(def, state.global ?? def.default, essential) }), note: t('retire la surcharge') }
      : { label: t('Valeur par défaut : {value}', { value: format(def, def.default, essential) }), note: t('laisse VPX décider') };
  const first: Choice = { label: fallback.label, value: undefined, note: fallback.note };
  let values: SettingValue[];
  if (def.type === 'bool') values = [false, true];
  else if (def.type === 'enum') values = def.values!.map((_, i) => def.min! + i);
  else values = numericChoices(def, typeof state.effective === 'number' ? state.effective : undefined);
  return [
    first,
    ...values.map((v) => ({
      label: format(def, v, essential),
      value: v,
      note: sameValue(def, v, def.default) ? t('défaut de VPX') : undefined,
    })),
  ];
}

function info(title: string, lines: string[], actions: { label: string; run: () => void }[] = [], id?: string): Panel {
  // « Retour » est présélectionné : un Start par mégarde ne déclenche rien.
  return { kind: 'info', id, title, lines, actions: [...actions, { label: t('Retour'), run: () => undefined }], index: actions.length };
}

function save(def: VpxSettingDef, value: SettingValue | undefined): void {
  const s = session!;
  try {
    let changed: boolean;
    if (s.target.scope === 'table') {
      const doc = IniDocument.parse(readTextIfExists(s.table!.file));
      changed = applySetting(doc, def, value, 'table', s.globalIni);
      if (changed) writeTableIni(s.table!, doc);
    } else {
      const iniPath = activeVpxIni(loc);
      const doc = IniDocument.parse(readTextIfExists(iniPath));
      changed = applySetting(doc, def, value, 'global');
      if (changed) writeWithBackup(iniPath, doc.toString(), backupDir(loc.dataDir));
    }
    reload();
    const shown = s.essentials.get(settingId(def.section, def.key));
    const name = shown?.label ?? def.label ?? def.key;
    const now = stateOf(def);
    s.notice = {
      tone: 'ok',
      text: !changed
        ? t('{name} : déjà à cette valeur.', { name })
        : value === undefined
          ? s.target.scope === 'table'
            ? t('{name} : surcharge retirée.', { name })
            : t('{name} : valeur par défaut rétablie.', { name })
          : s.target.scope === 'table'
            ? t('{name} : {value}, enregistré pour cette table.', { name, value: format(def, now.effective ?? value, shown) })
            : t('{name} : {value}, enregistré dans VPinballX.ini.', { name, value: format(def, now.effective ?? value, shown) }),
    };
  } catch (err) {
    s.notice = { tone: 'error', text: t('Enregistrement impossible : {error}', { error: (err as Error).message }) };
  }
}

/**
 * Écrit le .ini de la table ; s'il ne contient plus rien, il est supprimé (comme VPX),
 * après sauvegarde.
 */
export function writeTableIni(location: TableIniLocation, doc: IniDocument): void {
  const target = location.writePath;
  const backups = path.join(backupDir(loc.dataDir), 'tables');
  if (doc.entries().length === 0) {
    if (fs.existsSync(target)) {
      writeWithBackup(target, '', backups);
      fs.rmSync(target);
    }
    return;
  }
  writeWithBackup(target, doc.toString(), backups);
}

/** Touches par défaut des encodeurs (cabinet.json et [Input]) ; l'écran suit aussitôt ces touches. */
function resetButtonsHere(): void {
  const s = session!;
  const reset = resetButtons();
  if (!reset) return;
  KEYS = settingsKeys(reset.cabinet.buttons);
  s.owned = ownedKeys();
  reload();
  s.notice = { tone: 'ok', text: t('Touches par défaut des encodeurs remises. {details}', { details: describeReset(reset).join(' ') }) };
}

/** Assistant complet, ou seulement l'étape « Boutons ». */
function relaunchWizard(buttonsOnly = false): void {
  if (process.env.CYBERPINBALL_AUTOPILOT) return;
  const args = process.argv.slice(1).filter((a) => a !== '--reglages' && !a.startsWith('--table='));
  relaunchCovered([...args, '--assistant', ...(buttonsOnly === true ? ['--boutons'] : [])]);
}

// ---------------------------------------------------------------------------
// Touches et souris

export function handleKey(input: Pick<Input, 'code' | 'control'>): boolean {
  const s = session;
  if (!s) return false;
  const is = (group: string[]) => group.includes(input.code);
  if (input.control && input.code === 'KeyQ') {
    app.quit();
    return true;
  }
  s.notice = undefined;

  const panel = s.panel;
  if (panel?.kind === 'text') {
    // La saisie va au champ de texte ; seules Entrée et Échap sont à nous.
    if (input.code === 'Enter' || input.code === 'NumpadEnter') submitText(panel.text);
    else if (is(KEYS.exit)) s.panel = undefined;
    else return false;
    broadcast();
    return true;
  }
  if (panel) {
    const count = panel.kind === 'choices' ? panel.choices.length : panel.actions.length;
    const move = (d: number) => (panel.index = Math.min(count - 1, Math.max(0, panel.index + d)));
    if (is(KEYS.previous)) move(-1);
    else if (is(KEYS.next)) move(1);
    else if (is(KEYS.pageUp)) move(-10);
    else if (is(KEYS.pageDown)) move(10);
    else if (is(KEYS.confirm)) choose(panel.index);
    else if (is(KEYS.exit)) s.panel = undefined;
    else return false;
    broadcast();
    return true;
  }

  const list = rows();
  if (is(KEYS.previous)) s.cursor = s.cursor <= 0 ? -1 : Math.max(-1, firstSelectable(list, s.cursor - 1, -1));
  else if (is(KEYS.next)) s.cursor = firstSelectable(list, s.cursor + 1, 1) === -1 ? s.cursor : firstSelectable(list, s.cursor + 1, 1);
  else if (is(KEYS.pageUp)) s.cursor = Math.max(firstSelectable(list, 0, 1), firstSelectable(list, Math.max(0, s.cursor - 10), 1));
  else if (is(KEYS.pageDown)) s.cursor = firstSelectable(list, Math.min(list.length - 1, s.cursor + 10), -1);
  else if (is(KEYS.tab)) switchTab(s.tab === 'essentials' ? 'advanced' : 'essentials');
  else if (is(KEYS.reset)) resetSelected(list);
  else if (is(KEYS.confirm)) {
    if (s.cursor === -1) switchTab(s.tab === 'essentials' ? 'advanced' : 'essentials');
    else if (list[s.cursor]) openRow(list[s.cursor]!);
  } else if (is(KEYS.exit)) back();
  else return false;
  broadcast();
  return true;
}

function back(): void {
  const s = session!;
  if (s.tab === 'advanced' && s.section !== undefined) {
    s.section = undefined;
    s.cursor = s.sectionCursor;
  } else {
    close();
  }
}

function switchTab(tab: Tab): void {
  const s = session!;
  s.tab = tab;
  s.section = undefined;
  s.cursor = -1;
}

function resetSelected(list: Row[]): void {
  const row = list[session!.cursor];
  if (row?.kind === 'setting' && !lockOf(row.def)) save(row.def, undefined);
}

function choose(index: number): void {
  const s = session!;
  const panel = s.panel;
  if (!panel || panel.kind === 'text') return;
  s.panel = undefined;
  if (panel.kind === 'info') {
    panel.actions[index]?.run();
    return;
  }
  const def = s.defs.get(panel.id)!;
  save(def, panel.choices[index]!.value);
}

function submitText(text: string): void {
  const s = session!;
  const panel = s.panel;
  if (panel?.kind !== 'text') return;
  const def = s.defs.get(panel.id)!;
  const trimmed = text.trim();
  if (trimmed === '') {
    s.panel = undefined;
    save(def, undefined);
    return;
  }
  if (def.color) {
    const m = /^#?([0-9a-f]{6})$/i.exec(trimmed);
    if (!m) {
      s.notice = { tone: 'error', text: t('Couleur attendue au format RRVVBB, par exemple FF8A1F.') };
      return;
    }
    s.panel = undefined;
    // VPX range ses couleurs en 0xBBGGRR (macro RGB de Windows).
    const rgb = parseInt(m[1]!, 16);
    save(def, ((rgb & 0xff) << 16) | (rgb & 0xff00) | (rgb >> 16));
    return;
  }
  s.panel = undefined;
  save(def, text);
}

type Action =
  | { type: 'row'; index: number }
  | { type: 'tab'; tab: Tab }
  | { type: 'choice'; index: number }
  | { type: 'text'; text: string; submit?: boolean }
  | { type: 'wheel'; delta: number }
  | { type: 'reset' }
  | { type: 'back' }
  | { type: 'cancel' };

function handleAction(action: Action): void {
  const s = session;
  if (!s) return;
  s.notice = undefined;
  switch (action.type) {
    case 'row': {
      const list = rows();
      if (!selectable(list[action.index])) return;
      s.cursor = action.index;
      openRow(list[action.index]!);
      break;
    }
    case 'tab':
      switchTab(action.tab);
      break;
    case 'choice':
      choose(action.index);
      break;
    case 'text':
      if (s.panel?.kind === 'text') s.panel.text = action.text;
      if (action.submit) submitText(action.text);
      else return; // pas de nouvel affichage pendant la frappe
      break;
    case 'wheel':
      handleKey({ code: action.delta < 0 ? 'ArrowUp' : 'ArrowDown', control: false });
      return;
    case 'reset':
      if (s.panel && s.panel.kind !== 'info' && s.panel.id) {
        const def = s.defs.get(s.panel.id)!;
        s.panel = undefined;
        save(def, undefined);
      } else resetSelected(rows());
      break;
    case 'back':
      back();
      break;
    case 'cancel':
      s.panel = undefined;
      break;
  }
  broadcast();
}

function registerIpc(): void {
  if (ipcReady) return;
  ipcReady = true;
  ipcMain.on('settings:ready', (event) => {
    if (session && event.sender === session.win.webContents) broadcast();
  });
  ipcMain.on('settings:act', (event, action: Action) => {
    if (session && event.sender === session.win.webContents) handleAction(action);
  });
}

// ---------------------------------------------------------------------------
// Affichage

function hex(bgr: number): string {
  // 0xBBGGRR -> RRGGBB
  const rgb = ((bgr & 0xff) << 16) | (bgr & 0xff00) | ((bgr >> 16) & 0xff);
  return rgb.toString(16).toUpperCase().padStart(6, '0');
}

function format(def: VpxSettingDef, value: SettingValue | undefined, essential?: EssentialSetting): string {
  if (value === undefined) return t('valeur prévue par la table');
  switch (def.type) {
    case 'bool':
      return essential?.values?.[value ? 1 : 0] ?? (value ? t('Activé') : t('Désactivé'));
    case 'enum': {
      const i = Number(value) - def.min!;
      return essential?.values?.[i] ?? def.values![i] ?? String(value);
    }
    case 'string':
      return value === '' ? t('(vide)') : String(value);
    default: {
      if (def.color) return `#${hex(Number(value))}`;
      // Locale de l'interface, lue à l'affichage (et non au chargement du module).
      const shown = formatNumber(Number(value) * (essential?.scale ?? 1), { maximumFractionDigits: 3 });
      if (!essential?.unit) return shown;
      // Espace fine insécable avant l'unité en français ; collés en anglais pour % et ° (5%, 45°).
      const gap = language() === 'en' && (essential.unit === '%' || essential.unit === '°') ? '' : ' ';
      return `${shown}${gap}${essential.unit}`;
    }
  }
}

function label(row: Row): string {
  if (row.kind !== 'setting') return '';
  return row.essential?.label ?? (row.def.label || row.def.key);
}

interface Badge {
  text: string;
  tone: 'owned' | 'table' | 'modified' | 'locked' | 'warning';
}

function badgesOf(def: VpxSettingDef, state: SettingState): Badge[] {
  const badges: Badge[] = [];
  const lock = lockOf(def);
  if (lock === 'owned') badges.push({ text: t('Gérée par Cyber Pinball'), tone: 'owned' });
  if (lock === 'tableOnly') badges.push({ text: t('Par table'), tone: 'locked' });
  if (lock === 'editor') badges.push({ text: t('Éditeur seulement'), tone: 'locked' });
  if (lock === 'live') badges.push({ text: t('En partie'), tone: 'locked' });
  if (state.table !== undefined) badges.push({ text: t('Surchargé pour cette table'), tone: lock === 'owned' ? 'warning' : 'table' });
  else if (isModified(state) && lock !== 'owned') badges.push({ text: t('Modifié'), tone: 'modified' });
  if (state.invalid) badges.push({ text: t('Valeur illisible, ignorée par VPX'), tone: 'warning' });
  return badges;
}

/** Assistant proposé pour changer une clé gérée : celui des écrans, ou l'assistant complet (étape Son). */
type WizardKind = 'screens' | 'full';

function wizardLabel(kind: WizardKind): string {
  return kind === 'screens' ? t('Ouvrir l’assistant d’écrans') : t('Ouvrir l’assistant');
}

function keepYours(): string {
  return t('Pour imposer une autre valeur, modifiez VPinballX.ini : au démarrage suivant, Cyber Pinball vous proposera de garder la vôtre.');
}

/**
 * [Input] Mapping.<action> : touche d'une action de VPX. VPX les déclare à
 * l'exécution, elles ne sont donc pas dans le schéma ; Cyber Pinball écrit celles
 * des boutons de la borne (étape « Boutons » de l'assistant).
 */
function inputMapping(row: { section: string; key: string; value: string }) {
  const m = /^Mapping\.([A-Za-z0-9]+)$/.exec(row.key); // pas Mapping.Nudge0.Type : capteurs
  if (row.section.toLowerCase() !== 'input' || !m) return undefined;
  const action = m[1]!;
  const owned = isOwned(session!.owned, row.section, row.key);
  return {
    label: vpxActionLabel(action),
    keys: describeMapping(row.value, action),
    owned,
    why: owned
      ? t('Touche gérée par Cyber Pinball : elle découle des boutons de la borne. Pour la changer, refaites l’étape « Boutons » de l’assistant ; une touche ajoutée dans VPX pour une manette est gardée.')
      : t('Touche de VPX, que Cyber Pinball ne gère pas. Elle se change dans le menu de VPX (F12, puis « Input Settings »).'),
  };
}

/** Phrase qui suit « : » : première lettre en minuscule, sauf nom propre en tête (« Cyber Pinball active… », « VPX… »). */
function afterColon(text: string): string {
  if (/^(Cyber Pinball|[A-Z0-9]{2,})\b/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** D'où vient la valeur d'une clé gérée, et comment la changer. */
function ownedOrigin(def: VpxSettingDef): { why: string; how: string; wizard?: WizardKind } {
  if (def.section === 'Plugin.DMDUtil') {
    return {
      why: t('Elle suit le DMD réel reconnu à son identifiant USB (ZeDMD, PIN2DMD, Pixelcade).'),
      how: t('Elle change quand on branche le DMD. {keep}', { keep: keepYours() }),
    };
  }
  if (def.key.startsWith('Priority.')) {
    return { why: t('Elle choisit le plugin qui dessine sur cette fenêtre : un pack PuP d’abord, puis le .directb2s, puis ScoreView.'), how: keepYours() };
  }
  if (def.section.startsWith('Plugin.') && def.key === 'Enable') {
    return { why: t('Cyber Pinball active les plugins dont la borne a besoin et éteint ceux qui les gênent (B2SLegacy tant que B2S est actif).'), how: keepYours() };
  }
  if (VPX_PLAY_SETTINGS.some((s) => s.section === def.section && s.key === def.key)) {
    return {
      why:
        def.key === 'SecurityLevel'
          ? t('Au-dessus de 0, VPX demande la permission (Oui / Non) pour chaque objet ActiveX que crée le script de la table : une question bloquante en plein chargement.')
          : t('Avec la VR forcée, VPX demande de reconnecter le casque (Oui / Non) ; une borne n’en a pas.'),
      how: keepYours(),
    };
  }
  if (def.section === 'Player' && VPX_AUDIO_OWNED_KEYS.includes(def.key)) {
    return { why: t('Elle découle de l’affectation des sorties audio de la borne.'), how: t('Pour la changer, relancez l’assistant (étape Son).'), wizard: 'full' };
  }
  return { why: t('Elle découle de l’affectation des écrans de la borne.'), how: t('Pour la changer, relancez l’assistant d’écrans.'), wizard: 'screens' };
}

function rowView(row: Row) {
  const s = session!;
  switch (row.kind) {
    case 'group':
      return { kind: 'group', label: row.title };
    case 'section': {
      const count = s.schema.settings.filter((d) => d.section === row.name).length;
      const extras = extraEntries().filter((e) => e.section === row.name).length;
      const changed = s.tableIni ? overrideCount(row.name) : modifiedCount(row.name);
      return {
        kind: 'section',
        label: row.name,
        value: tn(count + extras, '{n} réglage', '{n} réglages'),
        badges: changed
          ? [{ text: s.tableIni ? tn(changed, '{n} surchargé', '{n} surchargés') : tn(changed, '{n} modifié', '{n} modifiés'), tone: s.tableIni ? 'table' : 'modified' }]
          : [],
      };
    }
    case 'overrides':
      return {
        kind: 'section',
        label: t('Surcharges de cette table'),
        value: tn(overrideCount(), '{n} réglage', '{n} réglages'),
        badges: [{ text: t('Cette table'), tone: 'table' }],
      };
    case 'extra': {
      const mapping = inputMapping(row);
      if (mapping) {
        const badge: Badge = mapping.owned ? { text: t('Gérée par Cyber Pinball'), tone: 'owned' } : { text: t('Lecture seule'), tone: 'locked' };
        return { kind: 'setting', label: mapping.label, sub: row.key, value: mapping.keys, badges: [badge] };
      }
      return {
        kind: 'setting',
        label: row.key,
        sub: t('Hors schéma (plugin ou table)'),
        value: row.value === '' ? t('(vide)') : row.value,
        badges: [{ text: t('Lecture seule'), tone: 'locked' }],
      };
    }
    case 'setting': {
      const state = stateOf(row.def);
      return {
        kind: 'setting',
        label: label(row),
        sub: row.essential ? undefined : row.def.key,
        value: format(row.def, state.effective, row.essential),
        badges: badgesOf(row.def, state),
      };
    }
  }
}

function detailView(row: Row | undefined) {
  const s = session!;
  if (!row) return undefined;
  if (row.kind === 'section' || row.kind === 'overrides') {
    const name = row.kind === 'section' ? row.name : t('Surcharges de cette table');
    return {
      title: name,
      lines: [row.kind === 'overrides' ? t('Réglages que cette table remplace par sa propre valeur.') : t('Réglages de la section [{name}] du fichier.', { name })],
    };
  }
  if (row.kind === 'extra') {
    const mapping = inputMapping(row);
    if (mapping) return { title: mapping.label, lines: [t('{name} : {value}', { name: `[${row.section}] ${row.key}`, value: mapping.keys }), mapping.why] };
    return { title: row.key, lines: [`[${row.section}] ${row.key}`, t('Réglage enregistré par un plugin ou une table, absent du schéma de VPX.')] };
  }
  if (row.kind !== 'setting') return undefined;
  const def = row.def;
  const state = stateOf(def);
  const e = row.essential;
  const facts: [string, string][] = [[t('Valeur utilisée'), format(def, state.effective, e)]];
  if (s.target.scope === 'table') {
    facts.push([t('Pour cette table'), state.table !== undefined ? format(def, state.table, e) : t('non surchargé')]);
    facts.push([t('Réglage général'), format(def, state.global ?? (isTableOnly(def) ? undefined : def.default), e)]);
  }
  facts.push([t('Défaut de VPX'), isTableOnly(def) ? t('valeur prévue par la table') : format(def, def.default, e)]);
  if (def.min !== undefined && def.max !== undefined && def.type !== 'enum' && !def.color) {
    facts.push([t('Plage'), t('{min} à {max}', { min: format(def, def.min, e), max: format(def, def.max, e) })]);
  }
  facts.push([t('Clé'), `[${def.section}] ${def.key}`]);
  if (def.plugin && def.key !== 'Enable') facts.push([t('Déclaré par'), t('le plugin {plugin}, sans effet quand il est désactivé', { plugin: def.plugin })]);
  if (state.invalid) facts.push([t('Dans le fichier'), t('« {raw} » (illisible, ignoré)', { raw: state.invalid.raw })]);
  return {
    title: label(row),
    help: e?.help,
    // Libellé et description de VPX, en anglais : ils restent tels quels.
    original: e ? (def.description ? t('{name} : {value}', { name: def.label, value: def.description }) : def.label) : def.description,
    facts,
    owned: lockOf(def) === 'owned' ? `${ownedOrigin(def).why} ${ownedOrigin(def).how}` : undefined,
  };
}

function panelView(panel: Panel | undefined) {
  const s = session!;
  if (!panel) return undefined;
  if (panel.kind === 'info') return { kind: 'info', title: panel.title, lines: panel.lines, actions: panel.actions.map((a) => a.label), index: panel.index };
  const def = s.defs.get(panel.id)!;
  const e = s.essentials.get(panel.id);
  const title = s.tab === 'essentials' && e ? e.label : def.label || def.key;
  if (panel.kind === 'text') {
    return {
      kind: 'text',
      title,
      text: panel.text,
      hint: def.color
        ? t('Couleur au format RRVVBB. Entrée : enregistrer · Échap : annuler · vide : valeur par défaut.')
        : t('Entrée : enregistrer · Échap : annuler · vide : valeur par défaut.'),
    };
  }
  return { kind: 'choices', title, choices: panel.choices.map((c) => ({ label: c.label, note: c.note })), index: panel.index };
}

function view() {
  const s = session!;
  const list = rows();
  const scope = s.target.scope === 'table' ? t('Table : {title}', { title: s.target.table.title }) : t('Réglages généraux, pour toutes les tables');
  const file = s.target.scope === 'table' ? s.table!.vpxPath : activeVpxIni(loc);
  const fileNote =
    s.target.scope === 'table'
      ? s.table!.writePath !== s.table!.vpxPath
        ? t('Bac à sable : écrit dans {file}', { file: s.table!.writePath })
        : s.table!.exists
          ? undefined
          : t('Fichier créé au premier réglage.')
      : loc.sandbox
        ? t('Bac à sable')
        : undefined;
  return {
    title: t('Réglages de VPX'),
    scope,
    file,
    fileNote,
    vpx: s.schema.count ? `VPX ${s.schema.vpx}${s.schema.variant ? ` ${s.schema.variant}` : ''} · ${tn(s.schema.count, '{n} réglage', '{n} réglages')}` : '',
    tabs: [
      { id: 'essentials', label: t('Essentiels'), active: s.tab === 'essentials' },
      { id: 'advanced', label: t('Avancé'), active: s.tab === 'advanced' },
    ],
    tabsFocused: s.cursor === -1,
    breadcrumb: s.tab === 'advanced' && s.section !== undefined ? (s.section === OVERRIDES ? t('Surcharges de cette table') : s.section) : undefined,
    rows: list.map(rowView),
    cursor: s.cursor,
    detail: detailView(list[s.cursor]),
    panel: panelView(s.panel),
    notice: s.notice,
    hints: s.panel
      ? t('Flippers : choisir · Start : valider · Exit : annuler')
      : t('Flippers : se déplacer · Start : {start} · Exit : {exit} · Suppr : valeur par défaut · Tab : onglet', {
          start: s.cursor === -1 ? t('changer d’onglet') : t('modifier'),
          exit: s.tab === 'advanced' && s.section !== undefined ? t('retour aux sections') : t('fermer'),
        }),
  };
}

function broadcast(): void {
  const s = session;
  if (s && !s.win.isDestroyed()) s.win.webContents.send('settings:state', view());
}

// ---------------------------------------------------------------------------
// Mode autonome et test sans opérateur

/**
 * `electron app --reglages [--table=<morceau du nom>]` : l'écran de réglages seul,
 * sur l'écran principal. Avec CYBERPINBALL_AUTOPILOT (codes de touches séparés par
 * des virgules) et CYBERPINBALL_CAPTURE (dossier), rejoue les touches, capture
 * l'écran après chacune, puis quitte.
 */
export async function startSettingsAlone(tables: TableEntry[]): Promise<void> {
  const filter = process.argv.find((a) => a.startsWith('--table='))?.slice('--table='.length);
  const table = filter ? tables.find((t) => t.id.toLowerCase().includes(filter.toLowerCase())) : undefined;
  if (filter && !table) {
    console.log(`Aucune table ne correspond à « ${filter} ».`);
    app.quit();
    return;
  }
  // Seul, l'écran s'ouvre sur l'écran principal, qui n'est pas forcément le playfield :
  // il ne pivote que si le bord des flippers est forcé.
  const closed = openSettings(table ? { scope: 'table', table } : { scope: 'global' }, { rotation: forcedRotation() });
  const codes = process.env.CYBERPINBALL_AUTOPILOT;
  if (codes) await runAutopilot(codes.split(','), process.env.CYBERPINBALL_CAPTURE);
  else await closed;
  app.quit();
}

async function runAutopilot(codes: string[], captureDir: string | undefined): Promise<void> {
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const s = session!;
  await new Promise<void>((resolve) => s.win.once('ready-to-show', () => resolve()));
  await delay(600);
  if (captureDir) fs.mkdirSync(captureDir, { recursive: true });
  const layout = new LayoutReport(captureDir);
  for (const [step, code] of ['start', ...codes].entries()) {
    if (!session) break;
    if (step > 0) handleKey({ code, control: false });
    await delay(500);
    if (!session) continue;
    const name = `reglages-${String(step).padStart(2, '0')}-${code}`;
    await layout.check(session.win.webContents, name);
    if (captureDir) fs.writeFileSync(path.join(captureDir, `${name}.png`), (await session.win.webContents.capturePage()).toPNG());
  }
  layout.save();
  close();
}
