// Fiche d'une table > Gérer la table… > Point de vue (bêta, 22/11/2026 ; images du cadrage, 23/11/2026) : ce qui cadre
// la table, et le choix du joueur, chaque cadrage montré sur une image de la table rendue par VPX (framing-preview.ts)
// en vue borne, jamais à l'aveugle :
// - « Cadrage de la borne » : le style choisi pour toutes les tables (Menu système › Ma borne › VPX › Cadrage des tables) ;
// - les autres styles, pour cette table seule (framing-styles.ts) ;
// - « POV … » : le point de vue préparé pour cette table et fourni avec elle (.pov, ou « <table> POV.ini »), appliqué à
//   elle seule en cadrage manuel, si les flippers restent du côté du joueur sur cette borne (packages/core/src/povview.ts) ;
// - le cadrage de l'installation d'origine d'une table reprise (packages/core/src/origin-framing.ts), y compris pour une
//   table reprise avant qu'il soit figé à l'ajout, quand cette installation est encore sur le disque ;
// - « Importer un POV… » : un POV trouvé ailleurs (Téléchargements, clé USB…), rangé avec la table puis appliqué ;
// - « Au plus près des coins » en deux variantes, écran incliné ou à plat (essais, bêta) : pour cette table seule, jamais pour la borne
//   (framing-close-corners.ts) ;
// - « Rétablir le cadrage précédent » : chaque choix garde le .ini d'avant (framing-history.ts) ;
// - « Ma vue personnalisée » : la dernière vue réglée par le joueur dans le menu de VPX, gardée quand un autre cadrage la
//   remplace (framing-custom.ts), pour y revenir sans la perdre.
// Une vue enregistrée pour la table dans le menu de VPX (« Régler l'affichage en partie ») est dite comme telle.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLOSE_CORNERS_VARIANTS,
  closeCornersVariant,
  customViewHolds,
  customViewOf,
  DEFAULT_FRAMING_STYLE,
  findTableIni,
  FRAMING_STYLE_KEYS,
  framingHistory,
  framingStyleLabel,
  framingStyleOf,
  framingStyles,
  framingStyleSettings,
  importPovOps,
  IniDocument,
  isVpxCabinetView,
  originFramingOf,
  rememberCustomView,
  rememberFraming,
  restoreFramingOps,
  savedCustomView,
  stripCloseCorners,
  t,
  tablePovState,
  tLater,
  withCloseCorners,
  withCustomView,
  withOriginFraming,
  withTableFramingStyle,
  type CustomView,
  type FileOp,
  type FramingStyle,
  type OriginFramingNote,
  type PlayfieldOrientation,
  type TableEntry,
  type TablePovState,
} from '@cyberpinball/core';
import { playerRotation, previewRequest, previewThumb, type FramingSupport } from './cadrage-menu';
import type { PickRequest } from './file-picker';
import { onGesture } from './gesture-flash';
import type { Action, Built, Row, Tone } from './library';
import type { MediaCard } from './library-medias';
import { originPlan } from './origin-framing';

