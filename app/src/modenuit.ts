// Mode nuit (packages/core/src/modenuit.ts) : ce qui touche la borne. Le son (volume de Windows, par
// les sorties de la configuration), les LED hors partie (luminosité générale du pilote), le voile des
// écrans (posé par frontend.ts, `screenDim`) et, pendant une partie, la config DOF (variante du
// Cabinet.xml, posée au lancement et remise à la fin).
//
// Avant chaque changement, l'état d'avant est écrit au journal (modenuit.json, writeFileAtomic) ;
// `recover()` le relit au démarrage et remet ce qu'un plantage aurait laissé. Hors écran (essais),
// le volume est celui, simulé, de cabinet-volume.ts ; les LED et le DOF passent par l'hôte.

import {
  applyNightDof,
  nightModeOn,
  nightVolumes,
  planNightDof,
  readNightJournal,
  restoreNightDof,
  toggleNightMode,
  volumesToRestore,
  writeNightJournal,
  type DofSetup,
  type NightDofOptions,
  type NightModeSettings,
  type OutputVolume,
} from '@cyberpinball/core';
import { readVolumes, writeVolumes } from './cabinet-volume';

export interface NightModeHost {
  settings(): NightModeSettings;
  /** Est-ce la nuit de l'horaire (arcadehours.ts) ? */
  scheduleNight(): boolean;
  /** Le journal : <données>\modenuit.json. */
  journalFile: string;
  /** Sorties audio de la configuration (étape « Son ») ; vide : sortie par défaut de Windows. */
  outputs(): string[];
  /** Config DOF que libdof lira ; undefined sans VPX. */
  dofSetup(): DofSetup | undefined;
  /** Luminosité des LED hors partie, 0 à 1. */
  ledMaster(level: number): void;
  /** L'état du mode a changé : les écrans se redessinent (voile). */
  changed(): void;
  /** Réglages enregistrés : bouton du mode nuit, nuit de l'horaire finie… */
  save(next: NightModeSettings): void;
  log(line: string): void;
}

export interface NightMode {
  on(): boolean;
  /** Voile des écrans, 0 à 1 ; 0 hors mode nuit. */
  screenDim(): number;
  /** Réglages, horaire ou nuit changés : applique ou remet. */
  refresh(): void;
  /** Le bouton du mode nuit : bascule d'un appui. Vrai : le mode est en marche après l'appui. */
  toggle(): boolean;
  /** Partie en préparation ou en cours (vrai) / terminée (faux), à chaque diffusion ; seuls les changements comptent. */
  game(active: boolean): void;
  /** Pourquoi les toys et les LED ne suivent pas en partie (config DOF écrite à la main), s'il y a lieu. */
  dofRefusal(): string | undefined;
  /** Au démarrage : remet ce qu'un plantage a laissé. */
  recover(): void;
  stop(): void;
}

const options = (s: NightModeSettings): NightDofOptions => ({ toysOff: s.toysOff, ledsOff: s.ledsOff, ledBrightness: s.ledBrightness });

/** Ce qui compte dans les réglages pour ce qui est appliqué : un changement remet puis réapplique. */
const appliedKey = (s: NightModeSettings) => JSON.stringify([s.volume, s.ledBrightness, s.ledsOff, s.toysOff]);

