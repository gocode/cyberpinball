// Future Pinball : ce que Cyber Pinball constate au lancement d'une partie et écrit au journal, pour les
// deux défauts qu'on ne voit pas dans le code (24/11/2026, borne : « pas de son », « vue catastrophique »).
// Lignes de journal : en français seulement, comme celles du reste du journal.
//
// Son : Future Pinball (FMOD 3) n'a aucun réglage de sortie, il joue sur la sortie par défaut de Windows.
// VPX reçoit son périphérique dans son INI ; ici rien ne peut le diriger : depuis le 28/11/2026 Cyber
// Pinball pose la sortie de l'étape « Son » comme sortie par défaut le temps de la partie, puis la rend
// (game-audio-route.ts). Le journal dit laquelle des deux sorties joue et comment elle est réglée.
//
// Vue : BAM garde la caméra de chaque table dans BAM\cfg\<table>.cfg et, à défaut, dans BAM\default.cfg ;
// une table sans fichier reçoit la vue par défaut. Le journal dit laquelle est lue, et si une ancienne
// installation en gardait une réglée que le dossier géré n'a pas reprise (futurepinball-managed.ts).

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AudioRole, CabinetAudio, ObservedAudioOutput } from './model';
import { FUTURE_PINBALL_VIEW_UNTOUCHED_MS, planFuturePinballViews } from './futurepinball-managed';

/** La sortie par défaut de Windows, telle que Core Audio la rend (system-volume.ts). */
export interface DefaultOutputState {
  /** Identifiant IMMDevice::GetId. */
  id: string;
  /** Niveau de 0 à 1. */
  level: number;
  muted: boolean;
}

export interface FuturePinballSoundReport {
  /** Future Pinball sortira par une autre sortie que celle de l'étape « Son » (playfield, sinon fronton). */
  elsewhere: boolean;
  /** La sortie par défaut est coupée ou à 0 : la partie est muette quoi qu'on fasse dans le jeu. */
  silent: boolean;
  /** Lignes du journal. */
  lines: string[];
}

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function outputName(id: string | undefined, outputs: readonly ObservedAudioOutput[], saved: CabinetAudio | undefined): string | undefined {
  if (!id) return undefined;
  const seen = outputs.find((o) => same(o.endpointId, id));
  if (seen) return seen.friendlyName;
  const known = saved?.outputs.find((o) => same(o.endpointId, id));
  return known?.lastSeen?.friendlyName ?? known?.label;
}

/** Sortie de l'étape « Son » dont le son compte pour la partie : celle du playfield, à défaut celle du fronton. */
function wantedOutput(audio: CabinetAudio | undefined): { id: string; role: AudioRole } | undefined {
  const playfield = audio?.roles.playfield;
  if (playfield) return { id: playfield, role: 'playfield' };
  const backglass = audio?.roles.backglass;
  return backglass ? { id: backglass, role: 'backglass' } : undefined;
}

/**
 * Où jouera le son de Future Pinball, d'après la sortie par défaut de Windows (`defaultOutput`, vide si
 * Core Audio ne répond pas), les sorties vues (`outputs`) et l'étape « Son » de la borne (`audio`).
 */
export function futurePinballSoundReport(input: { defaultOutput?: DefaultOutputState; outputs: readonly ObservedAudioOutput[]; audio?: CabinetAudio }): FuturePinballSoundReport {
  const { defaultOutput, outputs, audio } = input;
  if (!defaultOutput) return { elsewhere: false, silent: false, lines: ['Son : la sortie par défaut de Windows n’a pas pu être lue.'] }; // i18n-ignore : journal
  const name = outputName(defaultOutput.id, outputs, audio) ?? defaultOutput.id;
  const state = defaultOutput.muted ? 'coupée' : `${Math.round(defaultOutput.level * 100)} %`; // i18n-ignore : journal
  const silent = defaultOutput.muted || defaultOutput.level < 0.01;
  const lines = [`Son : Future Pinball n’a pas de choix de sortie, il joue sur la sortie par défaut de Windows, « ${name} » (${state}).`]; // i18n-ignore : journal
  const wanted = wantedOutput(audio);
  const elsewhere = !!wanted && !same(wanted.id, defaultOutput.id);
  if (wanted && elsewhere) {
    const target = outputName(wanted.id, outputs, audio) ?? wanted.id;
    lines.push(`Son : l’étape « Son » de la borne vise « ${target} » (${wanted.role}) , mais la sortie par défaut de Windows est une autre : Future Pinball n’y sort pas (Cyber Pinball la pose avant la partie ; la ligne « Son : » du lancement dit pourquoi elle ne l’a pas fait).`); // i18n-ignore : journal
  }
  if (silent) lines.push(`Son : cette sortie est ${defaultOutput.muted ? 'coupée' : 'à 0 %'} : la partie est muette.`); // i18n-ignore : journal
  return { elsewhere, silent, lines };
}

/** Une ligne par constat sur la vue de BAM de cette table, et sur ce qu'une ancienne installation (`other`) garde en plus. */
export function futurePinballViewReport(install: { gameDir: string }, tableFile: string, other?: { gameDir: string }): string[] {
  const lines: string[] = [];
  const bam = path.join(install.gameDir, 'BAM');
  const name = path.basename(tableFile, path.extname(tableFile));
  let own: fs.Stats | undefined;
  try {
    own = fs.statSync(path.join(bam, 'cfg', `${name}.cfg`));
  } catch {
    own = undefined;
  }
  if (!own) {
    const fallback = fs.existsSync(path.join(bam, 'default.cfg'));
    lines.push(`Vue : pas de vue de BAM pour « ${name} » ; BAM crée ${fallback ? 'celle-ci d’après son default.cfg' : 'la vue par défaut'}.`); // i18n-ignore : journal
  } else {
    const saved = own.birthtimeMs <= 0 || own.mtimeMs < own.birthtimeMs || own.mtimeMs - own.birthtimeMs > FUTURE_PINBALL_VIEW_UNTOUCHED_MS;
    lines.push(saved ? `Vue : « ${name} » a sa vue de BAM, enregistrée.` : `Vue : « ${name} » a la vue par défaut que BAM a créée ; elle n’a jamais été réglée.`); // i18n-ignore : journal
  }
  if (other && path.resolve(other.gameDir).toLowerCase() !== path.resolve(install.gameDir).toLowerCase()) {
    const pending = planFuturePinballViews(other.gameDir, install.gameDir);
    if (pending.length) {
      const mine = pending.some((v) => v.rel.toLowerCase() === `cfg/${name.toLowerCase()}.cfg`);
      lines.push(`Vue : ${pending.length} réglage(s) de vue de BAM de ${other.gameDir} ne sont pas repris ici${mine ? `, dont celui de « ${name} »` : ''}. « Tables de Future Pinball » > « Reprendre les tables et les vues de BAM… » les reprend.`); // i18n-ignore : journal
    }
  }
  return lines;
}
