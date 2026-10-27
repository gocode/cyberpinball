// Alimentation de la borne : l'éteindre, la mettre en veille, la redémarrer. Aujourd'hui
// depuis le menu système (rubrique Cyber Pinball, app/src/power.ts) ; demain à heure fixe (mode
// attente et horaire : extinction à 2 h), d'où une action programmée et annulable.
//
// Ce module décide de la méthode et du moment ; il n'agit que par un exécuteur qu'on lui
// donne. En essai (hors écran, pilote automatique, captures, endurance, bac à sable, tests
// unitaires, CYBERPINBALL_ALIMENTATION_SIMULEE=1), l'exécuteur réel n'est même pas
// construit : rien ne s'éteint jamais pendant un essai (power.test.ts).
//
// Méthodes, choisies pour Windows 11 :
// - éteindre : `shutdown.exe /s /t 0`. Arrêt complet : le démarrage rapide n'intervient
//   qu'avec /hybrid, la borne repart donc à froid, ses périphériques USB (Pinscape, encodeurs,
//   cartes de sortie) réénumérés. Sans /f : /t 0 ne force pas la fermeture des applications
//   (un délai supérieur à 0 l'impliquerait), une application ouverte peut enregistrer.
// - redémarrer : `shutdown.exe /r /t 0`, pour les mêmes raisons.
// - mettre en veille : SetSuspendState(FALSE, FALSE, FALSE) de powrprof.dll, appelée
//   directement (packages/win-displays/src/power.ts), jamais par
//   `rundll32 powrprof.dll,SetSuspendState 0,1,0`. rundll32 appelle la fonction avec ses
//   propres arguments (fenêtre, instance, ligne de commande, affichage) : le premier,
//   bHibernate, reçoit une poignée de fenêtre non nulle, et la borne hiberne dès que la
//   veille prolongée est active, ce qui est le cas par défaut sous Windows 11 (et sur la
//   borne : `powercfg /a` y donne S3 et la veille prolongée). L'hibernation écrit la mémoire
//   sur le disque et repart lentement ; ce n'est pas la veille demandée. Appelée avec
//   bHibernate = FALSE, la fonction met en veille S3 (veille hybride si Windows l'a activée :
//   S3, la mémoire copiée en plus sur le disque par sécurité, réveil aussi rapide). Les
//   évènements de réveil restent permis (bWakeupEventsDisabled = FALSE). Un PC à veille
//   moderne seulement (S0 faible consommation, sans S3) refuse SetSuspendState
//   (ERROR_NOT_SUPPORTED) : IsPwrSuspendAllowed le dit d'avance et le menu l'annonce au lieu
//   d'hiberner ou d'éteindre à la place.

import { offscreenMode } from './offscreen';
import { t } from './i18n';

export const POWER_ACTIONS = ['shutdown', 'sleep', 'restart'] as const;
export type PowerAction = (typeof POWER_ACTIONS)[number];

/** Ce que l'exécuteur fait : une commande de Windows, ou la mise en veille par powrprof. */
export type PowerStep = { kind: 'command'; file: 'shutdown.exe'; args: string[] } | { kind: 'suspend' };

/** Méthode de chaque action (justifiée en tête du module). */
export function powerStep(action: PowerAction): PowerStep {
  switch (action) {
    case 'shutdown':
      return { kind: 'command', file: 'shutdown.exe', args: ['/s', '/t', '0'] };
    case 'restart':
      return { kind: 'command', file: 'shutdown.exe', args: ['/r', '/t', '0'] };
    case 'sleep':
      return { kind: 'suspend' };
  }
}

/** L'étape telle qu'un journal la nomme. */
export function describePowerStep(step: PowerStep): string {
  return step.kind === 'command' ? `${step.file} ${step.args.join(' ')}` : 'powrprof SetSuspendState(FALSE, FALSE, FALSE)';
}

/** Ce que la borne sait faire, relevé sur ce PC (IsPwrSuspendAllowed). */
export interface PowerCapabilities {
  /** Veille S1 à S3 possible ; faux sur un PC à veille moderne seulement. */
  sleep: boolean;
}

