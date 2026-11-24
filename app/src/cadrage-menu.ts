// Menu système › Ma borne › VPX › Cadrage des tables (23/11/2026) : le cadrage de toutes les tables
// en vue borne, choisi sur une vraie image. La table choisie sur la roue (sinon une table installée) est rendue par VPX
// dans chaque style (framing-preview.ts, bureau caché), et le joueur garde celui qu'il préfère ; « Plein écran, apron
// rogné » est le cadrage par défaut. Le style va dans le modèle de la borne (Cabinet.framing), que la synchronisation
// écrit dans VPinballX.ini. Une table qui a son propre cadrage (Point de vue) le garde.

import * as path from 'node:path';
import {
  DEFAULT_FRAMING_STYLE,
  findTableIni,
  framingStyleDetail,
  framingStyleLabel,
  framingStyles,
  IniDocument,
  isVpxCabinetView,
  mediaUrl,
  readTextIfExists,
  t,
  withTableFramingStyle,
  type FlipperEdge,
  type FramingStyle,
  type PlayfieldOrientation,
  type TableEntry,
} from '@cyberpinball/core';
import type { FramingPreviewRequest, FramingPreviews } from './framing-preview';
import type { Action, Built, ProvidedSystemItem } from './library';
import type { MediaCard, MediaThumb } from './library-medias';

/** Ce que les écrans du cadrage partagent : les aperçus rendus par VPX et le style de la borne. */
export interface FramingSupport {
  previews: FramingPreviews;
  /** Le VPX sait garder le haut (VPX corrigé). */
  keepTop(): boolean;
  /** Le style choisi pour la borne ; undefined : le défaut, jamais choisi. */
  current(): FramingStyle | undefined;
  /** Redessine l'écran affiché (un aperçu est prêt). */
  refresh(): void;
  /** ROM de la table, d'après son script. */
  rom(table: TableEntry): string | undefined;
  /** Dossier de PinMAME de Cyber Pinball. */
  pinmame(): string | undefined;
  log?(line: string): void;
}

export interface FramingMenuHost extends FramingSupport {
  library: { openCustom(build: () => Built, at?: number): void; openSystem(): void };
  /** La table montrée : celle choisie sur la roue si c'est une table VPX, sinon une table VPX installée. */
  sampleTable(): TableEntry | undefined;
  /** Le playfield de la borne et son VPinballX.ini ; undefined sans assistant d'écrans fait. */
  orientation(): PlayfieldOrientation | undefined;
  /** Enregistre le style de la borne et l'écrit dans VPinballX.ini. */
  choose(style: FramingStyle): void;
}

/** Rotation horaire qui montre l'image de la fenêtre comme le joueur la voit, d'après le bord des flippers. */
export function playerRotation(edge: FlipperEdge): 0 | 90 | 180 | 270 {
  return edge === 'right' ? 90 : edge === 'top' ? 180 : edge === 'left' ? 270 : 0;
}

/** Une carte d'aperçu : l'image rendue, sinon l'attente ou la raison de son absence. */
export function previewThumb(file: string | undefined, rotation: 0 | 90 | 180 | 270, failed: string | undefined): MediaThumb {
  if (file) return { kind: 'image', url: mediaUrl(file), rotation };
  if (failed) return { kind: 'fallback', rotation: 0, text: failed };
  return { kind: 'fallback', rotation: 0, text: t('VPX génère le rendu…'), pending: true };
}

/** La demande d'aperçu d'une table, avec le .ini que ce cadrage lui donnerait. */
export function previewRequest(host: Pick<FramingSupport, 'rom' | 'pinmame'>,table: TableEntry, orientation: PlayfieldOrientation, tableIni: string): FramingPreviewRequest {
  const rom = host.rom(table);
  const pinmame = host.pinmame();
  return {
    table: table.file,
    tableIni,
    globalIni: orientation.globalIni,
    window: { width: orientation.window.bounds.width, height: orientation.window.bounds.height },
    ...(rom ? { rom } : {}),
    ...(pinmame ? { pinmame } : {}),
  };
}

