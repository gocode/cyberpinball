// Écran « Animations des LED » (Menu système › Ma borne › DMD et LED › LED et retours (DOF)) : activer
// les animations, choisir le style, la luminosité maximale, la vitesse, les couleurs (celles de la table
// ou une couleur fixe) et l'extinction après inactivité. Chaque changement est enregistré et se voit
// aussitôt sur les bandes (led-animations.ts).

import {
  LED_AMBIENT_STYLES,
  LED_FIXED_COLORS,
  LED_IDLE_CHOICES,
  LED_LEVEL_CHOICES,
  LED_SPEEDS,
  ledColorLabel,
  ledFixedColorId,
  nearestLedLevel,
  ledSpeedLabel,
  ledStyleDetail,
  ledStyleLabel,
  t,
  tn,
  type LedAnimationSettings,
} from '@cyberpinball/core';
import type { Action, Built } from './library';
import type { LedAnimations } from './led-animations';

export interface LedAnimationsMenuHost {
  library: { openCustom(build: () => Built, at?: number): void };
  animations: LedAnimations;
}

/** Durée d'inactivité en clair. */
export function idleLabel(minutes: number): string {
  if (minutes <= 0) return t('jamais');
  if (minutes % 60 === 0) return tn(minutes / 60, '{n} heure', '{n} heures');
  return tn(minutes, '{n} minute', '{n} minutes');
}

/** Ligne de résumé de l'entrée du menu qui mène à cet écran. */
export function ledAnimationsSummary(animations: LedAnimations): string {
  const s = animations.settings();
  if (!animations.available()) return t('Décris d’abord tes bandes de LED adressables');
  if (!s.enabled) return t('Éteintes');
  return t('{style} · {brightness} %', { style: ledStyleLabel(s.style), brightness: s.brightness });
}

/** Le choix qui suit `current` dans `list`, en boucle. */
export function nextChoice<T>(list: readonly T[], current: T): T {
  const i = list.indexOf(current);
  return list[(i + 1) % list.length]!;
}

export interface LedLevelPicker {
  heading: string;
  lead: string;
  /** Libellé du cran 0 (« éteintes », « effets coupés »). */
  zero: string;
  current(): number;
  set(level: number): void;
  back(): void;
}

/**
 * Écran de choix d'une luminosité LED parmi ses crans (LED_LEVEL_CHOICES, de 10 en 10, en % perçu) : chaque choix s'applique aussitôt et l'écran reste ouvert sur lui, pour comparer sur les bandes.
 */
export function openLedLevelPicker(library: LedAnimationsMenuHost['library'], p: LedLevelPicker): void {
  const show = () =>
    library.openCustom(
      () => {
        const current = p.current();
        return {
          heading: p.heading,
          icon: 'sun',
          lead: p.lead,
          sections: [],
          actions: [
            ...LED_LEVEL_CHOICES.map(
              (level): Action => ({
                key: String(level),
                label: level === 0 ? p.zero : t('{n} %', { n: level }),
                ...(level === current ? { detail: t('Choix actuel'), tone: 'ok' as const } : {}),
                run: () => {
                  p.set(level);
                  show();
                },
              }),
            ),
            { label: t('Retour'), icon: 'back', run: p.back },
          ],
          back: p.back,
        };
      },
      Math.max(0, LED_LEVEL_CHOICES.indexOf(nearestLedLevel(p.current()))),
    );
  show();
}

