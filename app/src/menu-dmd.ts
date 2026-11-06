// DMD sur la roue (packages/core/src/menudmd.ts) : fiche > « Gérer la table… » > « DMD sur la roue ». Pour
// chaque table, le DMD vivant du menu affiché ou masqué sur l'écran du DMD, et sa place dans cet
// écran. L'écran de réglage est sur le plateau ; l'écran du DMD montre la table et ses points à la
// place réglée, en direct, un cadre autour. Le réglage en partie (in-game-menu.ts) reste à part.

import {
  answerMenuDmdLeave,
  dmdMenuKeyNames,
  markMenuDmdAuto,
  markMenuDmdSaved,
  menuDmdBlocked,
  menuDmdFrameLabel,
  menuDmdKey,
  menuDmdLabel,
  menuDmdLeaveLabels,
  menuDmdPlaceFor,
  menuDmdPlaceOf,
  menuDmdSpot,
  menuDmdValue,
  MENU_DMD_ITEMS,
  openMenuDmdItem,
  readMenuDmdPlaces,
  saveMenuDmdPlaces,
  startMenuDmdEditor,
  t,
  withMenuDmdPlace,
  type MenuDmdEditor,
  type MenuDmdEditorHost,
  type MenuDmdItemId,
  type MenuDmdKeys,
  type MenuDmdOutcome,
  type MenuDmdPlacesFile,
  type IconName,
  type MenuDmdSpot,
  type ScreenZone,
  type TableEntry,
} from '@cyberpinball/core';
import type { Input } from 'electron';
import type { Action, Built, Row } from './library';

/** Place automatique des points pour une table (liveDmdArea) et ce qu'elle suit. */
export interface MenuDmdAuto {
  zone: ScreenZone;
  /** Taille de la zone du DMD, en pixels. */
  size: { width: number; height: number };
  /** La place automatique est le cadre dessiné sur le média FullDMD (sinon la bande 4:1 centrée). */
  framed: boolean;
}

export interface MenuDmdHost {
  dataDir: string;
  /** Identifiant de la configuration de la borne branchée ; undefined : aucune. */
  configuration(): string | undefined;
  /** Place automatique pour cette table ; undefined : la configuration n'a pas d'écran du DMD. */
  auto(table: TableEntry): MenuDmdAuto | undefined;
  /** Le réglage ne se voit pas sur l'écran du DMD maintenant : pourquoi (DMD du menu « classique »). */
  unseen(): string | undefined;
  keys(): MenuDmdKeys;
  library: {
    openCustom(build: () => Built, at?: number, table?: string): void;
    openSheet(table: TableEntry, flash?: string): void;
  };
  broadcast(): void;
  log(line: string): void;
}

export interface MenuDmd {
  /**
   * Ce que la roue montre pour cette table : le réglage en cours s'il est ouvert sur elle et que la
   * gestion des tables est à l'écran (`live`), sinon l'enregistré.
   */
  spot(table: TableEntry, auto: ScreenZone, live: boolean): MenuDmdSpot & { own: boolean; editing?: string };
  /** Détail de l'entrée de la fiche : « place automatique », « réglé pour cette table · masqué »… */
  detail(table: TableEntry): string;
  /** Ouvre l'écran de réglage ; `back` : l'écran d'où on l'a ouvert (sinon la fiche). */
  open(table: TableEntry, back?: () => void): void;
  /** Les réglages enregistrés ont changé hors de l'écran (relecture du fichier). */
  reload(): void;
}

const ICONS: Record<MenuDmdItemId, IconName> = {
  shown: 'eye',
  moveX: 'move-right',
  moveY: 'move-down',
  size: 'zoom-in',
  format: 'layout',
  save: 'check',
  auto: 'auto',
  back: 'back',
};