export interface PowerOutcome {
  ok: boolean;
  /** Rien n'a été fait pour de vrai : l'action a seulement été journalisée. */
  simulated?: boolean;
  /** Pourquoi Windows a refusé (déjà traduit). */
  problem?: string;
}

export type PowerExecutor = (step: PowerStep) => Promise<PowerOutcome>;

/** Variables qui disent qu'un essai tourne : l'alimentation y est toujours simulée, même à l'écran. */
const TEST_VARS = ['CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_CAPTURE', 'CYBERPINBALL_STRESS', 'CYBERPINBALL_HOME', 'NODE_TEST_CONTEXT'];

/**
 * Vrai si éteindre, mettre en veille ou redémarrer doit être simulé : sur demande
 * (CYBERPINBALL_ALIMENTATION_SIMULEE=1), hors écran, et pour tout essai, même lancé à l'écran
 * (CYBERPINBALL_A_L_ECRAN=1) : un essai ne doit jamais éteindre le poste qui le fait tourner.
 */
export function powerSimulated(env: NodeJS.ProcessEnv): boolean {
  return env.CYBERPINBALL_ALIMENTATION_SIMULEE === '1' || env.CYBERPINBALL_HORS_ECRAN === '1' || offscreenMode(env) || TEST_VARS.some((name) => Boolean(env[name]));
}

/** Exécuteur des essais : il journalise l'étape et répond qu'elle a réussi. */
export function simulatedPowerExecutor(log: (line: string) => void): PowerExecutor {
  return async (step) => {
    log(`Alimentation simulée : ${describePowerStep(step)}`); // i18n-ignore : journal des essais
    return { ok: true, simulated: true };
  };
}

/** Exécuteur de cet environnement ; le réel (`real`) n'est construit que hors de tout essai. */
export function powerExecutor(env: NodeJS.ProcessEnv, real: () => PowerExecutor, log: (line: string) => void): PowerExecutor {
  return powerSimulated(env) ? simulatedPowerExecutor(log) : real();
}

