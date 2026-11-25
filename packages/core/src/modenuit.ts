// Mode nuit : d'un coup, la borne se fait discrète. Le joueur choisit ce qui change (front-end >
// « Mode nuit ») : la luminosité des écrans et des LED, le son (un pourcentage du volume normal,
// 0 % = muet), les toys de la borne (solénoïdes, shaker… : DOF les coupe), les LED.
//
// Qui l'active : un bouton facultatif (nightMode, buttons.ts) ou les réglages du front-end ; et,
// si le joueur le veut, l'horaire de nuit (arcadehours.ts) à ses heures. Un appui du bouton pendant
// la nuit de l'horaire coupe le mode jusqu'à la fin de la nuit (`override`).
//
// Règle de sûreté : tout ce que le mode nuit change est noté AVANT dans un journal (writeFileAtomic) ;
// la sortie du mode, la fin de la partie ou, après un plantage, le démarrage suivant remettent
// l'état d'avant. Jamais un volume ou une config DOF restée « de nuit » (modenuit.test.ts).
//
// Pendant une partie, DOF (libdof, dans VPX) lit son Cabinet.xml une fois, au lancement de la table :
// le mode nuit y pose une variante (toys de la borne coupés par AutoConfigEnabled=false, Brightness
// des bandes réduit ou nul) en réécrivant le CabinetConfigFilePattern du GlobalConfig, puis remet
// l'original à la fin de la partie. Seulement si ces deux fichiers sont ceux de Cyber Pinball
// (marque « Written by Cyber Pinball ») ou absents : une config DOF écrite à la main n'est jamais touchée.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import type { DofSetup } from './dof';
import { t } from './i18n';
import type { OutputVolume } from './cabinetvolume';

// ---------------------------------------------------------------------------
// Réglages

export interface NightModeSettings {
  /** Le mode est demandé par le joueur (bouton ou réglages). */
  manual: boolean;
  /** Suit l'horaire de nuit (arcadehours.ts) : actif aux heures de la nuit, sans que l'horaire soit obligatoire. */
  withHours: boolean;
  /** Voile noir des écrans, en pour cent (0 : inchangés). */
  screenDim: number;
  /** Luminosité des LED, en pour cent de la normale (100 : inchangée). */
  ledBrightness: number;
  /** Son de la borne, en pour cent du volume normal (100 : inchangé, 0 : muet). */
  volume: number;
  /** Toys de la borne coupés (solénoïdes, shaker… ; DOF). */
  toysOff: boolean;
  /** LED éteintes. */
  ledsOff: boolean;
}

export const DEFAULT_NIGHT_MODE: NightModeSettings = {
  manual: false,
  withHours: false,
  screenDim: 50,
  ledBrightness: 30,
  volume: 40,
  toysOff: true,
  ledsOff: false,
};

export const NIGHT_SCREEN_DIM_CHOICES: readonly number[] = [0, 25, 50, 70, 85];
export const NIGHT_LED_CHOICES: readonly number[] = [100, 70, 50, 30, 15];
export const NIGHT_VOLUME_CHOICES: readonly number[] = [100, 70, 50, 40, 25, 10, 0];

const intIn = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback);

/** Réglages lus d'un objet quelconque (medias.json écrit à la main, version plus ancienne). */
export function normalizeNightMode(raw: unknown): NightModeSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_NIGHT_MODE;
  return {
    manual: typeof r.manual === 'boolean' ? r.manual : d.manual,
    withHours: typeof r.withHours === 'boolean' ? r.withHours : d.withHours,
    screenDim: intIn(r.screenDim, 0, 100, d.screenDim),
    ledBrightness: intIn(r.ledBrightness, 0, 100, d.ledBrightness),
    volume: intIn(r.volume, 0, 100, d.volume),
    toysOff: typeof r.toysOff === 'boolean' ? r.toysOff : d.toysOff,
    ledsOff: typeof r.ledsOff === 'boolean' ? r.ledsOff : d.ledsOff,
  };
}

/** Le mode nuit est-il en marche ? `override` : le joueur a tranché à la main pendant cette nuit de l'horaire. */
export function nightModeOn(s: NightModeSettings, scheduleNight: boolean, override?: boolean): boolean {
  if (override !== undefined) return override;
  return s.manual || (s.withHours && scheduleNight);
}

/** Bascule d'un appui : le nouvel état des réglages et de `override`. */
export function toggleNightMode(s: NightModeSettings, scheduleNight: boolean, override?: boolean): { manual: boolean; override: boolean | undefined; on: boolean } {
  const on = !nightModeOn(s, scheduleNight, override);
  // Éteint pendant la nuit de l'horaire : l'horaire ne le rallume pas avant la nuit suivante.
  return { manual: on, override: on ? undefined : s.withHours && scheduleNight ? false : undefined, on };
}

/** « 40 % du volume », « muet », « inchangé ». */
export function nightVolumeLabel(percent: number): string {
  return percent >= 100 ? t('inchangé') : percent <= 0 ? t('muet') : t('{percent} % du volume', { percent });
}