export function createNightMode(host: NightModeHost): NightMode {
  let override: boolean | undefined;
  let lastSchedule = host.scheduleNight();
  let applied: string | undefined;
  let inGame = false;
  let refusal: string | undefined;

  const journalVolumes = () => readNightJournal(host.journalFile)?.volumes;
  const keepJournal = (patch: { volumes?: { before: OutputVolume[]; set: OutputVolume[] } | undefined }) => {
    const j = readNightJournal(host.journalFile);
    const dof = j?.dof;
    writeNightJournal(host.journalFile, { ...(patch.volumes ? { volumes: patch.volumes } : {}), ...(dof ? { dof } : {}) });
  };

  function readSafe(ids: string[]): OutputVolume[] {
    try {
      return readVolumes(ids);
    } catch (error) {
      host.log(`Mode nuit : son de Windows illisible (${(error as Error).message}).`); // i18n-ignore : journal
      return [];
    }
  }

  function restoreVolume(): void {
    const saved = journalVolumes();
    if (!saved) return;
    try {
      const back = volumesToRestore(saved, readSafe(saved.before.map((o) => o.id)));
      if (back.length) writeVolumes(back);
      host.log(`Mode nuit : volume remis (${back.length}/${saved.before.length} sortie(s) ; une sortie réglée aux boutons pendant la nuit reste telle quelle).`); // i18n-ignore : journal
    } catch (error) {
      host.log(`Mode nuit : volume non remis (${(error as Error).message}).`); // i18n-ignore : journal
      return; // le journal reste : une nouvelle tentative au prochain démarrage
    }
    keepJournal({});
  }

  function applyVolume(s: NightModeSettings): void {
    if (s.volume >= 100) return;
    const before = readSafe(host.outputs());
    if (!before.length) return;
    const set = nightVolumes(before, s.volume);
    keepJournal({ volumes: { before, set } }); // l'état d'avant d'abord
    try {
      writeVolumes(set);
      host.log(`Mode nuit : volume à ${s.volume} % (${set.length} sortie(s)).`); // i18n-ignore : journal
    } catch (error) {
      host.log(`Mode nuit : réglage du volume refusé par Windows (${(error as Error).message}).`); // i18n-ignore : journal
      keepJournal({});
    }
  }

  function applyDof(s: NightModeSettings): void {
    refusal = undefined;
    try {
      const plan = planNightDof(host.dofSetup(), options(s));
      if (plan.kind === 'refused') {
        refusal = plan.reason;
        host.log('Mode nuit : config DOF écrite à la main, laissée telle quelle.'); // i18n-ignore : journal
      } else if (plan.kind === 'apply') {
        applyNightDof(host.journalFile, plan);
        host.log('Mode nuit : variante du Cabinet.xml posée pour la partie (toys et LED).'); // i18n-ignore : journal
      }
    } catch (error) {
      host.log(`Mode nuit : config DOF non modifiée (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  function restoreDof(): void {
    try {
      if (restoreNightDof(host.journalFile)) host.log('Mode nuit : config DOF remise.'); // i18n-ignore : journal
    } catch (error) {
      host.log(`Mode nuit : config DOF non remise (${(error as Error).message}) : nouvel essai au prochain démarrage.`); // i18n-ignore : journal
    }
  }

  const wanted = () => nightModeOn(host.settings(), host.scheduleNight(), override);

  const mode: NightMode = {
    on: () => applied !== undefined,
    screenDim: () => (applied !== undefined ? host.settings().screenDim / 100 : 0),
    refresh() {
      // La nuit de l'horaire a changé : le choix du joueur pour la nuit précédente ne vaut plus.
      const night = host.scheduleNight();
      if (night !== lastSchedule) {
        lastSchedule = night;
        override = undefined;
      }
      const s = host.settings();
      const want = wanted();
      const key = want ? appliedKey(s) : undefined;
      if (key === applied) return;
      if (applied !== undefined) {
        restoreVolume();
        restoreDof();
        host.ledMaster(1);
        applied = undefined;
      }
      if (key !== undefined) {
        applyVolume(s);
        host.ledMaster(s.ledsOff ? 0 : s.ledBrightness / 100);
        if (inGame) applyDof(s);
        applied = key;
        host.log(`Mode nuit : en marche (écrans ${s.screenDim} %, son ${s.volume} %, LED ${s.ledsOff ? 'éteintes' : `${s.ledBrightness} %`}, toys ${s.toysOff ? 'coupés' : 'gardés'}).`); // i18n-ignore : journal
      } else {
        refusal = undefined;
        host.log('Mode nuit : terminé, état d’avant remis.'); // i18n-ignore : journal
      }
      host.changed();
    },
    toggle() {
      const s = host.settings();
      const next = toggleNightMode(s, host.scheduleNight(), override);
      override = next.override;
      host.save({ ...s, manual: next.manual });
      mode.refresh();
      return mode.on();
    },
    game(active) {
      if (active === inGame) return;
      inGame = active;
      if (active && applied !== undefined) applyDof(host.settings());
      else if (!active) restoreDof();
    },
    dofRefusal() {
      // Calculé à la demande (l'écran des réglages la montre avant toute partie) ; vide si rien à refuser.
      try {
        const plan = planNightDof(host.dofSetup(), options(host.settings()));
        refusal = plan.kind === 'refused' ? plan.reason : undefined;
      } catch {
        refusal = undefined;
      }
      return refusal;
    },
    recover() {
      restoreDof();
      restoreVolume();
      host.ledMaster(1);
    },
    stop() {
      // Fermeture propre : la config DOF d'avant revient ; le volume reste celui de la nuit si le
      // mode reste réglé (il est remis, ou réappliqué, au démarrage suivant par recover() puis refresh()).
      restoreDof();
    },
  };
  return mode;
}
