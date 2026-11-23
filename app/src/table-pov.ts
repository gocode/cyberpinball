// Fiche d'une table > Gérer la table… > Point de vue (bêta, 22/11/2026) : ce qui cadre la table, et le choix du joueur.
// - « Cadrage de la borne » : le même pour toutes les tables (Réglages de VPX > Vue de la table et cadrage) ;
// - « POV … » : le point de vue préparé pour cette table et fourni avec elle (.pov, ou « <table> POV.ini »), appliqué à
//   elle seule en cadrage manuel, si les flippers restent du côté du joueur sur cette borne (packages/core/src/povview.ts) ;
// - « Importer un POV… » : un POV trouvé ailleurs (Téléchargements, clé USB…), rangé avec la table puis appliqué.
// Une vue enregistrée pour la table dans le menu de VPX (« Régler l'affichage en partie ») est dite comme telle, et le
// cadrage de l'installation d'origine d'une table reprise (packages/core/src/origin-framing.ts) aussi : un autre choix le remplace.

import * as path from 'node:path';
import { importPovOps, t, tablePovState, tLater, type FileOp, type PlayfieldOrientation, type TableEntry, type TablePovState } from '@cyberpinball/core';
import type { PickRequest } from './file-picker';
import { onGesture } from './gesture-flash';
import type { Built, Row, Tone } from './library';

export interface TablePovContext {
  show(build: () => Built, at?: number): void;
  pick(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  /** Le playfield de la borne tel que VPX le verra ; undefined sans assistant d'écrans fait. */
  orientation(): PlayfieldOrientation | undefined;
  /** Écrit les fichiers (l'ancien .ini de la table va à la corbeille). */
  apply(ops: FileOp[]): void;
  /** Retour à la fiche de la table. */
  back(table: TableEntry): void;
}

/** Le cadrage actuel de la table, en quelques mots (détail de l'entrée de la fiche). */
export function framingText(state: TablePovState): string {
  if (state.framing === 'pov' && state.pov) return t('POV « {file} »', { file: path.basename(state.pov.file) });
  if (state.framing === 'own') return t('Vue réglée pour cette table');
  if (state.framing === 'origin') return t('Cadrage de l’installation d’origine');
  return t('Cadrage de la borne');
}

export function createTablePov(ctx: TablePovContext) {
  let flash: { text: string; tone: Tone } | undefined;
  let returnTo: (() => void) | undefined;
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (flash = undefined));

  function state(table: TableEntry): TablePovState {
    return tablePovState(table.file, ctx.orientation(), table);
  }

  function choose(table: TableEntry, ops: FileOp[] | undefined, done: string, at: number): void {
    try {
      if (ops) ctx.apply(ops);
      flash = { text: done, tone: 'ok' };
    } catch (err) {
      flash = { text: t('Écriture impossible : {error}', { error: (err as Error).message }), tone: 'error' };
    }
    open(table, at);
  }

  async function importPov(table: TableEntry, at: number): Promise<void> {
    const paths = await ctx.pick({
      title: t('Point de vue : choisir un fichier POV'),
      icon: 'crop',
      purpose: tLater('Point de vue d’une table'),
      filter: { label: t('Points de vue'), extensions: ['pov', 'ini'] },
      mode: 'file',
    });
    if (!paths?.[0]) return open(table, at);
    const plan = importPovOps(table.file, paths[0]);
    if ('error' in plan) {
      flash = { text: plan.error, tone: 'error' };
      return open(table, at);
    }
    try {
      ctx.apply(plan.ops);
    } catch (err) {
      flash = { text: t('Import impossible : {error}', { error: (err as Error).message }), tone: 'error' };
      return open(table, at);
    }
    const after = state(table);
    if (after.refused) {
      flash = { text: after.refused, tone: 'warning' };
      return open(table, at);
    }
    choose(table, after.applyOps, t('Point de vue « {file} » importé et appliqué à cette table.', { file: path.basename(paths[0]) }), 1);
  }

  function build(table: TableEntry, s: TablePovState): Built {
    const current = (on: boolean, detail: string) => (on ? t('{detail} · choix actuel', { detail }) : detail);
    const rows: Row[] = [];
    if (flash) rows.push({ text: flash.text, tone: flash.tone });
    if (s.framing === 'own') rows.push({ text: t('Cette table a sa propre vue, enregistrée pour elle (menu de VPX, ou reprise d’une autre installation).'), tone: 'info' });
    if (s.framing === 'origin') rows.push({ text: t('Cette table garde le cadrage de son installation d’origine, comme avant son ajout.'), tone: 'info' });
    const povName = s.pov && path.basename(s.pov.file);
    // L'entrée « Cadrage de l'installation d'origine », quand elle est là, décale les suivantes d'un cran.
    const shift = s.framing === 'origin' ? 1 : 0;
    return {
      heading: t('Point de vue'),
      icon: 'crop',
      subheading: table.title,
      lead: t('Ce qui cadre cette table sur l’écran du plateau. Le sens de la table est toujours vérifié : un point de vue qui la mettrait de travers sur cette borne est refusé.'),
      sections: rows.length ? [{ rows }] : [],
      actions: [
        {
          label: t('Cadrage de la borne'),
          detail: current(s.framing === 'cabinet', t('Le même pour toutes les tables : Réglages de VPX > Vue de la table et cadrage')),
          icon: 'frame',
          tone: s.framing === 'cabinet' ? 'ok' : undefined,
          run: () => choose(table, s.cabinetOps, t('Cette table suit le cadrage de la borne.'), 0),
        },
        ...(s.framing === 'origin'
          ? [{ label: t('Cadrage de l’installation d’origine'), detail: current(true, t('Celui que la table avait avant son ajout')), icon: 'history' as const, tone: 'ok' as Tone, run: () => open(table, 1) }]
          : []),
        ...(s.pov && povName
          ? [
              {
                label: t('POV « {file} »', { file: povName }),
                detail: s.refused ?? current(s.framing === 'pov', t('Préparé pour cette table, appliqué à elle seule')),
                icon: 'eye' as const,
                badge: 'beta' as const,
                tone: (s.refused ? 'warning' : s.framing === 'pov' ? 'ok' : undefined) as Tone | undefined,
                run: () => {
                  if (s.refused) {
                    flash = { text: s.refused, tone: 'warning' };
                    return open(table, 1 + shift);
                  }
                  choose(table, s.applyOps, t('Point de vue « {file} » appliqué à cette table.', { file: povName }), 1);
                },
              },
            ]
          : []),
        {
          label: t('Importer un POV…'),
          detail: t('Un fichier .pov, ou le .ini d’un POV pour VPX 10.8 : Téléchargements, clé USB, disques'),
          icon: 'download',
          badge: 'beta',
          run: () => void importPov(table, (s.pov ? 2 : 1) + shift),
        },
        { label: t('Retour'), icon: 'back', run: () => back(table) },
      ],
      back: () => back(table),
    };
  }

  function back(table: TableEntry): void {
    flash = undefined;
    const target = returnTo;
    returnTo = undefined;
    if (target) target();
    else ctx.back(table);
  }

  function open(table: TableEntry, at?: number): void {
    const s = state(table);
    const cursor = at ?? (s.framing === 'pov' || s.framing === 'origin' ? 1 : 0);
    ctx.show(() => build(table, s), cursor);
  }

  return {
    /** Entrée de la fiche : son détail dit le cadrage actuel. */
    detail: (table: TableEntry) => framingText(state(table)),
    open: (table: TableEntry, back?: () => void) => {
      returnTo = back;
      open(table);
    },
  };
}
