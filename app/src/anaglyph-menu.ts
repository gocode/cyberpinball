// Lunettes 3D dans le front-end : l'entrée du Menu système (Ma borne > Réalité virtuelle et vision 3D),
// son écran (activer, lunettes, profondeur, couleurs), le calibrage des lunettes aux boutons de la
// borne, et ce que le lancement d'une partie lui demande (prepareGame, restoreGame). Le réglage et la
// copie du fichier de la table sont dans anaglyph.ts, la logique dans packages/core/src/anaglyph.ts.
import * as path from 'node:path';
import {
  adjustCalibration,
  anaglyphWheelRelief,
  wheelReliefLabel,
  anaglyphCalibrationView,
  anaglyphFilters,
  anaglyphMenuText,
  ANAGLYPH_CALIBRATION_STEPS,
  buttonInfo,
  calibrationDelta,
  calibrationStepOf,
  colorsLabel,
  depthLabel,
  glassesLabel,
  nextColors,
  nextDepth,
  nextGlasses,
  findTableIni,
  nvidia3dVisionIssues,
  nvidia3dVisionOutcome,
  nvidia3dVisionOutcomeText,
  nvidia3dVisionReadyText,
  nvidia3dVisionUnchecked,
  stereoGlassesKindLabel,
  SYSTEM_ITEMS,
  t,
  type AnaglyphCalibration,
  type AnaglyphSetting,
  type NavigationKeys,
  type Nvidia3dVisionFacts,
  type Nvidia3dVisionOutcome,
} from '@cyberpinball/core';
import type { Input } from 'electron';
import { markVpxLog, prepareAnaglyphGame, readAnaglyph, readNvidiaOutcome, readVpxLogSince, restoreAnaglyphGame, writeAnaglyph, writeNvidiaOutcome, type AnaglyphGame, type VpxLogMark } from './anaglyph';
import type { createLibrary, Row } from './library';
import type { StereoChange } from './nvidia-3dvision';

/** Ce que le front-end prête aux Lunettes 3D. */
export interface AnaglyphMenuContext {
  /** Dossier des données de Cyber Pinball. */
  dataDir: string;
  library: ReturnType<typeof createLibrary>;
  /** Touches de l'interface de la borne (flippers, Start, Exit et leurs touches de secours). */
  keys(): NavigationKeys;
  /** La Vision 3D est activée : les deux se cumulent, l'écran le dit. */
  vision3dOn(): boolean;
  /** La VR est activée (une partie dans le casque se joue sans les lunettes). */
  vrOn(): boolean;
  /**
   * Lunettes actives NVIDIA 3D Vision : pilote, stéréo, émetteur, écran, VPX (nvidia-3dvision.ts) ; `fresh`
   * relit le pilote ; `inis` : les réglages que la partie lira (fichier de la table d'abord).
   */
  nvidia(fresh?: boolean, inis?: string[]): Nvidia3dVisionFacts;
  /** Relit le pilote NVIDIA sans bloquer (avant une partie) ; `nvidia()` rend ensuite ce relevé. */
  refreshNvidia(): Promise<void>;
  /** Met la 3D stéréoscopique globale du pilote dans l'état voulu, puis la relit (nvidia-3dvision.ts, stereoFor). */
  stereo(wanted: boolean): Promise<StereoChange>;
  /** Le journal de VPX de la version jouée (vpinball.log), pour le bilan d'une partie en 3D Vision. */
  vpxLog(): string | undefined;
}

/** Place de « Calibrer les lunettes » dans les réglages (après Activer, le type et les couleurs des verres). */
const CALIBRATE_ROW = 3;