export function createFramingMenu(host: FramingMenuHost): { item: ProvidedSystemItem; open(at?: number): void } {
  /** Raison d'un aperçu impossible, par style (la table ne démarre pas, VPX absent). */
  const failures = new Map<string, string>();

  function summary(): string {
    return framingStyleLabel(host.current() ?? DEFAULT_FRAMING_STYLE);
  }

  function requestFor(style: FramingStyle, table: TableEntry, orientation: PlayfieldOrientation): FramingPreviewRequest {
    const own = findTableIni(table.file);
    return previewRequest(host, table, orientation, withTableFramingStyle(own.exists ? readTextIfExists(own.path) : '', style, host.keepTop()));
  }

  function build(): Built {
    const orientation = host.orientation();
    const back = () => host.library.openSystem();
    const retour: Action = { label: t('Retour'), icon: 'back', run: back };
    const heading = t('Cadrage des tables');
    if (!orientation || !isVpxCabinetView(IniDocument.parse(orientation.globalIni).get('Player', 'BGSet'))) {
      return {
        heading,
        icon: 'crop',
        lead: orientation
          ? t('Sur cet écran, VPX montre chaque table dans sa vue bureau, réglée par son auteur. Le cadrage se choisit sur une borne, quand le playfield est un écran à part.')
          : t('Fais d’abord l’assistant d’écrans : le cadrage dépend de la forme et de la taille du playfield.'),
        sections: [],
        actions: [retour],
        back,
      };
    }
    const table = host.sampleTable();
    const styles = framingStyles(host.keepTop());
    const chosen = host.current() ?? DEFAULT_FRAMING_STYLE;
    const rotation = playerRotation(orientation.edge);
    const { width, height } = orientation.window.bounds;
    const aspect = rotation % 180 === 0 ? `${width} / ${height}` : `${height} / ${width}`;
    const cards: MediaCard[] = styles.map((style, i) => {
      const request = table && requestFor(style, table, orientation);
      const file = request && host.previews.cached(request);
      const failed = failures.get(style);
      return {
        action: i,
        title: framingStyleLabel(style),
        description: framingStyleDetail(style),
        ...(style === chosen ? { state: { label: host.current() ? t('Choix actuel') : t('Par défaut'), tone: 'ok' as const } } : {}),
        thumb: table ? previewThumb(file, rotation, failed) : previewThumb(undefined, 0, t('Aucune table VPX à montrer')),
      };
    });
    return {
      heading,
      icon: 'crop',
      subheading: table ? t('Vu sur {table}', { table: table.title }) : undefined,
      lead: t('Sur ce playfield, une table ne remplit pas l’écran sans compromis. Choisis ce que tu préfères voir : il vaut pour toutes les tables, sauf celles qui ont leur propre point de vue.'),
      sections: [],
      media: { cards, gallery: true, aspect },
      actions: [
        ...styles.map(
          (style, i): Action => ({
            label: framingStyleLabel(style),
            detail: framingStyleDetail(style),
            icon: (['crop', 'frame', 'resize-width'] as const)[i]!,
            activeChoice: style === chosen ? t('Choix actuel') : undefined,
            tone: style === chosen ? 'ok' : undefined,
            run: () => {
              host.choose(style);
              open(i);
            },
          }),
        ),
        retour,
      ],
      back,
    };
  }

  /** Les aperçus qui manquent, rendus l'un après l'autre ; l'écran se redessine à chacun. */
  function renderMissing(): void {
    const orientation = host.orientation();
    const table = host.sampleTable();
    if (!orientation || !table) return;
    for (const style of framingStyles(host.keepTop())) {
      const request = requestFor(style, table, orientation);
      if (host.previews.cached(request)) continue;
      failures.delete(style);
      host.previews
        .render(request)
        .catch((error: Error) => {
          failures.set(style, t('Aperçu impossible : la table n’a pas démarré.'));
          host.log?.(`Cadrage des tables : aperçu « ${style} » de ${path.basename(table.file)} impossible (${error.message}).`); // i18n-ignore : journal
        })
        .finally(() => host.refresh());
    }
  }

  function open(at?: number): void {
    host.library.openCustom(build, at);
    renderMissing();
  }

  return {
    item: {
      get detail() {
        return summary();
      },
      run: () => open(),
    },
    open,
  };
}
