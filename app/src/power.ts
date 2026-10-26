// Éteindre, mettre en veille, redémarrer la borne depuis le menu système (rubrique Borne).
// Chaque entrée ouvre un écran de confirmation qui dit ce qui va se passer : Start confirme,
// Exit annule. La méthode, la simulation des essais et l'action programmée (extinction à
// heure fixe) sont dans packages/core/src/power.ts ; ici, l'exécuteur réel et l'enchaînement
// avec le menu.
//
// Pas de bureau entre Cyber Pinball et Windows : avant l'action, le menu passe sur un écran
// noir qui dit ce qui se passe, enregistre ses réglages et rend les barres des tâches, mais
// garde ses fenêtres et ses voiles. Windows ferme l'application en s'arrêtant, une fois son
// propre écran d'arrêt affiché. À la veille, le menu reste ouvert et revient tel quel au réveil.

import { spawn } from 'node:child_process';
import {
  createPowerControl,
  describePowerStep,
  powerExecutor,
  powerSimulated,
  powerTexts,
  powerUnavailable,
  t,
  type IconName,
  type PowerAction,
  type PowerCapabilities,
  type PowerClock,
  type PowerExecutor,
  type PowerOutcome,
} from '@cyberpinball/core';
import { suspendAllowed, suspendSystem } from '@cyberpinball/win-displays';
import type { Built, ProvidedSystemItem } from './library';

const ICONS: Readonly<Record<PowerAction, IconName>> = { shutdown: 'power', sleep: 'moon', restart: 'restart' };

/** Windows ferme l'application en s'arrêtant ; passé ce délai, l'arrêt n'est pas venu. */
const SHUTDOWN_WAIT_MS = 60_000;
/** En essai, le temps de capturer l'écran noir. */
const SIMULATED_WAIT_MS = 2_500;

export interface PowerMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  /**
   * Avant l'action : écran noir de l'action (`title`, `line`) sur le menu, réglages
   * enregistrés, barres des tâches rendues ; résolu une fois l'écran peint.
   */
  prepare(action: PowerAction, title: string, line: string): Promise<void>;
  /** Après l'action : réveil, refus de Windows, arrêt qui n'est pas venu, fin d'un essai. */
  finish(action: PowerAction, outcome: PowerOutcome): void;
  /** Efface le constat en cours (celui d'un essai précédent) : il ne doit pas parler d'une autre action. */
  clearNotice(): void;
  log(line: string): void;
  /** Horloge des actions programmées : celle de l'horaire (décalée dans un essai qui le demande). */
  clock?: PowerClock;
}

/** Exécuteur réel : shutdown.exe, ou la mise en veille par powrprof. Jamais construit en essai. */
function realExecutor(): PowerExecutor {
  return async (step) => {
    if (step.kind === 'suspend') {
      return (await suspendSystem()) ? { ok: true } : { ok: false, problem: t('Windows a refusé la mise en veille.') };
    }
    return new Promise<PowerOutcome>((resolve) => {
      const child = spawn(step.file, step.args, { windowsHide: true, stdio: 'ignore' });
      child.on('error', (error) => resolve({ ok: false, problem: error.message }));
      child.on('exit', (code) => resolve(code === 0 ? { ok: true } : { ok: false, problem: t('{command} a répondu {code}.', { command: describePowerStep(step), code: String(code) }) }));
    });
  };
}

export function createPowerMenu(host: PowerMenuHost) {
  const simulated = powerSimulated(process.env);
  // Essai d'un PC à veille moderne seulement : l'écran qui le dit, sans en avoir un.
  const capabilities = (): PowerCapabilities => ({ sleep: simulated && process.env.CYBERPINBALL_ALIMENTATION_SANS_VEILLE === '1' ? false : suspendAllowed() });
  const control = createPowerControl({
    executor: powerExecutor(process.env, realExecutor, (line) => host.log(line)),
    capabilities,
    clock: host.clock,
    prepare: (action) => {
      const texts = powerTexts(action);
      return host.prepare(action, texts.progress, texts.progressLine);
    },
    // Pour un arrêt, attendre que Windows ferme l'application : demandé au menu ou programmé (horaire).
    settle: async (action, outcome) => {
      // Un essai garde aussi l'écran noir de la veille le temps de sa capture.
      if (!outcome.ok || (action === 'sleep' && !outcome.simulated)) return outcome;
      await new Promise((resolve) => setTimeout(resolve, outcome.simulated ? SIMULATED_WAIT_MS : SHUTDOWN_WAIT_MS));
      if (outcome.simulated) return outcome;
      return {
        ok: false,
        problem:
          action === 'restart'
            ? t('Windows n’a pas redémarré au bout d’une minute : une application l’en empêche peut-être (document non enregistré).')
            : t('Windows ne s’est pas éteint au bout d’une minute : une application l’en empêche peut-être (document non enregistré).'),
      };
    },
  });

  /** Fait l'action ; pour un arrêt, attend que Windows ferme l'application. */
  function act(action: PowerAction): Promise<PowerOutcome> {
    host.log(`Alimentation : ${action} demandé depuis le menu.`); // i18n-ignore : journal
    return control.run(action);
  }

  function confirm(action: PowerAction): void {
    const back = () => host.library.openSystem();
    host.clearNotice();
    host.library.openCustom(() => {
      const texts = powerTexts(action);
      const refused = powerUnavailable(action, capabilities());
      if (refused) {
        return {
          heading: t('Veille indisponible depuis Cyber Pinball'),
          icon: ICONS[action],
          lead: refused,
          sections: [],
          actions: [{ label: t('Retour'), icon: 'back', run: back }],
          back,
        };
      }
      return {
        heading: texts.question,
        icon: ICONS[action],
        sections: [{ title: t('Ce qui va se passer'), rows: texts.steps.map((text) => ({ text })) }],
        actions: [
          { label: texts.label, icon: ICONS[action], run: () => void act(action).then((outcome) => host.finish(action, outcome)) },
          { label: t('Annuler'), icon: 'close', run: back },
        ],
        hint: texts.hint,
        back,
      };
    });
  }

  const item = (action: PowerAction): ProvidedSystemItem => ({
    get detail() {
      return powerUnavailable(action, capabilities()) ? t('Indisponible : ce PC n’a que la veille moderne') : powerTexts(action).detail;
    },
    run: () => confirm(action),
  });

  return {
    /** Actions programmées (horaire de la borne, app/src/arcade-hours.ts) ; `cancel()` les annule. */
    control,
    /** Ce que sait faire ce PC (veille possible ou non). */
    capabilities,
    /** L'action tout de suite, sans confirmation, avec l'attente de Windows après un arrêt. */
    run: act,
    /** Entrées du menu système, rangées par l'arbre (packages/core/src/systemmenu.ts, rubrique Borne). */
    items: { shutdown: item('shutdown'), sleep: item('sleep'), restart: item('restart') } satisfies Record<PowerAction, ProvidedSystemItem>,
  };
}
