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
// - À l'ouverture, les bandes jouent l'animation d'ouverture, calée sur l'horloge des écrans
//   (`introStartedAt`) : une liaison ouverte en retard la prend où elle en est. À la sortie, le moteur
//   fond son image dans l'ambiance des menus. Mêmes garde-fous que l'ambiance (`wanted`).
// - Les images partent au rythme de 25 par seconde au plus, uniquement tant que quelque chose bouge.
// - L'essai des bandes de l'écran de configuration (couche « test », ou une description en cours
//   d'essai) garde la main : tant que le pilote porte une autre description que celle enregistrée,
//   on n'y touche pas.
// - Une carte absente ne déclenche pas de nouvelle tentative à chaque image : une par minute au plus.

import {
  LedAmbientEngine,
  LedJukeboxMusic,
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
/**
 * Écran de l'ouverture : les bandes y jouent l'animation d'ouverture des LED (led-ouverture.ts), calée
 * sur l'instant de départ des animations des écrans (`introStartedAt`) ; rien tant qu'elles n'ont pas démarré.
 */
export const LED_INTRO_PHASE = 'intro';

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
  /**
   * Ouverture : instant de départ de ses animations (IntroRun.startedAt, Date.now() : la même horloge
   * que `now`) ; absent tant que les fenêtres ne sont pas toutes prêtes.
   */
  introStartedAt?: number;
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
  /** Graine du Florilège (par défaut : tirée au lancement). */
  seed?: number;
  setInterval?: (run: () => void, ms: number) => unknown;
  clearInterval?: (id: unknown) => void;
  log?: (line: string) => void;
}

export interface LedAnimations {
  update(context: LedAnimationContext): void;
  settings(): LedAnimationSettings;
  /** Niveaux du spectre du Juke-box (0 à 1, par bande) et couleurs de la pochette (#rrggbb) : les bandes suivent la musique. */
  feedMusic(levels: readonly number[], palette?: readonly string[]): void;
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
  const engine = new LedAmbientEngine(settings, { seed: options.seed });
  const music = new LedJukeboxMusic();
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

  /** L'ouverture a démarré : ses animations LED ont leur instant de départ. */
  const introOn = (): boolean => context.phase === LED_INTRO_PHASE && context.introStartedAt !== undefined && Number.isFinite(context.introStartedAt);
  const wanted = (): boolean => settings.enabled && (LED_AMBIENT_PHASES.includes(context.phase) || introOn()) && !idle && Boolean(usable());

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
    // Juke-box : tant que le morceau joue (ou que sa dernière lumière s'éteint), les bandes suivent le son.
    const follow = settings.jukeboxMusic && context.phase === 'jukebox' && music.active(t);
    if (follow) music.step(t);
    leds.strips.forEach((strip, i) => {
      const grid = { width: strip.width, height: strip.height, arrangement: strip.arrangement };
      service.setFrame('#' + i, follow ? music.render(grid, settings.brightness) : engine.render(grid, t), 'ambient');
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
    // Sortie de l'ouverture : son image se fond dans l'ambiance, sans passer par le noir (rien si elle ne jouait pas).
    if (next.phase !== LED_INTRO_PHASE) engine.endIntro(t);
    if (!wanted()) return clear();
    engine.configure(settings);
    if (introOn()) {
      engine.playIntro(next.introStartedAt!);
      // Les couleurs de la table sont prêtes pour l'ambiance qui suivra.
      engine.setTint(next.tint, t, true, next.palette);
      engage();
      return;
    }
    const first = !previous || !LED_AMBIENT_PHASES.includes(previous.phase);
    engine.setTint(next.tint, t, first, next.palette);
    if (!first) {
      // Florilège : un autre écran, un autre effet (de la variété sans attendre la fin de l'effet montré).
      if (next.phase !== previous.phase) engine.shuffle(t);
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
    feedMusic(levels, palette) {
      if (!disposed) music.feed(levels, now(), palette);
    },
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
      engine.setTint(context.tint, now(), false, context.palette);
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
