// Pré-réglages de qualité de VPX (packages/core/src/vpxquality.ts) : Menu système > Ma borne > VPX > Pré-réglages.
// Auto (sur choix explicite) choisit un mode d'après la machine, puis l'ajuste d'après le temps de rendu de la carte graphique
// relevé dans chaque partie ; Performance, Équilibré, Qualité et Ultra sont des modes fixes. Les réglages d'un mode
// sont écrits dans le VPinballX.ini de la configuration active avant chaque partie ; un réglage d'un mode changé à la
// main (Réglages de VPX) fait passer en « Personnalisé » : Cyber Pinball n'y touche plus, jusqu'au choix d'un mode.
// Pas dans le casque : la VR a son propre profil graphique (vr-profil.ts), et ne reçoit pas les valeurs d'un mode.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  adaptQuality,
  applyVpxSettings,
  findTableIni,
  IniDocument,
  initialQuality,
  machineKey,
  QUALITY_AUTO,
  QUALITY_KEYS,
  QUALITY_LEVELS,
  qualitySettings,
  qualityValuesEqual,
  readGpuFrames,
  readTextIfExists,
  readVpxCadence,
  readVpxTargetFps,
  t,
  writeFileAtomic,
  type QualityChoice,
  type QualityGame,
  type QualityLevel,
  type QualityMachine,
  type QualityState,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem } from './library';
import { loadTechFacts } from './tech-facts';

export function qualityStateFile(dataDir: string): string {
  return path.join(dataDir, 'qualite-vpx.json');
}

interface QualityConfigurations {
  active?: string;
  configurations: Record<string, QualityState>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isLevel = (value: unknown): value is QualityLevel => typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
const iniKey = (iniPath: string): string => path.resolve(iniPath).toLowerCase();

/** Un état incohérent est ignoré : jamais une référence douteuse pour écraser les réglages du joueur. */
function validatedState(raw: unknown): QualityState | undefined {
  if (!isRecord(raw) || !(raw.choice === 'auto' || raw.choice === 'custom' || isLevel(raw.choice))) return undefined;
  if (raw.level !== undefined && !isLevel(raw.level)) return undefined;
  if (raw.ceiling !== undefined && !isLevel(raw.ceiling)) return undefined;
  if (raw.trial !== undefined && typeof raw.trial !== 'boolean') return undefined;
  if (raw.machine !== undefined && (typeof raw.machine !== 'string' || !raw.machine.trim())) return undefined;
  if ((raw.trial === true || raw.ceiling !== undefined) && raw.level === undefined) return undefined;
  if (raw.choice === 'auto' && isLevel(raw.level) && isLevel(raw.ceiling) && QUALITY_LEVELS.indexOf(raw.level) > QUALITY_LEVELS.indexOf(raw.ceiling)) return undefined;
  let games: QualityGame[] | undefined;
  if (raw.games !== undefined) {
    if (!Array.isArray(raw.games)) return undefined;
    games = [];
    for (const game of raw.games) {
      if (!isRecord(game) || typeof game.at !== 'string' || !Number.isFinite(Date.parse(game.at)) || !isLevel(game.level) ||
          typeof game.load !== 'number' || !Number.isFinite(game.load) || game.load < 0 ||
          typeof game.frames !== 'number' || !Number.isSafeInteger(game.frames) || game.frames <= 0) return undefined;
      games.push({ at: game.at, level: game.level, load: game.load, frames: game.frames });
    }
    games = games.slice(-QUALITY_AUTO.keep);
    if (games.length && raw.level === undefined) return undefined;
  }
  let customSettings: Record<string, string | null> | undefined;
  if (raw.customSettings !== undefined) {
    if (!isRecord(raw.customSettings)) return undefined;
    customSettings = {};
    for (const key of QUALITY_KEYS) {
      const value = raw.customSettings[key];
      // Une valeur personnelle est conservée telle que l'INI la donne, même vide ; null signifie clé absente.
      if (value !== null && typeof value !== 'string') return undefined;
      customSettings[key] = value;
    }
  }
  let written: Record<string, string> | undefined;
  if (raw.written !== undefined) {
    if (!isRecord(raw.written)) return undefined;
    written = {};
    for (const [key, value] of Object.entries(raw.written)) {
      if (!QUALITY_KEYS.includes(key)) continue;
      if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value)) ||
          !QUALITY_LEVELS.some((level) => qualitySettings(level).some((setting) => setting.key === key && qualityValuesEqual(value, setting.value)))) return undefined;
      written[key] = value;
    }
  }
  return {
    choice: raw.choice,
    ...(isLevel(raw.level) && { level: raw.level }),
    ...(isLevel(raw.ceiling) && { ceiling: raw.ceiling }),
    ...(typeof raw.trial === 'boolean' && { trial: raw.trial }),
    ...(typeof raw.machine === 'string' && { machine: raw.machine }),
    ...(games !== undefined && { games }),
    ...(written !== undefined && raw.choice !== 'custom' && { written }),
    ...(customSettings !== undefined && { customSettings }),
  };
}