export interface TablePovContext {
  show(build: () => Built, at?: number): void;
  pick(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  /** Le playfield de la borne tel que VPX le verra ; undefined sans assistant d'écrans fait. */
  orientation(): PlayfieldOrientation | undefined;
  /** Écrit les fichiers (l'ancien .ini de la table va à la corbeille). */
  apply(ops: FileOp[]): void;
  /** Retour à la fiche de la table. */
  back(table: TableEntry): void;
  /** La table relue (son .info a pu changer). */
  fresh(table: TableEntry): TableEntry;
  dataDir(): string;
  /** Aperçus rendus par VPX et style de la borne ; absent : pas d'images. */
  framing?(): FramingSupport | undefined;
  /**
   * La table d'une autre installation du PC dont celle-ci est la copie, et le VPX qui l'y jouait (findOriginTable) ;
   * absent : pas de recherche (essais).
   */
  findOrigin?(tableFile: string): { vpx: string; exe: string } | undefined;
  /**
   * « Chercher un POV en ligne… » : la partie « Point de vue » de « Parties du jeu » (propositions de la base des tables,
   * de VPUniverse, de VPForums, de Téléchargements, et la recherche sur le web) ; `back` revient à cet écran.
   */
  findOnline?(table: TableEntry, back: () => void): void;
}

/** Le cadrage actuel de la table, en quelques mots (détail de l'entrée de la fiche). */
export function framingText(state: TablePovState): string {
  if (state.framing === 'pov' && state.pov) return t('POV « {file} »', { file: path.basename(state.pov.file) });
  if (state.framing === 'own') return t('Vue réglée pour cette table');
  if (state.framing === 'origin') return t('Cadrage de l’installation d’origine');
  return t('Cadrage de la borne');
}

/** Un cadrage proposé : ce qu'il donne (le .ini de la table, pour l'image) et ce qu'il faut écrire pour le prendre. */
interface Option {
  key: string;
  label: string;
  detail: string;
  current: boolean;
  /** Le .ini de la table avec ce cadrage : l'aperçu en est rendu. */
  ini: string;
  /** Écritures qui le prennent ; absentes s'il est déjà en place. */
  ops?: FileOp[];
  refused?: string;
  badge?: 'beta';
}

/** Le .ini de la table sans cadrage propre : le mode de la borne écrit (sans lui, un POV ou une vue reprise reviendrait). */
export function borneIni(tableIni: string, borneStyle: FramingStyle, keepTop: boolean, note?: OriginFramingNote): string {
  const doc = IniDocument.parse(tableIni);
  stripCloseCorners(doc);
  for (const key of [...FRAMING_STYLE_KEYS, ...(note?.keys ?? [])]) doc.remove('Player', key);
  doc.set('Player', 'CabinetAutofitMode', framingStyleSettings(borneStyle, keepTop)[0]!.value);
  return doc.toString();
}

export function createTablePov(ctx: TablePovContext) {
  let flash: { text: string; tone: Tone } | undefined;
  let returnTo: (() => void) | undefined;
  /** Installation d'origine retrouvée pour une table reprise avant 0.2.4-essai.9 : cherchée une fois par table. */
  const origins = new Map<string, { vpx: string; exe: string } | null>();
  const failures = new Map<string, string>();
  // Montré à chaque dessin jusqu'au geste suivant, jamais effacé par build() (gesture-flash.ts).
  onGesture(() => (flash = undefined));

  function state(table: TableEntry): TablePovState {
    return tablePovState(table.file, ctx.orientation(), table);
  }

  const readIni = (table: TableEntry) => {
    const ini = findTableIni(table.file);
    return { path: ini.path, text: ini.exists ? fs.readFileSync(ini.path, 'utf8') : undefined };
  };

  /** La vue réglée par le joueur pour cette table, gardée avant qu'un autre cadrage la remplace (ou un retour arrière). */
  function keepCustomView(table: TableEntry, iniText: string | undefined): void {
    if (iniText !== undefined && state(table).framing === 'own') rememberCustomView(ctx.dataDir(), table.file, iniText);
  }

  /** Applique un choix : l'état d'avant est gardé pour « Rétablir le cadrage précédent ». */
  function choose(table: TableEntry, ops: FileOp[] | undefined, done: string, label: string, at: number): void {
    try {
      if (ops?.length) {
        const ini = readIni(table);
        keepCustomView(table, ini.text);
        const note = originFramingOf(table.info);
        rememberFraming(ctx.dataDir(), table.file, { at: new Date().toISOString(), label, ini: ini.text ?? null, ...(note ? { note } : {}) });
        ctx.apply(ops);
      }
      flash = { text: done, tone: 'ok' };
    } catch (err) {
      flash = { text: t('Écriture impossible : {error}', { error: (err as Error).message }), tone: 'error' };
    }
    open(ctx.fresh(table), at);
  }

  function restore(table: TableEntry, at: number): void {
    const ini = readIni(table);
    const plan = restoreFramingOps(ctx.dataDir(), table.file, ini.path);
    if (!plan) return open(table, at);
    keepCustomView(table, ini.text);
    try {
      const info: FileOp = { op: 'write', path: table.infoFile, content: JSON.stringify(withOriginFraming(table.info, plan.snapshot.note), null, 2) + '\n' };
      ctx.apply([...plan.ops, info]);
      plan.commit();
      flash = { text: t('Cadrage précédent rétabli : {label}.', { label: plan.snapshot.label }), tone: 'ok' };
    } catch (err) {
      flash = { text: t('Écriture impossible : {error}', { error: (err as Error).message }), tone: 'error' };
    }
    open(ctx.fresh(table), at);
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
    choose(table, after.applyOps, t('Point de vue « {file} » importé et appliqué à cette table.', { file: path.basename(paths[0]) }), framingText(after), 1);
  }

  /** Les cadrages proposés pour la table, dans l'ordre de l'écran. */
  function options(table: TableEntry, s: TablePovState): Option[] {
    const support = ctx.framing?.();
    const keepTop = support?.keepTop() ?? false;
    const borneStyle = support?.current() ?? DEFAULT_FRAMING_STYLE;
    const ini = readIni(table);
    const text = ini.text ?? '';
    const note = originFramingOf(table.info);
    const forget: FileOp[] = note ? [{ op: 'write', path: table.infoFile, content: JSON.stringify(withOriginFraming(table.info, undefined), null, 2) + '\n' }] : [];
    const base = borneIni(text, borneStyle, keepTop, note);
    const orientation = ctx.orientation();
    const global = IniDocument.parse(orientation?.globalIni ?? '');
    const own = IniDocument.parse(text);
    // Un style choisi pour cette table seule : le mode écrit dans son .ini, sans vue manuelle ni cadrage d'origine.
    const closeCorners = s.framing === 'cabinet' ? closeCornersVariant(own) : undefined;
    const tableStyle =
      s.framing === 'cabinet' && closeCorners === undefined && (own.get('Player', 'CabinetAutofitMode')?.trim() ?? '') !== ''
        ? framingStyleOf((sec, key) => {
            const v = own.get(sec, key);
            return v !== undefined && v.trim() !== '' ? v : global.get(sec, key);
          }, keepTop)
        : undefined;
    const list: Option[] = [];
    const onBorne = s.framing === 'cabinet' && closeCorners === undefined && (tableStyle === undefined || tableStyle === borneStyle);
    list.push({
      key: 'borne',
      label: t('Cadrage de la borne'),
      detail: t('{style}, comme toutes les tables', { style: framingStyleLabel(borneStyle) }),
      current: onBorne,
      ini: onBorne ? text : base,
      ...(onBorne ? {} : { ops: [{ op: 'write' as const, path: ini.path, content: base }, ...forget] }),
    });
    if (support) {
      for (const style of framingStyles(keepTop).filter((x) => x !== borneStyle)) {
        const next = withTableFramingStyle(base, style, keepTop);
        const current = !onBorne && tableStyle === style;
        list.push({
          key: `style:${style}`,
          label: t('{style}, pour cette table', { style: framingStyleLabel(style) }),
          detail: t('Pour elle seule ; les autres tables gardent le cadrage de la borne'),
          current,
          ini: current ? text : next,
          ...(current ? {} : { ops: [{ op: 'write' as const, path: ini.path, content: next }, ...forget] }),
        });
      }
      // Essais : les coins du plateau au plus près de ceux de l'écran (framing-close-corners.ts), pour cette table seule,
      // selon que l'écran de la borne est incliné ou à plat.
      if (keepTop) {
        for (const variant of CLOSE_CORNERS_VARIANTS) {
          const next = withCloseCorners(base, variant);
          const current = closeCorners === variant;
          list.push({
            key: `coins:${variant}`,
            label: variant === 'incline' ? t('Au plus près des coins, écran incliné') : t('Au plus près des coins, écran à plat'),
            detail:
              variant === 'incline'
                ? t('Essai pour cette table seule : le fond du plateau est un peu tronqué pour que ses coins restent dans ceux de l’écran incliné. Le résultat dépend de la table : compare les aperçus.')
                : t('Essai pour cette table seule : pour un écran posé à plat, sans inclinaison ; étire davantage pour rapprocher les coins du plateau de ceux de l’écran. Le résultat dépend de la table : compare les aperçus.'),
            current,
            ini: current ? text : next,
            badge: 'beta',
            ...(current ? {} : { ops: [{ op: 'write' as const, path: ini.path, content: next }, ...forget] }),
          });
        }
      }
    }
    if (s.framing === 'origin' && note) {
      list.push({ key: 'origin', label: t('Cadrage de l’installation d’origine'), detail: t('Celui que la table avait avant son ajout ({from})', { from: note.from }), current: true, ini: text });
    } else {
      const found = origins.get(table.file.toLowerCase());
      const plan = found && orientation ? originPlan(found.vpx, found.exe, orientation) : undefined;
      if (plan?.note) {
        const next = plan.ini ?? '';
        const info: FileOp = { op: 'write', path: table.infoFile, content: JSON.stringify(withOriginFraming(table.info, plan.note), null, 2) + '\n' };
        list.push({
          key: 'origin',
          label: t('Cadrage de l’installation d’origine'),
          detail: t('Retrouvé dans {folder} ({from})', { folder: path.dirname(found!.vpx), from: plan.note.from }),
          current: false,
          ini: next,
          ops: [{ op: 'write', path: ini.path, content: next }, info],
        });
      }
    }
    if (s.pov) {
      const povName = path.basename(s.pov.file);
      const current = s.framing === 'pov';
      const applied = s.applyOps?.find((o) => o.op === 'write' && o.path === ini.path);
      list.push({
        key: 'pov',
        label: t('POV « {file} »', { file: povName }),
        detail: s.refused ?? t('Préparé pour cette table, appliqué à elle seule'),
        current,
        ini: current ? text : applied && 'content' in applied ? String(applied.content) : text,
        ...(s.applyOps && !current ? { ops: s.applyOps } : {}),
        ...(s.refused ? { refused: s.refused } : {}),
        badge: 'beta',
      });
    }
    if (s.framing === 'own') list.push({ key: 'own', label: t('Vue réglée pour cette table'), detail: t('Enregistrée pour elle dans le menu de VPX, ou reprise d’une autre installation'), current: true, ini: text });
    else {
      // Une vue réglée par le joueur, remplacée depuis : gardée à part, sinon encore dans le .ini sous un style automatique.
      const left = s.framing === 'cabinet' ? customViewOf(text) : [];
      const custom: CustomView | undefined = left.length ? { at: '', values: left } : savedCustomView(ctx.dataDir(), table.file);
      if (custom && !customViewHolds(text, custom)) {
        const next = withCustomView(text, custom, note?.keys ?? []);
        list.push({
          key: 'custom',
          label: t('Ma vue personnalisée'),
          detail: t('La dernière vue que tu as réglée pour cette table dans le menu de VPX'),
          current: false,
          ini: next,
          ops: [{ op: 'write' as const, path: ini.path, content: next }, ...forget],
        });
      }
    }
    return list;
  }

  function build(table: TableEntry, s: TablePovState): Built {
    const current = (on: boolean, detail: string) => (on ? t('{detail} · choix actuel', { detail }) : detail);
    const rows: Row[] = [];
    if (flash) rows.push({ text: flash.text, tone: flash.tone });
    const list = options(table, s);
    const orientation = ctx.orientation();
    const support = ctx.framing?.();
    const cabinet = Boolean(orientation && isVpxCabinetView(IniDocument.parse(orientation.globalIni).get('Player', 'BGSet')));
    const history = framingHistory(ctx.dataDir(), table.file);
    const actions: Action[] = list.map((o, i) => ({
      label: o.label,
      detail: o.refused ?? current(o.current, o.detail),
      icon: (['frame', 'crop', 'resize-width', 'history', 'eye', 'sliders'] as const)[Math.min(i, 5)]!,
      ...(o.badge ? { badge: o.badge } : {}),
      tone: o.refused ? 'warning' : o.current ? 'ok' : undefined,
      run: () => {
        if (o.refused) {
          flash = { text: o.refused, tone: 'warning' };
          return open(table, i);
        }
        const now = list.find((x) => x.current);
        choose(table, o.ops, t('{label} : choisi pour cette table.', { label: o.label }), now?.label ?? framingText(s), i);
      },
    }));
    const importAt = actions.length;
    actions.push({ label: t('Importer un POV…'), detail: t('Un fichier .pov, ou le .ini d’un POV pour VPX 10.8 : Téléchargements, clé USB, disques'), icon: 'download', badge: 'beta', run: () => void importPov(table, importAt) });
    if (ctx.findOnline) {
      const at = actions.length;
      actions.push({ label: t('Chercher un POV en ligne…'), detail: t('Base des tables, VPUniverse, VPForums, Téléchargements et le web : le POV choisi est rangé avec la table'), icon: 'link', badge: 'beta', run: () => ctx.findOnline!(table, () => open(ctx.fresh(table), at)) });
    }
    if (history.length) {
      const at = actions.length;
      actions.push({ label: t('Rétablir le cadrage précédent'), detail: history.at(-1)!.label, icon: 'restore', run: () => restore(table, at) });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: () => back(table) });
    // Les images : en vue borne seulement, quand VPX sait les rendre.
    let media: Built['media'];
    if (cabinet && orientation && support) {
      const rotation = playerRotation(orientation.edge);
      const { width, height } = orientation.window.bounds;
      const cards: MediaCard[] = list.map((o, i) => {
        const request = previewRequest(support, table, orientation, o.ini);
        return {
          action: i,
          title: o.label,
          description: o.detail,
          ...(o.current ? { state: { label: t('Choix actuel'), tone: 'ok' as const } } : {}),
          thumb: previewThumb(support.previews.cached(request), rotation, failures.get(`${table.file}|${o.key}`)),
        };
      });
      media = { cards, gallery: true, aspect: rotation % 180 === 0 ? `${width} / ${height}` : `${height} / ${width}` };
    }
    return {
      heading: t('Point de vue'),
      icon: 'crop',
      subheading: table.title,
      lead: t('Ce qui cadre cette table sur l’écran du plateau, chaque choix montré sur la table rendue par VPX. Le sens de la table est toujours vérifié : un point de vue qui la mettrait de travers sur cette borne est refusé.'),
      sections: rows.length ? [{ rows }] : [],
      ...(media ? { media } : {}),
      actions,
      back: () => back(table),
    };
  }

