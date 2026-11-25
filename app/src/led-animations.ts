// Animations des LED hors partie : relie le moteur du cœur (packages/core/src/led-animations.ts) au
// pilote des LED (led-live.ts) et au front-end.
//
// Règles :
// - Rien ne tourne sans LED : pas de bande décrite, une carte qui porte ses bandes (DudesCab, Pinscape
//   Pico), animations coupées, partie en préparation ou en cours, inactivité : pas de minuterie, pas
//   d'image calculée, pas de port ouvert par nous.
// - Le front-end ne donne que des faits (`update`) : l'écran, la table choisie, la fiche ouverte, la
//   teinte de la table. Le pilote rend le port à DOF dès qu'une partie se prépare (led-live.ts) ; ici,
//   `update` n'allume plus rien dans ces phases et vide la couche d'ambiance.
// - Les images partent au rythme de 25 par seconde au plus, uniquement tant que quelque chose bouge.
// - L'essai des bandes de l'écran de configuration (couche « test », ou une description en cours
//   d'essai) garde la main : tant que le pilote porte une autre description que celle enregistrée,
//   on n'y touche pas.
// - Une carte absente ne déclenche pas de nouvelle tentative à chaque image : une par minute au plus.

import {
  LedAmbientEngine,
  ledProblems,
  ledsOnBoard,
  normalizeLedAnimations,
  readLedAnimations,
  writeLedAnimations,
  type CabinetLeds,
  type LedAnimationSettings,
} from '@cyberpinball/core';
import type { LedService } from './led-live';

/** Écrans où l'ambiance a sa place : la roue, les menus, les messages, le Juke-box. Jamais l'intro ni une partie. */
export const LED_AMBIENT_PHASES: readonly string[] = ['menu', 'library', 'message', 'confirmQuit', 'jukebox'];

/** Ce que le front-end sait, à chaque état envoyé. */
export interface LedAnimationContext {
  phase: string;
  /** Table choisie à la roue (ou montrée par le mode attente). */
  tableKey?: string;
  /** Position de cette table dans la roue : donne le sens du balayage. */
  index?: number;
  /** Table dont la fiche est ouverte dans la bibliothèque. */
  ficheKey?: string;
  /** Teinte de la table montrée (#rrggbb), mesurée et gardée par table-tint.ts. */
  tint?: string;
  /** Couleurs dominantes du visuel de cette table pour les LED (#rrggbb, la plus présente d'abord). */
  palette?: readonly string[];
}

