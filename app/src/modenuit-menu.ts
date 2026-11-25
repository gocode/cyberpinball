// Écran « Mode nuit » (Menu système > Tables > « Son et mode attente ») : ce que le mode change, au choix du
// joueur, une ligne par effet (écrans, son, LED, toys), son activation et sa liaison à l'horaire de
// la borne. La logique est dans packages/core/src/modenuit.ts, l'application dans modenuit.ts.
// Les réglages sont gardés dans <données>\medias.json (`nightMode`).

import {
  NIGHT_LED_CHOICES,
  NIGHT_SCREEN_DIM_CHOICES,
  NIGHT_VOLUME_CHOICES,
  nearestChoice,
  nightLedLabel,
  nightModeSummary,
  nightScreenLabel,
  nightVolumeLabel,
  t,
  type IconName,
  type NightModeSettings,
} from '@cyberpinball/core';
import type { Action, Built } from './library';

export interface NightModeMenuHost {
  library: { openCustom(build: () => Built, at?: number): void };
  settings(): NightModeSettings;
  /** Enregistre et applique. */
  save(next: NightModeSettings): void;
  /** Le mode est-il en marche ? */
  on(): boolean;
  /** Bascule d'un appui (la nuit de l'horaire comprise). */
  toggle(): boolean;
  /** Pourquoi les toys et les LED ne suivent pas en partie (config DOF écrite à la main). */
  dofRefusal(): string | undefined;
}