function readQualityConfigurations(dataDir: string): QualityConfigurations {
  const result: QualityConfigurations = { configurations: Object.create(null) as Record<string, QualityState> };
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(qualityStateFile(dataDir), 'utf8'));
    if (!isRecord(raw) || !isRecord(raw.configurations)) return result;
    for (const [file, value] of Object.entries(raw.configurations)) {
      if (!path.isAbsolute(file)) continue;
      const state = validatedState(value);
      if (state) result.configurations[iniKey(file)] = state;
    }
    if (typeof raw.active === 'string' && path.isAbsolute(raw.active)) {
      const active = iniKey(raw.active);
      if (result.configurations[active]) result.active = active;
    }
  } catch {
    // Fichier absent, incomplet ou illisible : les réglages de l'INI restent la référence.
  }
  return result;
}

/** Sans chemin (démonstrations et anciens appels), rend le dernier INI actif, jamais une configuration arbitraire. */
export function readQualityState(dataDir: string, iniPath?: string): QualityState | undefined {
  const saved = readQualityConfigurations(dataDir);
  const key = iniPath === undefined ? saved.active : iniKey(iniPath);
  return key === undefined ? undefined : saved.configurations[key];
}

function writeQualityState(dataDir: string, iniPath: string, state: QualityState): void {
  const saved = readQualityConfigurations(dataDir);
  saved.active = iniKey(iniPath);
  saved.configurations[saved.active] = state;
  writeFileAtomic(qualityStateFile(dataDir), `${JSON.stringify(saved, null, 2)}\n`);
}

/** La machine vue par la fiche technique : la carte graphique qui a le plus de mémoire, et le playfield. */
export function qualityMachine(dataDir: string): QualityMachine & { gpu?: string } {
  const facts = loadTechFacts(dataDir);
  const gpu = [...(facts?.pc?.gpus ?? [])].sort((a, b) => (b.memory ?? 0) - (a.memory ?? 0))[0];
  const playfield = facts?.displays?.find((d) => d.role === 'playfield');
  return {
    ...(gpu && { gpu: gpu.name }),
    ...(gpu?.memory && { vramMb: Math.round(gpu.memory / (1024 * 1024)) }),
    ...(playfield && { width: playfield.width, height: playfield.height, hz: playfield.hz }),
  };
}

/** Le nom d'un mode, ou du choix. */
export function qualityLabel(choice: QualityChoice): string {
  switch (choice) {
    case 'auto':
      return t('Auto');
    case 'performance':
      return t('Performance');
    case 'equilibre':
      return t('Équilibré');
    case 'qualite':
      return t('Qualité');
    case 'ultra':
      return t('Ultra');
    case 'custom':
      return t('Personnalisé');
  }
}

function qualityHelp(level: QualityLevel): string {
  switch (level) {
    case 'performance':
      return t('Le plus fluide : anticrénelage rapide, reflets fixes, sans ombrage ni halo. Petite carte graphique, ou grand écran à haute fréquence.');
    case 'equilibre':
      return t('Anticrénelage standard et image affinée, reflets des billes, ombrage fixe. Convient à la plupart des bornes.');
    case 'qualite':
      return t('Comme Équilibré, avec les reflets et l’ombrage qui suivent ce qui bouge. Carte graphique puissante.');
    case 'ultra':
      return t('Image calculée en plus haute définition puis réduite : la plus belle, la plus coûteuse. Très grosse carte graphique.');
  }
}