  /** Les images qui manquent, rendues l'une après l'autre ; l'écran se redessine à chacune. */
  function renderMissing(table: TableEntry, s: TablePovState): void {
    const orientation = ctx.orientation();
    const support = ctx.framing?.();
    if (!orientation || !support || !isVpxCabinetView(IniDocument.parse(orientation.globalIni).get('Player', 'BGSet'))) return;
    for (const o of options(table, s)) {
      const request = previewRequest(support, table, orientation, o.ini);
      if (support.previews.cached(request)) continue;
      const key = `${table.file}|${o.key}`;
      failures.delete(key);
      support.previews
        .render(request)
        .catch((error: Error) => {
          failures.set(key, t('Aperçu impossible : la table n’a pas démarré.'));
          support.log?.(`Point de vue : aperçu « ${o.key} » de ${path.basename(table.file)} impossible (${error.message}).`); // i18n-ignore : journal
        })
        .finally(() => support.refresh());
    }
  }

  /** L'installation d'origine d'une table reprise avant qu'elle soit notée : cherchée une fois, sans bloquer l'écran. */
  function lookForOrigin(table: TableEntry): void {
    const key = table.file.toLowerCase();
    if (!ctx.findOrigin || origins.has(key) || originFramingOf(table.info)) return;
    origins.set(key, null);
    setTimeout(() => {
      try {
        const found = ctx.findOrigin?.(table.file);
        if (!found) return;
        origins.set(key, found);
        const fresh = ctx.fresh(table);
        renderMissing(fresh, state(fresh));
        ctx.framing?.()?.refresh();
      } catch {
        // Installations illisibles : rien à proposer.
      }
    }, 0);
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
    const cursor = at ?? Math.max(0, options(table, s).findIndex((o) => o.current));
    ctx.show(() => build(ctx.fresh(table), state(ctx.fresh(table))), cursor);
    renderMissing(table, s);
    lookForOrigin(table);
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