export interface LedAnimationsOptions {
  service: LedService;
  /** Bandes décrites dans Cabinet.xml ; undefined : aucune. */
  leds: () => CabinetLeds | undefined;
  dataDir: string;
  /** Millisecondes sans que personne n'ait touché à rien (AttractMode.idleFor). */
  idleFor: () => number;
  now?: () => number;
  /** Remplaçables par les essais. */
  setInterval?: (run: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  log?: (line: string) => void;
}

export interface LedAnimations {
  update(context: LedAnimationContext): void;
  settings(): LedAnimationSettings;
  /** Change des réglages, les enregistre, et les montre aussitôt. */
  change(patch: Partial<LedAnimationSettings>): void;
  /** Il y a des bandes que les animations peuvent piloter (sert à l'écran de réglage). */
  available(): boolean;
  /** La minuterie des images tourne. */
  readonly running: boolean;
  /** À la fermeture : plus aucune image, plus de réouverture du port. */
  dispose(): void;
}

const FRAME_MS = 40;
const RETRY_AFTER_ERROR_MS = 60_000;
const REGAIN_MS = 1500;

export function createLedAnimations(options: LedAnimationsOptions): LedAnimations {
  const { service } = options;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setInterval ?? ((run, ms) => setInterval(run, ms));
  const clearTimer = options.clearInterval ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>));
  let settings = readLedAnimations(options.dataDir);
  const engine = new LedAmbientEngine(settings);
  let context: LedAnimationContext = { phase: 'menu' };
  let seen: LedAnimationContext | undefined;
  let timer: unknown;
  let disposed = false;
  let errorAt = -Infinity;
  let idle = false;
  let shown = false;

  /** Bandes que l'on peut piloter : décrites, sur un port, sans problème. */
  const usable = (): CabinetLeds | undefined => {
    const leds = options.leds();
    return leds && leds.strips.length && !ledsOnBoard(leds.controller) && !ledProblems(leds).length ? leds : undefined;
  };

  const wanted = (): boolean => settings.enabled && LED_AMBIENT_PHASES.includes(context.phase) && !idle && Boolean(usable());

  function stopTimer(): void {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  }

  /** Vide notre couche : les LED s'éteignent à la prochaine image, rien d'autre n'est touché. */
  function clear(): void {
    stopTimer();
    if (shown) service.clearLayer('ambient');
    shown = false;
  }

  /** Le pilote porte-t-il une description d'essai (écran de configuration) plutôt que celle enregistrée ? */
  function testing(saved: CabinetLeds): boolean {
    const status = service.status();
    return (status.state === 'running' || status.state === 'connecting') && JSON.stringify(service.leds) !== JSON.stringify(saved);
  }

  function tick(): void {
    const leds = service.leds;
    if (!leds || disposed || service.status().state !== 'running') return stopTimer();
    const saved = usable();
    if (!saved || testing(saved)) return clear();
    const minutes = settings.idleMinutes;
    if (minutes > 0 && options.idleFor() >= minutes * 60_000) {
      idle = true;
      return clear();
    }
    const t = now();
    leds.strips.forEach((strip, i) => {
      service.setFrame('#' + i, engine.render({ width: strip.width, height: strip.height, arrangement: strip.arrangement }, t), 'ambient');
    });
    shown = true;
  }

  /** Ouvre la liaison si elle ne l'est pas, puis lance la minuterie. */
  function engage(): void {
    const saved = usable();
    if (!saved || disposed) return;
    if (testing(saved)) return clear();
    const status = service.status();
    if (status.state === 'running') {
      if (timer === undefined) timer = setTimer(tick, FRAME_MS);
      return;
    }
    if (status.state === 'connecting' || status.state === 'paused-by-game') return;
    if (status.state === 'error' && now() - errorAt < RETRY_AFTER_ERROR_MS) return;
    service.configure(saved);
    service
      .start()
      .then(() => {
        if (!disposed && wanted() && timer === undefined) timer = setTimer(tick, FRAME_MS);
      })
      .catch((error: unknown) => {
        errorAt = now();
        options.log?.(`Animations des LED : ${(error as Error).message}`); // i18n-ignore : journal
      });
  }

  function update(next: LedAnimationContext): void {
    if (disposed) return;
    const previous = seen;
    context = next;
    seen = next;
    const t = now();
    // Activité : un changement de ce que montre l'écran réveille les LED éteintes pour inactivité.
    if (idle && (settings.idleMinutes === 0 || options.idleFor() < settings.idleMinutes * 60_000)) idle = false;
    if (!wanted()) return clear();
    engine.configure(settings);
    const first = !previous || !LED_AMBIENT_PHASES.includes(previous.phase);
    engine.setTint(next.tint, t, first);
    if (!first) {
      if (next.phase === 'menu' && next.tableKey !== previous.tableKey && next.tableKey !== undefined) {
        engine.sweep(t, next.index !== undefined && previous.index !== undefined && next.index < previous.index ? -1 : 1);
      } else if (next.ficheKey !== previous.ficheKey && next.ficheKey !== undefined) {
        engine.arrive(t);
      }
    }
    engage();
  }

  // Liaison ouverte sans nous (retour d'une partie : le pilote rouvre le port) ou fermée par l'essai des
  // bandes : on reprend la main, après un court délai quand elle vient de se fermer (l'essai en rouvre
  // une aussitôt avec sa description, et ne doit pas nous trouver en travers).
  let regain: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = service.onStatus((status) => {
    if (disposed) return;
    if (status.state === 'running') {
      if (wanted()) engage();
    } else if (status.state === 'closed') {
      clearTimeout(regain);
      regain = setTimeout(() => {
        regain = undefined;
        if (!disposed && wanted()) engage();
      }, REGAIN_MS);
      regain.unref?.();
    }
  });

  return {
    update,
    settings: () => settings,
    change(patch) {
      settings = normalizeLedAnimations({ ...settings, ...patch });
      try {
        writeLedAnimations(options.dataDir, settings);
      } catch (error) {
        options.log?.(`Animations des LED : réglages non enregistrés (${(error as Error).message}).`); // i18n-ignore : journal
      }
      engine.configure(settings);
      // Réglage changé : le style, la couleur ou la luminosité se voient tout de suite.
      engine.setTint(context.tint, now());
      idle = false;
      if (!settings.enabled) {
        clear();
        // Notre liaison n'a plus de raison d'être : le port est rendu (sauf si l'essai des bandes l'utilise).
        const saved = options.leds();
        if (service.status().state === 'running' && saved && !testing(saved)) void service.stop();
        return;
      }
      update(context);
    },
    available: () => Boolean(usable()),
    get running() {
      return timer !== undefined;
    },
    dispose() {
      disposed = true;
      stopTimer();
      clearTimeout(regain);
      unsubscribe();
    },
  };
}