/** Une clé gérée changée à la main depuis la dernière écriture de Cyber Pinball : la première trouvée. */
function manualChange(doc: IniDocument, written: Record<string, string> | undefined): string | undefined {
  if (!written) return undefined;
  for (const key of QUALITY_KEYS) {
    const want = written[key];
    if (want === undefined) continue;
    if (!qualityValuesEqual(doc.get('Player', key), want)) return key;
  }
  return undefined;
}

/** Écrit les réglages d'un mode dans l'INI s'ils n'y sont pas déjà ; rend les valeurs écrites. */
function writeLevel(iniPath: string, level: QualityLevel): Record<string, string> {
  const settings = qualitySettings(level);
  const doc = IniDocument.parse(readTextIfExists(iniPath));
  const missing = settings.filter((s) => !qualityValuesEqual(doc.get(s.section, s.key), s.value));
  if (missing.length) {
    applyVpxSettings(doc, missing);
    writeFileAtomic(iniPath, doc.toString());
  }
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

/** Sans choix explicite, garder les réglages présents, y compris les défauts de VPX (INI vide). */
function firstState(doc: IniDocument): QualityState {
  return { choice: 'custom', customSettings: captureCustomSettings(doc) };
}

/** Les huit réglages personnels, y compris les clés absentes, sans toucher aux autres réglages. */
function captureCustomSettings(doc: IniDocument): Record<string, string | null> {
  return Object.fromEntries(QUALITY_KEYS.map((key) => [key, doc.get('Player', key) ?? null]));
}

function personalizedState(doc: IniDocument, state: QualityState): QualityState {
  return { ...state, choice: 'custom', customSettings: captureCustomSettings(doc), written: undefined };
}

function restoreCustomSettings(iniPath: string, settings: Record<string, string | null>): void {
  const doc = IniDocument.parse(readTextIfExists(iniPath));
  let changed = false;
  for (const key of QUALITY_KEYS) {
    const value = settings[key];
    if (value === null) changed = doc.remove('Player', key) || changed;
    else if (value !== undefined && doc.get('Player', key) !== value) {
      doc.set('Player', key, value);
      changed = true;
    }
  }
  if (changed) writeFileAtomic(iniPath, doc.toString());
}

/**
 * Avant une partie sur les écrans (pas dans le casque) : les réglages du mode dans `iniPath`. Rend une ligne pour le
 * journal, ou undefined s'il n'y a rien à dire. La copie éventuelle reçoit seulement les clés du mode.
 */
export function prepareQuality(dataDir: string, iniPath: string, gameIniPath?: string): string | undefined {
  const doc = IniDocument.parse(readTextIfExists(iniPath));
  let state = readQualityState(dataDir, iniPath) ?? firstState(doc);
  if (state.choice === 'custom') {
    writeQualityState(dataDir, iniPath, personalizedState(doc, state));
    return undefined;
  }
  const changed = manualChange(doc, state.written);
  if (changed) {
    writeQualityState(dataDir, iniPath, personalizedState(doc, state));
    return `Pré-réglages de VPX : ${changed} changé à la main, passage en Personnalisé (plus de réglage automatique).`; // i18n-ignore : journal
  }
  let note: string | undefined;
  let level: QualityLevel;
  if (state.choice === 'auto') {
    const machine = qualityMachine(dataDir);
    const key = machineKey(machine);
    if (!state.level || state.machine !== key) {
      const first = initialQuality(machine);
      note = `Pré-réglages de VPX (Auto) : ${first.level} au départ (${first.why}).`; // i18n-ignore : journal
      state = { ...state, level: first.level, machine: key, games: [], ceiling: undefined, trial: undefined };
    }
    level = state.level!;
  } else level = state.choice;
  const customSettings = state.customSettings ?? captureCustomSettings(doc);
  const written = writeLevel(iniPath, level);
  writeQualityState(dataDir, iniPath, { ...state, customSettings, written });
  // Le double a pu être copié avant cette préparation : seules les clés du mode le rejoignent, sans état propre.
  if (gameIniPath !== undefined && iniKey(gameIniPath) !== iniKey(iniPath)) writeLevel(gameIniPath, level);
  return note;
}

/** Après une partie sur les écrans : le mode Auto lit le temps de rendu de la carte graphique et s'ajuste. */
export function qualityAfterGame(dataDir: string, lines: readonly string[], iniPath?: string, tableFile?: string): string | undefined {
  if (tableFile !== undefined) {
    const tableIni = findTableIni(tableFile);
    if (tableIni.exists) {
      const doc = IniDocument.parse(readTextIfExists(tableIni.path));
      // Une surcharge de la table masque le mode global : son bilan ne peut pas servir à l'apprentissage.
      if (QUALITY_KEYS.some((key) => Boolean(doc.get('Player', key)?.trim()))) return undefined;
    }
  }
  const saved = readQualityConfigurations(dataDir);
  const key = iniPath === undefined ? saved.active : iniKey(iniPath);
  const state = key === undefined ? undefined : saved.configurations[key];
  if (!state || state.choice !== 'auto' || key === undefined) return undefined;
  // Une partie restée en pause, ou interrompue par une pause, ne mesure pas le coût d'une vraie partie.
  let playing = false;
  let paused = false;
  for (const line of lines) {
    if (line.includes('Unpausing Game')) playing = true;
    else if (line.includes('Pausing Game')) {
      paused = true;
      if (playing) return undefined;
    }
  }
  if (paused && !playing) return undefined;
  const stats = readGpuFrames(lines);
  const cadence = readVpxCadence(lines);
  const target = readVpxTargetFps(lines) ?? (stats && stats.budgetMs > 0 ? 1000 / stats.budgetMs : undefined);
  // Un GPU libre ne suffit pas : le processeur, le script ou les vidéos peuvent déjà ralentir la partie.
  const canRaise = Boolean(cadence && target !== undefined && Number.isFinite(target) && target > 0 &&
    Number.isFinite(cadence.fps) && cadence.fps >= target * 0.95 && Number.isFinite(cadence.late) && cadence.late >= 0 && cadence.late <= 5);
  const { state: next, change } = adaptQuality(state, stats, new Date(), canRaise);
  if (next !== state) writeQualityState(dataDir, key, next);
  const load = stats && stats.budgetMs > 0 ? Math.round((stats.p95Ms / stats.budgetMs) * 100) : undefined;
  if (change) return `Pré-réglages de VPX (Auto) : ${change.from} → ${change.to} à la partie suivante, ${change.why}.`; // i18n-ignore : journal
  return load === undefined ? undefined : `Pré-réglages de VPX (Auto) : ${state.level}, carte graphique à ${load} % du temps disponible par image.`; // i18n-ignore : journal
}

/** Choix immédiat : un mode écrit ses clés ; Personnalisé restaure les seules clés personnelles sauvegardées. */
export function chooseQuality(dataDir: string, iniPath: string, choice: QualityChoice): QualityLevel | undefined {
  const doc = IniDocument.parse(readTextIfExists(iniPath));
  let previous = readQualityState(dataDir, iniPath) ?? firstState(doc);
  if (previous.choice === 'custom' || manualChange(doc, previous.written)) previous = personalizedState(doc, previous);
  const customSettings = previous.customSettings ?? captureCustomSettings(doc);
  let state: QualityState = { ...previous, choice, customSettings };
  if (choice === 'custom') {
    restoreCustomSettings(iniPath, customSettings);
    writeQualityState(dataDir, iniPath, { ...state, written: undefined });
    return undefined;
  }
  if (choice === 'auto') {
    const machine = qualityMachine(dataDir);
    const key = machineKey(machine);
    // Auto repris : le mode trouvé sur cette machine reste ; sinon, le départ d'après la machine.
    if (!state.level || state.machine !== key) state = { ...state, level: initialQuality(machine).level, machine: key, games: [], ceiling: undefined, trial: undefined };
  }
  const level = choice === 'auto' ? state.level! : choice;
  const written = writeLevel(iniPath, level);
  writeQualityState(dataDir, iniPath, { ...state, written });
  console.log(`Pré-réglages de VPX : ${choice === 'auto' ? `Auto (${level})` : level} choisi.`); // i18n-ignore : journal
  return level;
}

export interface VpxPresetsMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  dataDir(): string;
  /** VPinballX.ini de la configuration active. */
  iniPath(): string;
}