export function createLedAnimationsMenu(host: LedAnimationsMenuHost) {
  const { library, animations } = host;

  function open(back: () => void, at = 0): void {
    library.openCustom(() => build(back), at);
  }

  function build(back: () => void): Built {
    const s: LedAnimationSettings = animations.settings();
    const change = (patch: Partial<LedAnimationSettings>, index: number) => {
      animations.change(patch);
      open(back, index);
    };
    const colorId = ledFixedColorId(s.color);
    const sections: Built['sections'] = [];
    if (!animations.available()) {
      sections.push({
        rows: [{ icon: 'alert', tone: 'warning', text: t('Aucune bande de LED adressables n’est décrite : les animations n’ont rien à allumer.'), detail: t('Décris-les dans « Bandes de LED adressables… », puis reviens ici.') }],
      });
    }
    const actions: Action[] = [
      {
        label: t('Animations : {state}', { state: s.enabled ? t('allumées') : t('éteintes') }),
        detail: t('Une ambiance douce quand rien ne se passe, dans les écrans et à la roue ; elle s’éteint dès qu’une partie se prépare'),
        icon: 'power',
        tone: s.enabled ? 'ok' : 'quiet',
        run: () => change({ enabled: !s.enabled }, 0),
      },
      {
        label: t('Style : {style}', { style: ledStyleLabel(s.style) }),
        detail: ledStyleDetail(s.style),
        icon: 'sparkle',
        run: () => openStyles(back),
      },
      {
        label: t('Luminosité maximale : {n} %', { n: s.brightness }),
        detail: t('Rien ne dépasse ce niveau, pas même les balayages de la roue ni l’ouverture · Start : de 0 à 100 %'),
        icon: 'sun',
        run: () =>
          openLedLevelPicker(library, {
            heading: t('Luminosité maximale'),
            lead: t('En luminosité perçue : 50 % paraît moitié moins fort que 100 %, 10 % est très tamisé. Chaque choix se voit aussitôt sur les bandes.'),
            zero: t('0 % : éteintes'),
            current: () => animations.settings().brightness,
            set: (brightness) => animations.change({ brightness }),
            back: () => open(back, 2),
          }),
      },
      {
        label: t('Vitesse : {speed}', { speed: ledSpeedLabel(s.speed) }),
        detail: t('Le rythme de l’ambiance et des transitions'),
        icon: 'gauge',
        run: () => change({ speed: nextChoice(LED_SPEEDS, s.speed) }, 3),
      },
      {
        label: s.followTable ? t('Couleurs : celles de la table choisie') : t('Couleurs : une couleur fixe'),
        detail: s.followTable ? t('À la roue, les LED prennent la teinte de chaque table ; la couleur fixe sert quand elle n’en a pas') : t('Toujours la même couleur, quelle que soit la table'),
        icon: 'palette',
        run: () => change({ followTable: !s.followTable }, 4),
      },
      {
        label: t('Couleur fixe : {color}', { color: colorId ? ledColorLabel(colorId) : s.color }),
        detail: t('Start : choisir parmi {n} couleurs', { n: LED_FIXED_COLORS.length }),
        icon: 'spectrum',
        run: () => openColors(back),
      },
      {
        label: t('Extinction après inactivité : {delay}', { delay: idleLabel(s.idleMinutes) }),
        detail: t('Les LED s’éteignent quand plus personne ne touche à la borne, et se rallument au premier geste'),
        icon: 'clock',
        run: () => change({ idleMinutes: nextChoice(LED_IDLE_CHOICES, LED_IDLE_CHOICES.includes(s.idleMinutes) ? s.idleMinutes : 30) }, 6),
      },
      { label: t('Retour'), icon: 'back', run: back },
    ];
    return {
      heading: t('Animations des LED'),
      icon: 'sparkle',
      lead: t('Cyber Pinball anime tes LED adressables hors partie. Pendant une partie, elles sont à DOF.'),
      sections,
      actions,
      back,
    };
  }

  function openStyles(back: () => void): void {
    library.openCustom(
      () => {
        const s = animations.settings();
        return {
          heading: t('Style des animations'),
          icon: 'sparkle',
          sections: [],
          actions: [
            ...LED_AMBIENT_STYLES.map(
              (style): Action => ({
                key: style,
                label: ledStyleLabel(style),
                detail: style === s.style ? t('Choix actuel · {detail}', { detail: ledStyleDetail(style) }) : ledStyleDetail(style),
                ...(style === s.style ? { tone: 'ok' as const } : {}),
                run: () => {
                  animations.change({ style });
                  openStyles(back);
                },
              }),
            ),
            { label: t('Retour'), icon: 'back', run: () => open(back, 1) },
          ],
          back: () => open(back, 1),
        };
      },
      Math.max(0, LED_AMBIENT_STYLES.indexOf(animations.settings().style)),
    );
  }

  function openColors(back: () => void): void {
    library.openCustom(
      () => {
        const s = animations.settings();
        return {
          heading: t('Couleur fixe'),
          icon: 'spectrum',
          lead: t('Elle sert quand les couleurs ne suivent pas la table, ou quand une table n’a pas de teinte.'),
          sections: [],
          actions: [
            ...LED_FIXED_COLORS.map(
              (c): Action => ({
                key: c.id,
                label: ledColorLabel(c.id),
                ...(c.hex === s.color ? { detail: t('Choix actuel'), tone: 'ok' as const } : {}),
                run: () => {
                  animations.change({ color: c.hex });
                  openColors(back);
                },
              }),
            ),
            { label: t('Retour'), icon: 'back', run: () => open(back, 5) },
          ],
          back: () => open(back, 5),
        };
      },
      Math.max(0, LED_FIXED_COLORS.findIndex((c) => c.hex === animations.settings().color)),
    );
  }

  return { open, summary: () => ledAnimationsSummary(animations) };
}