const ROWS = ['on', 'withHours', 'screenDim', 'volume', 'ledBrightness', 'ledsOff', 'toysOff'] as const;
type RowKey = (typeof ROWS)[number];
type ChoiceKey = 'screenDim' | 'volume' | 'ledBrightness';

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function createNightModeMenu(host: NightModeMenuHost) {
  const s = () => host.settings();
  const set = (patch: Partial<NightModeSettings>) => host.save({ ...s(), ...patch });
  let back: () => void = () => undefined;

  function actions(): Action[] {
    const v = s();
    const refusal = host.dofRefusal();
    const rows: Record<RowKey, Action> = {
      on: {
        label: host.on() ? t('Mode nuit : actif') : t('Mode nuit : inactif'),
        detail: host.on() ? t('Écrans, son, LED et toys suivent tes réglages ci-dessous (Start : désactiver)') : t('Rien ne change tant qu’il est inactif (Start : activer)'),
        icon: 'moon',
        run: () => void host.toggle(),
      },
      withHours: {
        label: v.withHours ? t('Lié à l’horaire de la borne : oui') : t('Lié à l’horaire de la borne : non'),
        detail: v.withHours
          ? t('Le mode s’active de lui-même la nuit de l’horaire, et s’arrête à la fin de la nuit (Start : délier)')
          : t('Sans lien : seul le bouton ou ce réglage l’active (Start : l’activer la nuit de l’horaire)'),
        icon: 'clock',
        run: () => set({ withHours: !v.withHours }),
      },
      screenDim: {
        label: t('Écrans : {dim}', { dim: nightScreenLabel(v.screenDim) }),
        detail: t('Voile noir sur les écrans du front-end ; pendant une partie, VPX garde la main sur ses écrans'),
        icon: 'bulb',
        run: () => openChoice('screenDim'),
      },
      volume: {
        label: t('Son : {volume}', { volume: nightVolumeLabel(v.volume) }),
        detail: t('Volume de Windows sur les sorties de la borne, remis à la fin du mode nuit ; 0 % : muet'),
        icon: 'volume-low',
        run: () => openChoice('volume'),
      },
      ledBrightness: {
        label: t('LED : {leds}', { leds: nightLedLabel(v) }),
        detail: v.ledsOff ? t('LED éteintes : la luminosité ne compte pas') : t('Luminosité des LED du front-end et des parties'),
        icon: 'bulb',
        run: () => openChoice('ledBrightness'),
      },
      ledsOff: {
        label: v.ledsOff ? t('LED éteintes : oui') : t('LED éteintes : non'),
        detail: refusal ? t('Sans effet en partie : {reason}', { reason: refusal }) : t('Éteint toutes les LED pendant le mode nuit (Start : changer)'),
        tone: refusal ? 'warning' : undefined,
        icon: 'sun',
        run: () => set({ ledsOff: !v.ledsOff }),
      },
      toysOff: {
        label: v.toysOff ? t('Toys coupés : oui') : t('Toys coupés : non'),
        detail: refusal
          ? t('Sans effet en partie : {reason}', { reason: refusal })
          : t('Solénoïdes, shaker et autres toys de la borne se taisent pendant les parties (Start : changer)'),
        tone: refusal ? 'warning' : undefined,
        icon: 'flipper',
        run: () => set({ toysOff: !v.toysOff }),
      },
    };
    return ROWS.map((key) => rows[key]);
  }

  const rowOf = (key: RowKey) => ROWS.indexOf(key);

  function build(): Built {
    return {
      heading: t('Mode nuit'),
      icon: 'moon',
      lead: t('Pour jouer sans déranger : tu choisis ce que le mode change, ligne par ligne. Il s’active aux boutons (si la borne en a un), ici, ou la nuit de l’horaire. Tout est remis en le désactivant.'),
      sections: [],
      actions: [...actions(), { label: t('Retour'), icon: 'back', run: () => back() }],
      back: () => back(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  const CHOICES: Record<ChoiceKey, { heading: () => string; icon: IconName; lead: () => string; values: readonly number[]; label: (value: number) => string }> = {
    screenDim: {
      heading: () => t('Écrans en mode nuit'),
      icon: 'bulb',
      lead: () => t('Voile noir posé sur chaque écran du front-end. Il disparaît pendant une partie : VPX affiche ses propres écrans.'),
      values: NIGHT_SCREEN_DIM_CHOICES,
      label: (value) => capitalized(nightScreenLabel(value)),
    },
    volume: {
      heading: () => t('Son en mode nuit'),
      icon: 'volume-low',
      lead: () => t('Part du volume de Windows gardée la nuit, sur les sorties de la borne. Le volume d’avant revient à la fin du mode nuit, sauf une sortie que tu as réglée aux boutons entre-temps.'),
      values: NIGHT_VOLUME_CHOICES,
      label: (value) => capitalized(nightVolumeLabel(value)),
    },
    ledBrightness: {
      heading: () => t('LED en mode nuit'),
      icon: 'bulb',
      lead: () => t('Luminosité des LED : celles du front-end tout de suite, celles des parties au lancement suivant (si la config DOF est celle de Cyber Pinball).'),
      values: NIGHT_LED_CHOICES,
      label: (value) => capitalized(nightLedLabel({ ledsOff: false, ledBrightness: value })),
    },
  };

  function openChoice(key: ChoiceKey): void {
    const c = CHOICES[key];
    const row = rowOf(key);
    const current = nearestChoice(c.values, s()[key]);
    host.library.openCustom(
      () => ({
        heading: c.heading(),
        icon: c.icon,
        lead: c.lead(),
        sections: [],
        actions: [
          ...c.values.map((value) => ({
            label: c.label(value),
            detail: value === s()[key] ? t('choix actuel') : undefined,
            tone: value === s()[key] ? ('ok' as const) : undefined,
            run: () => {
              set({ [key]: value });
              open(row);
            },
          })),
          { label: t('Retour'), run: () => open(row) },
        ],
        back: () => open(row),
      }),
      Math.max(0, c.values.indexOf(current)),
    );
  }

  return {
    /** Ouvre l'écran ; `onBack` : où ramène « Retour ». */
    open(onBack: () => void, at = 0): void {
      back = onBack;
      open(at);
    },
    summary(): string {
      return nightModeSummary(s(), host.on());
    },
  };
}

export type NightModeMenu = ReturnType<typeof createNightModeMenu>;
