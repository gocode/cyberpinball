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
  SYSTEM_ITEMS,
  t,
  type AnaglyphCalibration,
  type AnaglyphSetting,
  type NavigationKeys,
} from '@cyberpinball/core';
import type { Input } from 'electron';
import { prepareAnaglyphGame, readAnaglyph, restoreAnaglyphGame, writeAnaglyph, type AnaglyphGame } from './anaglyph';
import type { createLibrary, Row } from './library';

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
}

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

  /** Écran « Lunettes 3D » : état, cumul avec la Vision 3D, et les réglages. */
  function openScreen(at = 0): void {
    const back = () => library.openSystem();
    library.openCustom(() => {
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
        {
          label: t('Lunettes : {glasses}', { glasses: glassesLabel(setting.glasses) }),
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
        {
          label: t('Profondeur : {v}', { v: depthLabel(setting.depth) }),
          detail: t('Choisir pour la changer, de 50 % (douce) à 150 % (marquée) ; 100 % : l’écart réel entre tes yeux'),
          icon: 'gauge' as const,
          run: () => {
            save({ depth: nextDepth(setting.depth) }, `profondeur ${depthLabel(nextDepth(setting.depth))}`);
            openScreen(library.cursor());
          },
        },
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
      openScreen(2);
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
            { label: t('Abandonner'), icon: 'close' as const, run: () => openScreen(2) },
          ],
          keys: (input: Input) => {
            if (input.type !== 'keyDown') return false;
            const dir = k.previous.includes(input.code) || input.code === 'ArrowLeft' ? -1 : k.next.includes(input.code) || input.code === 'ArrowRight' ? 1 : 0;
            if (!dir) return false;
            cal = adjustCalibration(cal, step, calibrationDelta(Boolean(input.isAutoRepeat), dir));
            return true;
          },
          back: () => {
            if (step === 0) return openScreen(2);
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
  function prepareGame(tableFile: string, gameIni: string): AnaglyphGame | undefined {
    setting = readAnaglyph(dataDir);
    if (setting.mode !== 'on') return undefined;
    try {
      const game = prepareAnaglyphGame(dataDir, setting, tableFile, gameIni);
      const fxaa = game.settings.some((s) => s.key === 'FXAA') ? ', anticrénelage SMAA remplacé par FXAA qualité (VPX n’applique pas SMAA en stéréo)' : ''; // i18n-ignore : journal
      console.log(`Lunettes 3D : partie en relief (lunettes ${setting.glasses}${setting.calibration ? ', calibrées' : ''}, profondeur ${depthLabel(setting.depth)}, couleurs ${setting.colors}${fxaa}) ; copie de ${path.basename(game.original)}${game.existed ? '' : ' (absent)'} passée par -TableIni.`); // i18n-ignore : journal
      return game;
    } catch (error) {
      console.log(`Lunettes 3D : activées, mais réglages de la partie pas écrits (${(error as Error).message}) ; partie sans relief.`); // i18n-ignore : journal
      return undefined;
    }
  }

  /** Après une partie en relief : les réglages de la table enregistrés en jeu reviennent dans son fichier. */
  function restoreGame(game: AnaglyphGame): void {
    try {
      const n = restoreAnaglyphGame(game);
      if (n) console.log(`Lunettes 3D : ${n} réglage(s) de la table changé(s) pendant la partie, reporté(s) dans ${path.basename(game.original)}.`); // i18n-ignore : journal
    } catch (error) {
      console.log(`Lunettes 3D : réglages de la table changés en jeu pas reportés (${(error as Error).message}).`); // i18n-ignore : journal
    }
  }

  return {
    /** Le réglage en vigueur (relu à chaque changement). */
    setting: () => setting,
    /** La roue en relief, pour l'état du playfield : les lunettes et le côté de leurs verres, ou undefined. */
    wheelRelief: () => anaglyphWheelRelief(setting),
    prepareGame,
    restoreGame,
  };
}