export function createMenuDmd(host: MenuDmdHost): MenuDmd {
  let file: MenuDmdPlacesFile | undefined;
  /** Réglage ouvert : la table et l'état de l'écran. */
  let open: { table: TableEntry; editor: MenuDmdEditor; back?: () => void } | undefined;

  const places = () => (file ??= readMenuDmdPlaces(host.dataDir));
  const placeOf = (table: TableEntry) => menuDmdPlaceOf(places(), host.configuration(), table.id);

  function editorHost(table: TableEntry): MenuDmdEditorHost | undefined {
    const auto = host.auto(table);
    if (!auto) return undefined;
    const unseen = host.unseen();
    return { size: auto.size, auto: auto.zone, ownPlace: Boolean(placeOf(table)), ...(unseen && { unseen }) };
  }

  function save(table: TableEntry, eh: MenuDmdEditorHost, editor: MenuDmdEditor): void {
    const configuration = host.configuration();
    if (!configuration) return;
    const place = menuDmdPlaceFor(editor.spot, eh.auto, new Date().toISOString());
    file = withMenuDmdPlace(places(), configuration, table.id, place);
    saveMenuDmdPlaces(host.dataDir, file);
    markMenuDmdSaved(editor, place ? t('Enregistré pour cette table : la roue le montre dès maintenant.') : t('Rien à garder : c’est la place automatique, la table la suit.'));
    host.log(`DMD sur la roue (${table.id}) : ${place ? (place.hidden ? 'masqué' : 'place réglée') : 'place automatique'}.`); // i18n-ignore : journal
  }

  function clear(table: TableEntry, eh: MenuDmdEditorHost, editor: MenuDmdEditor): void {
    const configuration = host.configuration();
    if (configuration && placeOf(table)) {
      file = withMenuDmdPlace(places(), configuration, table.id, undefined);
      saveMenuDmdPlaces(host.dataDir, file);
      host.log(`DMD sur la roue (${table.id}) : retour à la place automatique.`); // i18n-ignore : journal
    }
    markMenuDmdAuto({ ...eh, ownPlace: false }, editor);
  }

  function close(table: TableEntry): void {
    const back = open?.back;
    open = undefined;
    if (back) back();
    else host.library.openSheet(table);
  }

  function outcome(table: TableEntry, eh: MenuDmdEditorHost, editor: MenuDmdEditor, out: MenuDmdOutcome): void {
    if (out === 'save') save(table, eh, editor);
    else if (out === 'auto') clear(table, eh, editor);
    else if (typeof out === 'object') {
      if (out.save) save(table, eh, editor);
      close(table);
    }
  }

  function build(table: TableEntry): Built {
    const back = () => close(table);
    const eh = editorHost(table);
    if (!open || !eh) {
      return {
        heading: t('DMD sur la roue'),
        icon: 'dmd',
        subheading: table.title,
        sections: [{ rows: [{ text: t('Cette configuration de la borne n’a pas d’écran du DMD.'), tone: 'info' }] }],
        actions: [{ label: t('Retour à la fiche'), icon: 'back', run: back }],
        back,
      };
    }
    const editor = open.editor;
    const keyLabel = dmdMenuKeyNames(host.keys());
    const k = host.keys();
    const rows: Row[] = [
      {
        text: eh.ownPlace ? t('Réglé pour cette table') : t('Place automatique'),
        detail: eh.ownPlace
          ? t('Ce réglage ne vaut que pour la roue ; le DMD en partie se règle pendant la partie (les deux MagnaSave).')
          : host.auto(table)?.framed
            ? t('Dans le cadre de DMD dessiné sur le média FullDMD de la table.')
            : t('Bande 4:1 centrée sur l’écran du DMD.'),
        tone: 'info',
      },
    ];
    if (eh.unseen) rows.push({ text: t('Ne se voit pas maintenant'), detail: eh.unseen, tone: 'warning' });
    if (editor.notice) rows.push({ text: editor.notice, tone: 'ok' });

    if (editor.leaving) {
      const actions: Action[] = menuDmdLeaveLabels().map((label, i) => ({
        label,
        icon: (['check', 'restore', 'back'] as const)[i]!,
        run: () => {
          outcome(table, eh, editor, answerMenuDmdLeave(editor, i));
          host.broadcast();
        },
      }));
      return {
        heading: t('DMD sur la roue'),
        icon: 'dmd',
        subheading: table.title,
        lead: t('La place du DMD sur la roue a changé sans être enregistrée.'),
        sections: [{ rows }],
        actions,
        back: () => {
          editor.leaving = false;
          host.broadcast();
        },
      };
    }

    const actions: Action[] = MENU_DMD_ITEMS.map((id) => {
      const blocked = menuDmdBlocked(eh, editor, id);
      const value = menuDmdValue(eh, editor, id);
      const isOpen = editor.item === id && Boolean(editor.mode);
      return {
        label: menuDmdLabel(id),
        detail: isOpen ? `‹ ${value} ›` : blocked ? blocked : value || undefined,
        icon: ICONS[id],
        key: id,
        ...(blocked ? { tone: 'quiet' as const } : isOpen ? { tone: 'ok' as const } : {}),
        run: () => {
          outcome(table, eh, editor, openMenuDmdItem(eh, editor, id));
          host.broadcast();
        },
      };
    });
    const prev = keyLabel(k.previous);
    const next = keyLabel(k.next);
    const ok = keyLabel(k.confirm);
    const no = keyLabel(k.exit);
    const up = keyLabel(k.up);
    const down = keyLabel(k.down);
    const hint =
      editor.mode === 'adjust'
        ? editor.item === 'size'
          ? t('{previous} / {next} : réduire ou agrandir (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler', { previous: prev, next, confirm: ok, exit: no })
          : up && down
            ? t('{previous} / {next} : gauche, droite · {up} / {down} : haut, bas (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler', { previous: prev, next, up, down, confirm: ok, exit: no })
            : t('{previous} / {next} : déplacer (maintenir pour aller vite) · {confirm} : valider · {exit} : annuler', { previous: prev, next, confirm: ok, exit: no })
        : editor.mode === 'choice'
          ? t('{previous} / {next} : changer de format · {confirm} : valider · {exit} : annuler', { previous: prev, next, confirm: ok, exit: no })
          : undefined;
    return {
      heading: t('DMD sur la roue'),
      icon: 'dmd',
      subheading: table.title,
      lead: t('Ce que la roue montre sur l’écran du DMD pour cette table : les points affichés ou non, et leur place. L’écran du DMD le montre en direct.'),
      sections: [{ rows }],
      actions,
      ...(hint && { hint }),
      keys: (input: Input) => {
        const out = menuDmdKey(eh, editor, k, input);
        if (out === 'unhandled') return false;
        outcome(table, eh, editor, out);
        return true;
      },
      back: () => {
        outcome(table, eh, editor, openMenuDmdItem(eh, editor, 'back'));
        host.broadcast();
      },
    };
  }

  return {
    spot(table, auto, live) {
      if (live && open && open.table.file === table.file) {
        const eh = editorHost(table);
        return { ...open.editor.spot, own: Boolean(placeOf(table)), ...(eh && { editing: menuDmdFrameLabel(eh, open.editor) }) };
      }
      return menuDmdSpot(auto, placeOf(table));
    },
    detail(table) {
      const place = placeOf(table);
      if (!place) return t('Place automatique, affiché · le DMD en partie se règle à part');
      if (place.hidden) return t('Masqué pour cette table');
      return t('Place réglée pour cette table');
    },
    open(table, back) {
      file = undefined;
      const auto = host.auto(table);
      const spot = menuDmdSpot(auto?.zone ?? { x: 0, y: 0, width: 1, height: 1 }, placeOf(table));
      open = { table, editor: startMenuDmdEditor(spot), ...(back && { back }) };
      host.library.openCustom(() => build(table), 0, table.file);
      host.broadcast();
    },
    reload() {
      file = undefined;
    },
  };
}