export function nightLedLabel(s: Pick<NightModeSettings, 'ledsOff' | 'ledBrightness'>): string {
  return s.ledsOff ? t('LED éteintes') : s.ledBrightness >= 100 ? t('inchangées') : t('{percent} % de la luminosité', { percent: s.ledBrightness });
}

export function nightScreenLabel(percent: number): string {
  return percent <= 0 ? t('inchangés') : t('voile noir à {percent} %', { percent });
}

/** Ligne qui ouvre l'écran des réglages : « actif · son 40 % · toys coupés ». */
export function nightModeSummary(s: NightModeSettings, on: boolean): string {
  const parts: string[] = [on ? t('actif') : t('inactif')];
  if (s.withHours) parts.push(t('selon l’horaire'));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Son

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const tidy = (v: number) => Math.round(clamp(v) * 1000) / 1000;

/** Sorties de la nuit : `percent` du niveau d'avant ; 0 % coupe le son. */
export function nightVolumes(before: readonly OutputVolume[], percent: number): OutputVolume[] {
  if (percent >= 100) return before.map((o) => ({ ...o }));
  return before.map((o) => ({ ...o, level: tidy(o.level * (percent / 100)), muted: percent <= 0 ? true : o.muted }));
}

/**
 * Sorties à remettre en sortant : celles que le mode nuit a réglées et que personne n'a retouchées
 * depuis (un volume changé aux boutons pendant la nuit est le choix du joueur, il reste).
 */
export function volumesToRestore(saved: { before: readonly OutputVolume[]; set: readonly OutputVolume[] }, current: readonly OutputVolume[]): OutputVolume[] {
  const out: OutputVolume[] = [];
  for (const before of saved.before) {
    const set = saved.set.find((o) => o.id === before.id);
    const now = current.find((o) => o.id === before.id);
    if (!set || !now) continue;
    if (Math.abs(now.level - set.level) < 0.011 && now.muted === set.muted) out.push({ ...before });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Journal : l'état d'avant, écrit avant tout changement

export interface NightJournal {
  version: 1;
  savedAt: string;
  volumes?: { before: OutputVolume[]; set: OutputVolume[] };
  dof?: { globalFile: string; /** null : le GlobalConfig n'existait pas. */ globalOriginal: string | null; variantFile: string };
}

export function readNightJournal(file: string): NightJournal | undefined {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) as NightJournal;
    return j && j.version === 1 ? j : undefined;
  } catch {
    return undefined;
  }
}

export function writeNightJournal(file: string, journal: Omit<NightJournal, 'version' | 'savedAt'>, now = new Date()): void {
  if (!journal.volumes && !journal.dof) {
    fs.rmSync(file, { force: true });
    return;
  }
  writeFileAtomic(file, JSON.stringify({ version: 1, savedAt: now.toISOString(), ...journal }, null, 2));
}

// ---------------------------------------------------------------------------
// DOF : la variante de la nuit

export interface NightDofOptions {
  toysOff: boolean;
  ledsOff: boolean;
  /** 0 à 100 : luminosité des bandes de LED. */
  ledBrightness: number;
}

/** Y a-t-il quelque chose à changer dans la config DOF ? */
export function nightDofWanted(o: NightDofOptions): boolean {
  return o.toysOff || o.ledsOff || o.ledBrightness < 100;
}

export const NIGHT_CABINET_NAME = 'Cabinet.nuit.xml';
const OWNED = /<!--\s*(?:Écrit|Written) (?:par|by) Cyber Pinball/;
const NIGHT_MARK = '<!-- Written by Cyber Pinball (mode nuit): temporary file, deleted when the game ends. -->'; // i18n-ignore : fichier lu par DOF

/** Variante du Cabinet.xml : toys coupés (AutoConfigEnabled=false), Brightness des bandes réduit. `original` : texte du Cabinet.xml, ou undefined s'il n'y en a pas. */
export function nightCabinetXml(original: string | undefined, o: NightDofOptions): string {
  const factor = o.ledsOff ? 0 : Math.max(0, Math.min(100, o.ledBrightness)) / 100;
  if (original === undefined) {
    return ['<?xml version="1.0" encoding="utf-8"?>', NIGHT_MARK, '<Cabinet>', '  <Name>Cyber Pinball (nuit)</Name>', `  <AutoConfigEnabled>${o.toysOff ? 'false' : 'true'}</AutoConfigEnabled>`, '  <Toys />', '</Cabinet>', ''].join('\r\n'); // i18n-ignore : fichier lu par DOF
  }
  let text = original;
  if (o.toysOff) {
    if (/<AutoConfigEnabled>[\s\S]*?<\/AutoConfigEnabled>/.test(text)) text = text.replace(/<AutoConfigEnabled>[\s\S]*?<\/AutoConfigEnabled>/, '<AutoConfigEnabled>false</AutoConfigEnabled>');
    else text = text.replace(/<Cabinet>/, '<Cabinet>\r\n  <AutoConfigEnabled>false</AutoConfigEnabled>');
  }
  if (factor < 1) {
    text = text.replace(/<LedStrip>[\s\S]*?<\/LedStrip>/g, (block) => {
      const m = /<Brightness>\s*([\d.]+)\s*<\/Brightness>/.exec(block);
      const was = m ? Number(m[1]) : 100;
      const next = Math.round(was * factor);
      return m ? block.replace(m[0], `<Brightness>${next}</Brightness>`) : block.replace('</LedStrip>', `  <Brightness>${next}</Brightness>\r\n    </LedStrip>`);
    });
  }
  return OWNED.test(text) ? text.replace(/(<\?xml[^>]*\?>\s*)/, `$1${NIGHT_MARK}\r\n`) : text;
}

/** GlobalConfig de la nuit : le CabinetConfigFilePattern désigne `pattern`. `original` : texte du GlobalConfig, ou undefined s'il n'y en a pas. */
export function nightGlobalConfigXml(original: string | undefined, pattern: string): string {
  const tag = `<CabinetConfigFilePattern>${pattern}</CabinetConfigFilePattern>`;
  if (original === undefined) return ['<?xml version="1.0" encoding="utf-8"?>', NIGHT_MARK, '<GlobalConfig>', `  ${tag}`, '</GlobalConfig>', ''].join('\r\n'); // i18n-ignore : fichier lu par DOF
  if (/<CabinetConfigFilePattern>[\s\S]*?<\/CabinetConfigFilePattern>/.test(original)) return original.replace(/<CabinetConfigFilePattern>[\s\S]*?<\/CabinetConfigFilePattern>/, tag);
  return original.replace(/<\/GlobalConfig>/, `  ${tag}\r\n</GlobalConfig>`);
}

export type NightDofPlan =
  | { kind: 'none' }
  | { kind: 'refused'; reason: string }
  | { kind: 'apply'; globalFile: string; globalOriginal: string | null; globalText: string; variantFile: string; variantText: string };

const GLOBAL_NAME = 'GlobalConfig_B2SServer.xml';

/** Que faire de la config DOF pour une partie de nuit ? */
export function planNightDof(setup: DofSetup | undefined, o: NightDofOptions, read: (file: string) => string | undefined = readText): NightDofPlan {
  if (!setup || !nightDofWanted(o)) return { kind: 'none' };
  const globalFile = setup.globalConfig?.file ?? path.join(setup.dir, GLOBAL_NAME);
  const globalText = read(globalFile);
  if (globalText !== undefined && (!setup.globalConfig || !setup.globalConfig.owned)) {
    return { kind: 'refused', reason: t('Ta configuration DOF (GlobalConfig) est écrite à la main : Cyber Pinball n’y touche pas. Le son et les écrans suivent le mode nuit, pas les toys ni les LED en partie.') };
  }
  if (setup.cabinet && !setup.cabinet.owned) {
    return { kind: 'refused', reason: t('Ta configuration DOF (Cabinet.xml) est écrite à la main : Cyber Pinball n’y touche pas. Le son et les écrans suivent le mode nuit, pas les toys ni les LED en partie.') };
  }
  const cabinetText = setup.cabinet ? read(setup.cabinet.file) : undefined;
  const dir = path.dirname(globalFile);
  const variantFile = path.join(dir, NIGHT_CABINET_NAME);
  return {
    kind: 'apply',
    globalFile,
    globalOriginal: globalText ?? null,
    globalText: nightGlobalConfigXml(globalText, `{GlobalConfigDir}\\${NIGHT_CABINET_NAME}`),
    variantFile,
    variantText: nightCabinetXml(cabinetText, o),
  };
}

function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Pose la variante : journal d'abord, puis la variante, puis le GlobalConfig qui la désigne. */
export function applyNightDof(journalFile: string, plan: Extract<NightDofPlan, { kind: 'apply' }>): void {
  const journal = readNightJournal(journalFile);
  // Déjà posée (second lancement dans la nuit) : l'original du journal reste celui d'avant la nuit.
  const original = journal?.dof ? journal.dof.globalOriginal : plan.globalOriginal;
  writeNightJournal(journalFile, { ...(journal?.volumes ? { volumes: journal.volumes } : {}), dof: { globalFile: plan.globalFile, globalOriginal: original, variantFile: plan.variantFile } });
  writeFileAtomic(plan.variantFile, plan.variantText);
  writeFileAtomic(plan.globalFile, plan.globalText);
}

/** Remet la config DOF d'avant ; sans effet s'il n'y a rien à remettre. Vrai si quelque chose a été remis. */
export function restoreNightDof(journalFile: string): boolean {
  const journal = readNightJournal(journalFile);
  const dof = journal?.dof;
  if (!journal || !dof) return false;
  if (dof.globalOriginal === null) fs.rmSync(dof.globalFile, { force: true });
  else writeFileAtomic(dof.globalFile, dof.globalOriginal);
  fs.rmSync(dof.variantFile, { force: true });
  writeNightJournal(journalFile, journal.volumes ? { volumes: journal.volumes } : {});
  return true;
}
