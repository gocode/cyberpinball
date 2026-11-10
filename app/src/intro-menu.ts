// Réglages de l'ouverture au démarrage (packages/core/src/intro.ts), depuis « Médias, son et
// attente » : jouée ou coupée, voir l'ouverture, et pour chaque écran (plateau, fronton, topper,
// DMD, FullDMD) l'animation de Cyber Pinball ou une image ou une vidéo de l'utilisateur ; une
// musique de fond, indépendante des animations. Les animations de Cyber Pinball font partie de
// l'application : rien ici ne peut les effacer. Revenir à l'une d'elles garde le fichier de
// l'utilisateur, qu'il peut reprendre ; un fichier remplacé part à la corbeille de la racine.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  INTRO_DEFAULT_DETAILS,
  INTRO_SCREENS,
  INTRO_SLOT_LABELS,
  applyOps,
  formatSize,
  introAccepts,
  introDefaults,
  introFileName,
  introFormats,
  introPlaceOps,
  introSource,
  t,
  tn,
  trashDirFor,
  withIntroChoice,
  type IconName,
  type IntroFiles,
  type IntroScreen,
  type IntroSettings,
  type IntroSlot,
} from '@cyberpinball/core';
import type { Action, Built } from './library';
import type { PickRequest } from './file-picker';
import { onGesture } from './gesture-flash';

export interface IntroMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    pick(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  };
  settings(): IntroSettings;
  /** Enregistre et applique (medias.json, état renvoyé aux fenêtres). */
  save(next: IntroSettings): void;
  /** <racine>\media, où vont les fichiers de l'utilisateur ; undefined sans racine. */
  mediaDir(): string | undefined;
  /** <racine>\trash, la corbeille des fichiers remplacés. */
  trashRoot(): string | undefined;
  /** Fichiers d'ouverture de <racine>\media (relus après un rangement : filesChanged). */
  files(): IntroFiles;
  filesChanged(): void;
  /** Écrans d'ouverture que cette borne montre (le DMD : l'afficheur 4:1 ou le FullDMD). */
  screens(): ReadonlySet<IntroScreen>;
  /** Joue l'ouverture maintenant ; un bouton revient ici. */
  preview(): void;
}

const SLOT_ICONS: Record<IntroSlot, IconName> = { playfield: 'playfield', backglass: 'image', topper: 'layers', dmd: 'dmd', fulldmd: 'screens', music: 'music' };

/** Lignes de l'écran, dans l'ordre : un sous-écran revient sur sa ligne par son rang. */
const ROWS = ['enabled', 'preview', ...INTRO_SCREENS, 'music', 'defaults'] as const;
type Row = (typeof ROWS)[number];
const rowOf = (key: Row) => ROWS.indexOf(key);