export function createAnaglyphMenu(ctx: AnaglyphMenuContext) {
  const { dataDir, library } = ctx;
  let setting = readAnaglyph(dataDir);

  library.provideSystemItem('anaglyph', {
    badge: 'beta',
    get label() {
      return anaglyphMenuText(setting).label;
    },
    get detail() {
      return anaglyphMenuText(setting).detail;
    },
    run: () => openScreen(),
  });

  function save(change: Partial<AnaglyphSetting>, journal: string): void {
    setting = { ...readAnaglyph(dataDir), ...change };
    // Les lunettes changées : leur calibrage ne vaut plus, on repart des valeurs d'usine.
    if ('calibration' in change && change.calibration === undefined) delete setting.calibration;
    writeAnaglyph(dataDir, setting);
    console.log(`Lunettes 3D : ${journal}.`); // i18n-ignore : journal
  }

  /** Le type de lunettes, en tête des réglages des deux écrans. */
  const kindAction = () => ({
    label: t('Lunettes : {kind}', { kind: stereoGlassesKindLabel(setting.kind) }),
    detail: t('Choisir pour passer des lunettes à filtres colorés aux lunettes actives NVIDIA 3D Vision (bêta), et inversement'),
    icon: 'glasses' as const,
    run: () => {
      const kind = setting.kind === 'nvidia' ? 'anaglyph' : 'nvidia';
      save({ kind }, `lunettes ${kind}`);
      if (kind === 'nvidia') ctx.nvidia(true);
      openScreen(library.cursor());
    },
  });

  const depthAction = () => ({
    label: t('Profondeur : {v}', { v: depthLabel(setting.depth) }),
    detail: t('Choisir pour la changer, de 50 % (douce) à 150 % (marquée) ; 100 % : l’écart réel entre tes yeux'),
    icon: 'gauge' as const,
    run: () => {
      save({ depth: nextDepth(setting.depth) }, `profondeur ${depthLabel(nextDepth(setting.depth))}`);
      openScreen(library.cursor());
    },
  });

  /** Écran « Lunettes 3D » : état, cumul avec la Vision 3D, et les réglages. */
  function openScreen(at = 0): void {
    const back = () => library.openSystem();
    library.openCustom(() => {
      if (setting.kind === 'nvidia') return nvidiaScreen(back);
      const on = setting.mode === 'on';
      const rows: Row[] = [
        { icon: 'glasses', text: on ? t('Lunettes 3D activées : les tables se jouent en relief') : t('Lunettes 3D désactivées'), tone: on ? ('ok' as const) : ('quiet' as const) },
        setting.calibration
          ? { icon: 'check', text: t('Lunettes {glasses}, calibrées pour cet écran', { glasses: glassesLabel(setting.glasses) }), tone: 'ok' as const }
          : { icon: 'info', text: t('Lunettes {glasses}, réglages d’usine', { glasses: glassesLabel(setting.glasses) }), detail: t('Calibre-les : moins d’images fantômes, des couleurs plus justes'), tone: 'quiet' as const },
      ];
      if (on && ctx.vision3dOn()) rows.push({ icon: 'eye', text: t('Avec la Vision 3D : le relief suit aussi ta tête'), tone: 'ok' as const });
      if (on && ctx.vrOn()) rows.push({ icon: 'vr', text: t('Une partie dans le casque se joue sans les lunettes'), tone: 'quiet' as const });
      const actions = [
        {
          label: on ? t('Désactiver les lunettes 3D') : t('Activer les lunettes 3D'),
          icon: 'power' as const,
          run: () => {
            save({ mode: on ? 'off' : 'on' }, on ? 'désactivées' : 'activées'); // i18n-ignore : journal
            openScreen(library.cursor());
          },
        },
        kindAction(),
        {
          label: t('Couleurs des verres : {glasses}', { glasses: glassesLabel(setting.glasses) }),
          detail: t('Choisir pour changer de couleurs ; le calibrage repart des réglages d’usine'),
          icon: 'palette' as const,
          run: () => {
            const glasses = nextGlasses(setting.glasses);
            save({ glasses, calibration: undefined }, `lunettes ${glasses}`);
            openScreen(library.cursor());
          },
        },
        {
          label: t('Calibrer les lunettes'),
          detail: t('Avec tes lunettes, devant cet écran : six réglages, un œil fermé à chaque fois'),
          icon: 'sliders' as const,
          run: () => openCalibration(),
        },
        depthAction(),
        {
          label: t('Couleurs : {v}', { v: colorsLabel(setting.colors) }),
          detail: t('Confortables : ce qu’un seul œil verrait passe en gris, moins de fatigue ; vives : toutes les couleurs, plus d’images fantômes'),
          icon: 'eye' as const,
          run: () => {
            save({ colors: nextColors(setting.colors) }, `couleurs ${nextColors(setting.colors)}`);
            openScreen(library.cursor());
          },
        },
        {
          label: t('Roue en relief : {v}', { v: wheelReliefLabel(setting.wheel) }),
          detail: t('La roue, ses médaillons et la navigation sortent de l’écran ; le fond de la table reste à plat'),
          icon: 'layers' as const,
          run: () => {
            save({ wheel: !setting.wheel }, `roue en relief ${setting.wheel ? 'désactivée' : 'activée'}`); // i18n-ignore : journal
            openScreen(library.cursor());
          },
        },
        ...(setting.calibration
          ? [
              {
                label: t('Revenir aux réglages d’usine'),
                detail: t('Oublie le calibrage de ces lunettes'),
                icon: 'restore' as const,
                run: () => {
                  save({ calibration: undefined }, 'calibrage oublié'); // i18n-ignore : journal
                  openScreen(library.cursor());
                },
              },
            ]
          : []),
        { label: t('Retour'), icon: 'back' as const, run: back },
      ];
      return {
        heading: SYSTEM_ITEMS.anaglyph.label,
        icon: SYSTEM_ITEMS.anaglyph.icon,
        lead: t('La table en relief avec des lunettes à filtres colorés. Avec la Vision 3D, le relief suit aussi ta tête. Seul le plateau est en relief : le fronton et le DMD restent à plat.'),
        sections: [{ rows }],
        actions,
        back,
      };
    }, at);
  }

  /** Bilan de la dernière partie en 3D Vision (journal de VPX), gardé d'un démarrage à l'autre. */
  let nvidiaOutcome: Nvidia3dVisionOutcome | undefined = readNvidiaOutcome(dataDir);
  /** Le journal de VPX au lancement d'une partie en 3D Vision : seul ce qui s'y ajoute ensuite compte. */
  let nvidiaLogStart: VpxLogMark | undefined;

  /** Rien ne manque : ce qui a été vérifié, ou ce qui n'a pas pu l'être (jamais affirmé). */
  function nvidiaReadyRow(facts: Nvidia3dVisionFacts): Row {
    const r = nvidia3dVisionReadyText(facts);
    return { icon: r.complete ? 'check' : 'info', text: r.text, detail: r.detail, tone: r.complete ? 'ok' : 'warning' };
  }

  /**
   * Écran « Lunettes 3D » avec les lunettes actives NVIDIA 3D Vision : la détection (pilote, stéréo,
   * émetteur, écran principal), une ligne et sa marche à suivre par manque, le bilan de la dernière
   * partie, et les réglages qui valent pour elles (activer, type de lunettes, profondeur).
   */
  function nvidiaScreen(back: () => void) {
    const on = setting.mode === 'on';
    const facts = ctx.nvidia();
    const issues = nvidia3dVisionIssues(facts);
    const rows: Row[] = [
      { icon: 'glasses', text: on ? t('Lunettes 3D activées : les tables se jouent en relief') : t('Lunettes 3D désactivées'), tone: on ? ('ok' as const) : ('quiet' as const) },
      ...(issues.length
        ? issues.map((issue) => ({ icon: 'alert' as const, text: issue.title, detail: issue.steps.join(t(' ; ')), tone: 'warning' as const }))
        : [nvidiaReadyRow(facts)]),
    ];
    if (nvidiaOutcome) {
      const o = nvidia3dVisionOutcomeText(nvidiaOutcome);
      rows.push({ icon: o.tone === 'ok' ? 'check' : 'info', text: o.text, detail: o.detail, tone: o.tone });
    }
    rows.push({ icon: 'info', text: t('Écran pas reconnu pour la 3D ?'), detail: t('Le pilote ne montre la 3D que sur un écran qu’il connaît : CRU et NvTimingsEd lui font accepter le tien'), tone: 'quiet' as const });
    if (on && issues.length) rows.push({ icon: 'info', text: t('Tant qu’il manque quelque chose, les parties se jouent à plat'), tone: 'quiet' as const });
    if (on && ctx.vrOn()) rows.push({ icon: 'vr', text: t('Une partie dans le casque se joue sans les lunettes'), tone: 'quiet' as const });
    return {
      heading: SYSTEM_ITEMS.anaglyph.label,
      icon: SYSTEM_ITEMS.anaglyph.icon,
      lead: t('Lunettes actives NVIDIA 3D Vision (bêta) : chaque œil voit la table à la pleine définition. Il faut une carte GeForce, le pilote NVIDIA 452.06 au plus avec son pilote 3D, l’émetteur, et le playfield en écran principal. Cyber Pinball active la 3D du pilote pour chaque partie en relief et la coupe après. Le fronton et le DMD restent à plat.'),
      sections: [{ rows }],
      actions: [
        {
          label: on ? t('Désactiver les lunettes 3D') : t('Activer les lunettes 3D'),
          icon: 'power' as const,
          run: () => {
            save({ mode: on ? 'off' : 'on' }, on ? 'désactivées' : 'activées'); // i18n-ignore : journal
            openScreen(library.cursor());
          },
        },
        kindAction(),
        depthAction(),
        {
          label: t('Vérifier à nouveau'),
          detail: t('Relit le pilote NVIDIA, l’émetteur et les écrans'),
          icon: 'restore' as const,
          run: () => {
            ctx.nvidia(true);
            openScreen(library.cursor());
          },
        },
        { label: t('Retour'), icon: 'back' as const, run: back },
      ],
      back,
    };
  }

  /**
   * Calibrage des lunettes (le même que celui de VPX, packages/core/src/anaglyph.ts) : six étapes,
   * les flippers éclaircissent ou assombrissent le gris, Start passe à l'étape suivante, Exit revient
   * à la précédente. Rien n'est gardé avant la dernière étape ; Exit à la première abandonne.
   */
  function openCalibration(): void {
    let step = 0;
    let cal: AnaglyphCalibration = anaglyphFilters(setting);
    const k = ctx.keys();
    const name = (codes: string[], id: 'leftFlipper' | 'rightFlipper' | 'start' | 'exit') => (codes.length ? buttonInfo(id).label : '');
    const finish = () => {
      save({ calibration: cal }, `calibrées (gauche ${cal.left.join(' / ')}, droite ${cal.right.join(' / ')})`); // i18n-ignore : journal
      openScreen(CALIBRATE_ROW);
    };
    const show = () =>
      library.openCustom(() => {
        const { eye, channel } = calibrationStepOf(step);
        const view = anaglyphCalibrationView(cal, step);
        const color = [t('rouge'), t('vert'), t('bleu')][channel]!;
        const last = step === ANAGLYPH_CALIBRATION_STEPS - 1;
        return {
          heading: t('Calibrer les lunettes'),
          icon: 'glasses' as const,
          subheading: t('Étape {n} sur {total} : œil {eye}, {color}', { n: step + 1, total: ANAGLYPH_CALIBRATION_STEPS, eye: eye === 'left' ? t('gauche') : t('droit'), color }),
          sections: [],
          anaglyph: {
            ...view,
            lines: [
              eye === 'left' ? t('Garde tes lunettes et ferme l’œil droit.') : t('Garde tes lunettes et ferme l’œil gauche.'),
              t('Règle le gris jusqu’à ce qu’aucun des deux visages ne ressorte plus que l’autre.'),
              t('Gris : {p} %', { p: view.percent }),
            ],
          },
          hint: t('{previous} / {next} : assombrir ou éclaircir (maintenir pour aller vite) · {confirm} : {then} · {exit} : {before}', {
            previous: name(k.previous, 'leftFlipper'),
            next: name(k.next, 'rightFlipper'),
            confirm: name(k.confirm, 'start'),
            exit: name(k.exit, 'exit'),
            then: last ? t('terminer') : t('étape suivante'),
            before: step === 0 ? t('abandonner') : t('étape précédente'),
          }),
          actions: [
            {
              label: last ? t('Terminer et enregistrer') : t('Étape suivante'),
              icon: last ? ('check' as const) : ('chevron-right' as const),
              run: () => {
                if (last) return finish();
                step++;
                show();
              },
            },
            { label: t('Abandonner'), icon: 'close' as const, run: () => openScreen(CALIBRATE_ROW) },
          ],
          keys: (input: Input) => {
            if (input.type !== 'keyDown') return false;
            const dir = k.previous.includes(input.code) || input.code === 'ArrowLeft' ? -1 : k.next.includes(input.code) || input.code === 'ArrowRight' ? 1 : 0;
            if (!dir) return false;
            cal = adjustCalibration(cal, step, calibrationDelta(Boolean(input.isAutoRepeat), dir));
            return true;
          },
          back: () => {
            if (step === 0) return openScreen(CALIBRATE_ROW);
            step--;
            show();
          },
        };
      }, 0);
    console.log('Lunettes 3D : calibrage ouvert.'); // i18n-ignore : journal
    show();
  }

  /**
   * Partie en relief : la copie du fichier de la table à passer par -TableIni, ou undefined
   * (désactivées). `gameIni` : le VPinballX.ini que VPX recevra. Jamais pour une partie dans le casque.
   */
  async function prepareGame(tableFile: string, gameIni: string): Promise<AnaglyphGame | undefined> {
    setting = readAnaglyph(dataDir);
    if (setting.mode !== 'on') return undefined;
    if (setting.kind === 'nvidia') {
      // Un manque que le front-end voit : VPX montrerait les deux vues côte à côte, la partie se joue à plat.
      // Vérifié sur les réglages que cette partie lira : le fichier de la table, puis son VPinballX.ini.
      const inis = [findTableIni(tableFile).path, gameIni];
      await ctx.refreshNvidia();
      let facts = ctx.nvidia(false, inis);
      // Rien d'autre ne manque et la stéréo globale est coupée (au démarrage du PC, ou par Cyber Pinball après
      // la partie précédente) : activée pour cette partie, coupée après (restoreGame).
      if (facts.nvapi && facts.stereo === false && !nvidia3dVisionIssues(facts).length) {
        const change = await ctx.stereo(true);
        console.log(
          change.after
            ? 'Lunettes 3D : 3D stéréoscopique du pilote activée par Cyber Pinball pour la partie.' // i18n-ignore : journal
            : `Lunettes 3D : 3D stéréoscopique demandée au pilote (code ${change.change ?? '?'}), restée coupée : 3D Fix Manager ouvert, « Enable 3D » sur Off ?`, // i18n-ignore : journal
        );
        facts = ctx.nvidia(false, inis);
      }
      const issues = nvidia3dVisionIssues(facts);
      if (issues.length) {
        console.log(`Lunettes 3D : NVIDIA 3D Vision choisie, mais ${issues.map((i) => i.id).join(', ')} ; partie à plat.`); // i18n-ignore : journal
        return undefined;
      }
      const unchecked = nvidia3dVisionUnchecked(facts);
      if (unchecked.length) console.log(`Lunettes 3D : NVIDIA 3D Vision, pas vérifié : ${unchecked.join(', ')} ; partie tentée quand même.`); // i18n-ignore : journal
      nvidiaLogStart = markVpxLog(ctx.vpxLog());
    }
    try {
      const game = prepareAnaglyphGame(dataDir, setting, tableFile, gameIni);
      if (setting.kind === 'nvidia') {
        console.log(`Lunettes 3D : partie en relief, NVIDIA 3D Vision en mode direct (profondeur ${depthLabel(setting.depth)}) ; copie de ${path.basename(game.original)}${game.existed ? '' : ' (absent)'} passée par -TableIni.`); // i18n-ignore : journal
        return game;
      }
      const fxaa = game.settings.some((s) => s.key === 'FXAA') ? ', anticrénelage SMAA remplacé par FXAA qualité (VPX n’applique pas SMAA en stéréo)' : ''; // i18n-ignore : journal
      console.log(`Lunettes 3D : partie en relief (lunettes ${setting.glasses}${setting.calibration ? ', calibrées' : ''}, profondeur ${depthLabel(setting.depth)}, couleurs ${setting.colors}${fxaa}) ; copie de ${path.basename(game.original)}${game.existed ? '' : ' (absent)'} passée par -TableIni.`); // i18n-ignore : journal
      return game;
    } catch (error) {
      console.log(`Lunettes 3D : activées, mais réglages de la partie pas écrits (${(error as Error).message}) ; partie sans relief.`); // i18n-ignore : journal
      return undefined;
    }
  }

  /** La partie se joue en relief avec les lunettes NVIDIA (la stéréo globale du pilote lui sert). */
  function nvidiaGame(game: AnaglyphGame | undefined): boolean {
    return Boolean(game?.settings.some((s) => s.key === 'Stereo3DNvidiaDirect'));
  }

  /**
   * Toute partie qui ne se joue pas en relief NVIDIA : la 3D stéréoscopique globale du pilote coupée avant
   * que VPX ne crée son affichage. Active, le pilote passe la partie en 3D automatique et des éléments
   * des tables disparaissent (essai sur la borne, 24/11/2026). Rien sans pilote 3D.
   */
  async function flatGame(): Promise<void> {
    await stereoOff('avant une partie à plat'); // i18n-ignore : journal
  }

  async function stereoOff(when: string): Promise<void> {
    const change = await ctx.stereo(false);
    if (change.change === undefined) return;
    console.log(
      change.after === false
        ? `Lunettes 3D : 3D stéréoscopique du pilote coupée ${when}.` // i18n-ignore : journal
        : `Lunettes 3D : 3D stéréoscopique du pilote coupée ${when} (code ${change.change}), mais toujours active : 3D Fix Manager ouvert, « Enable 3D » sur On ? Une partie à plat perd des éléments de la table.`, // i18n-ignore : journal
    );
  }

  /** Après une partie en relief : les réglages de la table enregistrés en jeu reviennent dans son fichier. */
  function restoreGame(game: AnaglyphGame): void {
    if (nvidiaGame(game)) {
      noteNvidiaOutcome();
      // La stéréo globale ne reste jamais active hors d'une partie en relief.
      void stereoOff('après la partie en relief'); // i18n-ignore : journal
    }
    try {
      const n = restoreAnaglyphGame(game);
      if (n) console.log(`Lunettes 3D : ${n} réglage(s) de la table changé(s) pendant la partie, reporté(s) dans ${path.basename(game.original)}.`); // i18n-ignore : journal
    } catch (error) {
      console.log(`Lunettes 3D : réglages de la table changés en jeu pas reportés (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  /**
   * Après une partie en 3D Vision : ce que VPX en a écrit dans son journal depuis son lancement (jamais
   * le bilan d'une partie précédente). Rien d'écrit : le bilan devient « inconnu ».
   */
  function noteNvidiaOutcome(): void {
    const start = nvidiaLogStart;
    nvidiaLogStart = undefined;
    let outcome: Nvidia3dVisionOutcome = { state: 'unknown', line: '' };
    try {
      const text = readVpxLogSince(ctx.vpxLog(), start);
      outcome = (text !== undefined && nvidia3dVisionOutcome(text)) || outcome;
    } catch (error) {
      console.log(`Lunettes 3D : journal de VPX illisible pour le bilan 3D Vision (${(error as Error).message}).`); // i18n-ignore : journal
    }
    nvidiaOutcome = outcome;
    writeNvidiaOutcome(dataDir, outcome);
    console.log(outcome.state === 'unknown' ? 'Lunettes 3D : NVIDIA 3D Vision, rien au journal de VPX pour cette partie.' : `Lunettes 3D : NVIDIA 3D Vision, bilan de la partie : ${outcome.state} (${outcome.line}).`); // i18n-ignore : journal
  }

  return {
    /** Le réglage en vigueur (relu à chaque changement). */
    setting: () => setting,
    /** La roue en relief, pour l'état du playfield : les lunettes et le côté de leurs verres, ou undefined. */
    wheelRelief: () => anaglyphWheelRelief(setting),
    prepareGame,
    restoreGame,
    nvidiaGame,
    flatGame,
  };
}