/** Horloge et minuteries, remplacées dans les essais. */
export interface PowerClock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const SYSTEM_CLOCK: PowerClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => {
    const handle = setTimeout(run, ms);
    // Une action programmée ne retient pas l'application ouverte.
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * Une action programmée n'attend jamais plus d'une minute d'un coup : l'heure est relue à
 * chaque fois, une veille (minuteries suspendues) ou un changement d'heure ne la décale pas.
 */
export const POWER_TIMER_STEP_MS = 60_000;
/**
 * Au-delà, une action programmée est manquée, pas rattrapée : une borne restée en veille
 * pendant l'heure d'extinction ne s'éteint pas à son réveil.
 */
export const POWER_MISSED_AFTER_MS = 5 * 60_000;
/** Une action qui attend la borne libre (`ready`) relit son état à ce rythme. */
export const POWER_READY_STEP_MS = 1000;

/** Préavis avant une action programmée : affiché pendant `ms`, retiré au moindre bouton. */
export interface PowerNotice {
  ms: number;
  /** Préavis affiché (`endsAt` : heure de l'action, horloge du module), ou retiré (undefined). */
  show(endsAt: number | undefined): void;
}

export interface PowerScheduleOptions {
  /**
   * L'heure est passée de plus de POWER_MISSED_AFTER_MS sans que l'horloge ait tourné (borne en
   * veille, PC arrêté), ou `until` est dépassé : rien n'est fait.
   */
  onMissed?: (action: PowerAction, at: number) => void;
  /** Après l'action (réveil après la veille, refus de Windows). */
  onDone?: (outcome: PowerOutcome) => void;
  /**
   * La borne est-elle libre ? Une partie en cours, un bouton récent retiennent l'action : passé
   * l'heure, elle attend que ce soit vrai (relu toutes les POWER_READY_STEP_MS).
   */
  ready?: () => boolean;
  /** Au-delà de cette heure, une action retenue n'est plus faite : manquée (fin de la nuit). */
  until?: number;
  /** Préavis : l'action n'est faite qu'après lui, la borne restée libre tout du long. */
  notice?: PowerNotice;
}

export interface ScheduledPower {
  readonly action: PowerAction;
  /** Heure prévue (ms depuis 1970). */
  readonly at: number;
  /** Vrai tant qu'elle n'a été ni faite, ni manquée, ni annulée. */
  readonly pending: boolean;
  cancel(): void;
}

export interface PowerHost {
  executor: PowerExecutor;
  /** Ce que sait faire ce PC ; sans réponse, tout est permis. */
  capabilities?(): PowerCapabilities;
  /**
   * Avant d'agir : écran noir qui dit ce qui se passe, réglages enregistrés, barres des
   * tâches rendues. L'action attend sa fin.
   */
  prepare(action: PowerAction): void | Promise<void>;
  /**
   * Après l'exécuteur, avant de rendre la main : l'arrêt de Windows qui ferme l'application, ou
   * qui ne vient pas. Toute action y passe, demandée au menu ou programmée.
   */
  settle?(action: PowerAction, outcome: PowerOutcome): Promise<PowerOutcome>;
  clock?: PowerClock;
}

/** Pourquoi cette action est impossible sur ce PC (déjà traduit), ou undefined. */
export function powerUnavailable(action: PowerAction, capabilities: PowerCapabilities | undefined): string | undefined {
  if (action === 'sleep' && capabilities && !capabilities.sleep) {
    return t('Ce PC utilise la veille moderne, que Cyber Pinball ne peut pas demander à Windows. Pour le mettre en veille : le menu Démarrer de Windows, ou le bouton d’alimentation du PC.');
  }
  return undefined;
}

export function createPowerControl(host: PowerHost) {
  const clock = host.clock ?? SYSTEM_CLOCK;
  const scheduled: Array<ScheduledPower & { handle?: unknown }> = [];
  let running: Promise<PowerOutcome> | undefined;

  /** Fait l'action tout de suite : préparation, puis l'exécuteur. Une seule à la fois. */
  function run(action: PowerAction): Promise<PowerOutcome> {
    const refused = powerUnavailable(action, host.capabilities?.());
    if (refused) return Promise.resolve({ ok: false, problem: refused });
    if (running) return running;
    running = (async () => {
      await host.prepare(action);
      let outcome: PowerOutcome;
      try {
        outcome = await host.executor(powerStep(action));
      } catch (error) {
        outcome = { ok: false, problem: error instanceof Error ? error.message : String(error) };
      }
      return host.settle ? host.settle(action, outcome) : outcome;
    })().finally(() => (running = undefined));
    return running;
  }

  /**
   * Programme l'action à l'heure `at` (ms depuis 1970) ; `cancel()` l'annule. Avec `ready`, elle
   * attend ensuite la borne libre ; avec `notice`, elle s'annonce avant d'agir.
   */
  function schedule(action: PowerAction, at: number, options: PowerScheduleOptions = {}): ScheduledPower {
    let state: 'pending' | 'done' | 'cancelled' = 'pending';
    /** Dernier passage de la minuterie : un écart plus grand que POWER_MISSED_AFTER_MS, c'est une veille. */
    let lastTick: number | undefined;
    /** Fin du préavis en cours. */
    let noticeEnds: number | undefined;
    const withdraw = () => {
      if (noticeEnds === undefined) return;
      noticeEnds = undefined;
      options.notice?.show(undefined);
    };
    const entry: ScheduledPower & { handle?: unknown } = {
      action,
      at,
      get pending() {
        return state === 'pending';
      },
      cancel() {
        if (state !== 'pending') return;
        state = 'cancelled';
        if (entry.handle !== undefined) clock.clearTimeout(entry.handle);
        withdraw();
        forget();
      },
    };
    const forget = () => {
      const i = scheduled.indexOf(entry);
      if (i >= 0) scheduled.splice(i, 1);
    };
    const later = (ms: number) => (entry.handle = clock.setTimeout(arm, ms));
    const arm = () => {
      entry.handle = undefined;
      if (state !== 'pending') return;
      const now = clock.now();
      if (now < at) {
        lastTick = now;
        later(Math.min(at - now, POWER_TIMER_STEP_MS));
        return;
      }
      // Avant l'heure, l'écart se compte depuis l'heure prévue ; ensuite, depuis le dernier passage.
      const gap = now - Math.max(lastTick ?? at, at);
      lastTick = now;
      if (gap > POWER_MISSED_AFTER_MS || (options.until !== undefined && now > options.until)) {
        state = 'done';
        withdraw();
        forget();
        return options.onMissed?.(action, at);
      }
      if (options.ready && !options.ready()) {
        // Quelqu'un joue (ou vient d'appuyer) : le préavis s'efface, l'action attend.
        withdraw();
        later(POWER_READY_STEP_MS);
        return;
      }
      if (options.notice && noticeEnds === undefined) {
        noticeEnds = now + options.notice.ms;
        options.notice.show(noticeEnds);
      }
      if (noticeEnds !== undefined && now < noticeEnds) {
        later(Math.min(noticeEnds - now, POWER_READY_STEP_MS));
        return;
      }
      state = 'done';
      // Le préavis laisse la place à l'écran noir de l'action (prepare).
      withdraw();
      forget();
      void run(action).then((outcome) => options.onDone?.(outcome));
    };
    scheduled.push(entry);
    arm();
    return entry;
  }

  return {
    run,
    schedule,
    /** Actions programmées pas encore faites, de la plus proche à la plus lointaine. */
    scheduled: (): ScheduledPower[] => [...scheduled].sort((a, b) => a.at - b.at),
    /** Une action est en cours (préparation ou exécution). */
    get busy() {
      return running !== undefined;
    },
  };
}

export type PowerControl = ReturnType<typeof createPowerControl>;

/** Textes de chaque action : entrée du menu, écran de confirmation, écran noir pendant l'action. */
export interface PowerTexts {
  /** Entrée du menu système et bouton qui confirme. */
  label: string;
  detail: string;
  /** Titre de l'écran de confirmation. */
  question: string;
  /** Ce qui va se passer, dans l'ordre. */
  steps: string[];
  /** Ce que fait Start, puis Exit, au pied de l'écran. */
  hint: string;
  /** Titre et ligne de l'écran noir, le temps que Windows prenne la main. */
  progress: string;
  progressLine: string;
  /** Constat d'un essai, au retour au menu (la commande reste dans le journal). */
  simulated: string;
}

export function powerTexts(action: PowerAction): PowerTexts {
  switch (action) {
    case 'shutdown':
      return {
        label: t('Éteindre la borne'),
        detail: t('Ferme Cyber Pinball, puis éteint le PC'),
        question: t('Éteindre la borne ?'),
        steps: [
          t('Cyber Pinball enregistre ses réglages et se ferme.'),
          t('Windows éteint le PC.'),
          t('Pour rallumer la borne, appuyez sur le bouton d’alimentation du PC.'),
        ],
        hint: t('Start : éteindre · Exit : annuler'),
        progress: t('Extinction de la borne…'),
        progressLine: t('Réglages enregistrés. Arrêt de Windows en cours.'),
        simulated: t('Mode essai : extinction simulée, le PC reste allumé.'),
      };
    case 'sleep':
      return {
        label: t('Mettre en veille'),
        detail: t('Écrans et PC en veille ; le menu revient au réveil'),
        question: t('Mettre la borne en veille ?'),
        steps: [
          t('Cyber Pinball enregistre ses réglages et reste ouvert.'),
          t('Le PC et les écrans passent en veille.'),
          t('Pour reprendre, appuyez sur le bouton d’alimentation du PC. Le menu revient au réveil.'),
        ],
        hint: t('Start : mettre en veille · Exit : annuler'),
        progress: t('Mise en veille…'),
        progressLine: t('Réglages enregistrés ; le menu revient au réveil.'),
        simulated: t('Mode essai : mise en veille simulée, le PC reste allumé.'),
      };
    case 'restart':
      return {
        label: t('Redémarrer la borne'),
        detail: t('Ferme Cyber Pinball, puis redémarre le PC'),
        question: t('Redémarrer la borne ?'),
        steps: [
          t('Cyber Pinball enregistre ses réglages et se ferme.'),
          t('Windows redémarre le PC.'),
          t('Cyber Pinball revient seul s’il démarre avec Windows (option de l’installation).'),
        ],
        hint: t('Start : redémarrer · Exit : annuler'),
        progress: t('Redémarrage de la borne…'),
        progressLine: t('Réglages enregistrés. Redémarrage de Windows en cours.'),
        simulated: t('Mode essai : redémarrage simulé, le PC reste allumé.'),
      };
  }
}