/** Le choix en vigueur : une modification faite à la main dans l'INI vaut « Personnalisé ». */
export function effectiveQualityState(dataDir: string, iniPath: string): QualityState {
  const doc = IniDocument.parse(readTextIfExists(iniPath));
  const state = readQualityState(dataDir, iniPath) ?? firstState(doc);
  return state.choice !== 'custom' && manualChange(doc, state.written) ? personalizedState(doc, state) : state;
}

/** Le pré-réglage en vigueur, en une ligne : « Équilibré », « Personnalisé », « Auto · actuellement Qualité ». */
export function qualitySummary(dataDir: string, iniPath: string): string {
  const state = effectiveQualityState(dataDir, iniPath);
  if (state.choice === 'auto') return state.level ? t('Auto · actuellement {mode}', { mode: qualityLabel(state.level) }) : t('Auto · choisi à la prochaine partie');
  return qualityLabel(state.choice);
}

export function createVpxPresetsMenu(host: VpxPresetsMenuHost): { item: ProvidedSystemItem; open(at?: number): void } {
  const effectiveState = () => effectiveQualityState(host.dataDir(), host.iniPath());
  const summary = () => qualitySummary(host.dataDir(), host.iniPath());

  let openedState: QualityState = { choice: 'custom' };

  function build(): Built {
    const state = openedState;
    const choice = state.choice;
    const pick = (c: QualityChoice, at: number) => () => {
      chooseQuality(host.dataDir(), host.iniPath(), c);
      open(at);
    };
    const actions: Action[] = [
      {
        label: t('Auto'),
        detail: [
          t('Choisi d’après la carte graphique et le playfield, puis ajusté après chaque partie d’après le temps de rendu.'),
          ...(choice === 'auto' && state?.level ? [t('Actuellement : {mode}', { mode: qualityLabel(state.level) })] : []),
        ].join(' · '),
        icon: 'auto',
        activeChoice: choice === 'auto' ? t('Choix actuel') : undefined,
        tone: choice === 'auto' ? 'ok' : undefined,
        run: pick('auto', 0),
      },
      ...QUALITY_LEVELS.map((level, i): Action => ({
        label: qualityLabel(level),
        detail: qualityHelp(level),
        icon: (['rocket', 'gauge', 'eye', 'sparkle'] as const)[i]!,
        activeChoice: choice === level ? t('Choix actuel') : undefined,
        tone: choice === level ? 'ok' : undefined,
        run: pick(level, i + 1),
      })),
      {
        label: qualityLabel('custom'),
        detail: t('Tes propres réglages (Réglages de VPX) : Cyber Pinball n’y touche pas. Choisis un mode pour reprendre.'),
        icon: 'sliders',
        activeChoice: choice === 'custom' ? t('Choix actuel') : undefined,
        tone: choice === 'custom' ? 'ok' : undefined,
        run: pick('custom', QUALITY_LEVELS.length + 1),
      },
      { label: t('Retour'), icon: 'back', run: () => host.library.openSystem() },
    ];
    return {
      heading: t('Pré-réglages'),
      icon: 'gauge',
      lead: t('Qualité de l’image et fluidité de VPX en un choix. Les réglages un par un restent dans Réglages de VPX ; en changer un te fait passer en Personnalisé.'),
      sections: [],
      actions,
      back: () => host.library.openSystem(),
    };
  }

  function open(at = 0): void {
    openedState = effectiveState();
    host.library.openCustom(build, at);
  }

  return {
    item: {
      get detail() {
        return summary();
      },
      run: () => open(),
    },
    open,
  };
}