export function createIntroMenu(host: IntroMenuHost) {
  const s = () => host.settings();
  let notice: { text: string; tone: 'info' | 'error' } | undefined;
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (notice = undefined));
  let back: () => void = () => undefined;

  /** « Plateau : animation de Cyber Pinball », « Plateau : votre vidéo (IntroPlayfield).mp4 ». */
  function slotState(slot: IntroSlot): { value: string; kept?: string; custom: boolean } {
    const source = introSource(s(), host.files(), slot);
    if (source.source === 'file') {
      const name = path.basename(source.file);
      const value =
        source.kind === 'video' ? t('votre vidéo « {name} »', { name }) : source.kind === 'image' ? t('votre image « {name} »', { name }) : t('votre musique « {name} »', { name });
      return { value, custom: true };
    }
    const kept = source.kept ? path.basename(source.kept) : undefined;
    return { value: slot === 'music' ? t('aucune') : t('animation de Cyber Pinball'), kept, custom: false };
  }

  function slotAction(slot: IntroSlot): Action {
    const state = slotState(slot);
    const absent = slot !== 'music' && !host.screens().has(slot);
    const where = slot === 'music' ? t('Jouée en boucle jusqu’au premier bouton, au volume de la musique') : state.custom ? undefined : INTRO_DEFAULT_DETAILS[slot];
    const parts = [
      where,
      state.kept ? t('« {name} » gardé, prêt à reprendre', { name: state.kept }) : undefined,
      absent ? t('Cette borne n’a pas cet écran : servira s’il est ajouté') : undefined,
      t('Start : changer'),
    ].filter(Boolean);
    return {
      label: t('{screen} : {value}', { screen: INTRO_SLOT_LABELS[slot], value: state.value }),
      detail: parts.join(' · '),
      tone: absent ? 'quiet' : state.custom ? 'ok' : undefined,
      icon: SLOT_ICONS[slot],
      run: () => openSlot(slot),
    };
  }

  function actions(): Action[] {
    const v = s();
    const rows: Record<Row, Action | Action[]> = {
      enabled: {
        label: v.enabled ? t('Ouverture au démarrage : jouée') : t('Ouverture au démarrage : coupée'),
        detail: v.enabled
          ? t('Chaque écran joue son animation, puis garde sa dernière image ; le premier bouton affiche la roue (Start : couper)')
          : t('Cyber Pinball s’ouvre droit sur la roue (Start : jouer l’ouverture)'),
        icon: 'power',
        run: () => host.save({ ...v, enabled: !v.enabled }),
      },
      preview: {
        label: t('Voir l’ouverture'),
        detail: t('Sur tous les écrans de la borne, tout de suite ; un bouton revient ici'),
        icon: 'play',
        run: () => host.preview(),
      },
      ...(Object.fromEntries(INTRO_SCREENS.map((screen) => [screen, slotAction(screen)])) as Record<IntroScreen, Action>),
      music: slotAction('music'),
      defaults: {
        label: t('Tout revenir aux animations de Cyber Pinball'),
        detail: t('Sans musique de fond ; vos fichiers restent dans le dossier media de la borne, prêts à reprendre'),
        icon: 'restore',
        run: () => {
          host.save(introDefaults(s()));
          notice = { text: t('Animations de Cyber Pinball sur chaque écran, sans musique. Vos fichiers sont gardés.'), tone: 'info' };
          open(rowOf('defaults'));
        },
      },
    };
    return ROWS.flatMap((key) => rows[key]);
  }

  function build(): Built {
    const shown = notice;
    return {
      heading: t('Ouverture au démarrage'),
      icon: 'play',
      lead: t('Quand Cyber Pinball s’ouvre, chaque écran joue son animation une fois et garde sa dernière image ; le premier bouton affiche la roue. Remplacez une animation par une image ou une vidéo : celles de Cyber Pinball ne sont jamais effacées.'),
      sections: shown ? [{ rows: [{ text: shown.text, tone: shown.tone }] }] : [],
      actions: [...actions(), { label: t('Retour'), icon: 'back', run: () => back() }],
      back: () => back(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  // ---------- Un écran, ou la musique ----------

  function openSlot(slot: IntroSlot, at?: number): void {
    const label = INTRO_SLOT_LABELS[slot];
    const music = slot === 'music';
    const formats = introFormats(slot);
    host.library.openCustom(() => {
      const files = host.files();
      const file = files[slot]?.[0];
      const source = introSource(s(), files, slot);
      const usingFile = source.source === 'file';
      const list: Action[] = [
        {
          label: music ? t('Aucune musique de fond') : t('Animation de Cyber Pinball'),
          detail: [music ? t('Les animations de Cyber Pinball sont muettes ; une vidéo du plateau garde son son') : INTRO_DEFAULT_DETAILS[slot as IntroScreen], usingFile ? undefined : t('choix actuel')].filter(Boolean).join(' · '),
          tone: usingFile ? undefined : 'ok',
          icon: music ? 'volume-low' : 'pinball-app',
          run: () => {
            host.save(withIntroChoice(s(), slot, 'default'));
            open(rowOf(slot));
          },
        },
      ];
      if (file) {
        const size = (() => {
          try {
            return formatSize(fs.statSync(file).size);
          } catch {
            return undefined;
          }
        })();
        list.push({
          label: t('Votre fichier : {name}', { name: path.basename(file) }),
          detail: [size, usingFile ? t('choix actuel') : t('gardé ; Start : le reprendre')].filter(Boolean).join(' · '),
          tone: usingFile ? 'ok' : undefined,
          icon: music ? 'sound' : 'film',
          run: () => {
            host.save(withIntroChoice(s(), slot, 'auto'));
            open(rowOf(slot));
          },
        });
      }
      const dir = host.mediaDir();
      list.push({
        label: music ? t('Choisir une musique…') : t('Choisir une image ou une vidéo…'),
        detail: dir ? t('Clé USB, Téléchargements, Bureau, disques ; formats : {formats}', { formats: formats.join(', ') }) : t('Indisponible : Cyber Pinball n’a pas de dossier de borne'),
        tone: dir ? undefined : 'quiet',
        icon: 'folder',
        run: () => (dir ? void choose(slot) : undefined),
      });
      list.push({ label: t('Retour'), icon: 'back', run: () => open(rowOf(slot)) });
      return {
        heading: t('Ouverture : {screen}', { screen: label }),
        icon: SLOT_ICONS[slot],
        lead: music
          ? t('Une musique jouée en boucle pendant l’ouverture, au volume de la musique, jusqu’au premier bouton ; indépendante des animations.')
          : t('Une image ou une vidéo, jouée une fois au démarrage ; sa dernière image reste jusqu’au premier bouton. Le fichier est copié dans le dossier media de la borne, sous « {name} ».', {
              name: introFileName(slot, 'x.ext').replace(/\.ext$/, ''),
            }),
        sections: [],
        actions: list,
        back: () => open(rowOf(slot)),
        drop: (paths) => {
          const found = paths.find((p) => introAccepts(slot, p));
          if (found) place(slot, found);
        },
      };
    }, at ?? 0);
  }

  async function choose(slot: IntroSlot): Promise<void> {
    const label = INTRO_SLOT_LABELS[slot];
    const paths = await host.library.pick({
      title: slot === 'music' ? t('Musique de fond : choisir un fichier') : t('Ouverture, {screen} : choisir un fichier', { screen: label }),
      icon: slot === 'music' ? 'music' : 'image',
      purpose: t('Ouverture au démarrage : {screen}', { screen: label }),
      mode: 'file',
      filter: { label, extensions: [...introFormats(slot)] },
    });
    if (paths?.[0]) place(slot, paths[0]);
  }

  /** Range le fichier sous son nom dans <racine>\media (l'ancien à la corbeille) et le choisit. */
  function place(slot: IntroSlot, from: string): void {
    const dir = host.mediaDir();
    const trash = host.trashRoot();
    if (!dir || !trash || !introAccepts(slot, from)) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      applyOps(introPlaceOps(dir, slot, from, host.files()), { trashDir: trashDirFor(trash, 'Ouverture') }); // i18n-ignore : nom de dossier
      host.filesChanged();
      host.save(withIntroChoice(s(), slot, 'auto'));
      notice = { text: t('{screen} : « {name} » choisi pour l’ouverture.', { screen: INTRO_SLOT_LABELS[slot], name: path.basename(from) }), tone: 'info' };
    } catch (error) {
      notice = { text: t('Fichier non copié : {message}', { message: (error as Error).message }), tone: 'error' };
    }
    open(rowOf(slot));
  }

  return {
    /** Ouvre l'écran ; `onBack` : où ramène « Retour ». */
    open(onBack: () => void, at = 0): void {
      back = onBack;
      open(at);
    },
    summary(): string {
      const v = s();
      if (!v.enabled) return t('coupée');
      const custom = [...INTRO_SCREENS, 'music' as const].filter((slot) => introSource(v, host.files(), slot).source === 'file').length;
      return custom ? tn(custom, 'jouée, {n} fichier à vous', 'jouée, {n} fichiers à vous') : t('jouée');
    },
  };
}
