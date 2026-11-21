// Classements > Tables du jour (maquettes de l'engagement validées le 21/11/2026) : les tables les
// plus jouées aujourd'hui dans le monde, le pays ou entre amis ; sur chaque ligne, le record du jour
// (l'avatar et le niveau de son auteur), ma place et mon écart au joueur juste au-dessus. Start lance
// la table. Une version qui n'est pas la mienne reste visible, grisée, avec « Récupérer cette
// version » chez un ami qui l'a ; une table que je n'ai pas, de même.
//
// Ne pas refroidir : sous le seuil de joueurs du jour, la semaine se montre (dailytables.ts), et une
// portée où personne n'a joué propose mes dernières tables : « votre prochain score sera le premier ».
// Jamais un tableau vide.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un service d'essai.

import { countryName, DAILY_SCOPES, formatNumber, lastRunOf, locale, t, tn, type DailyBoard, type DailyLine, type DailyScope, type FlagView, flagView, type TableEntry } from '@cyberpinball/core';
import type { DailyTablesService, LocalMatch } from './daily-tables';
import type { Action, Built, Row, Section } from './library';

export interface DailyTablesMenuHost {
  library: { openCustom(build: () => Built, at?: number): void };
  service: DailyTablesService;
  tables(): readonly TableEntry[];
  /** Lancer une de mes tables. */
  play(table: TableEntry): void;
  /** Les amis dont la bibliothèque partagée a cette version exacte, et de quoi la récupérer chez chacun. */
  versionHolders?(board: string): { key: string; name: string; fetch(back: () => void): void }[];
  /** Touches MagnaSave relevées (la gauche d'abord) : la portée suivante, ou la précédente. */
  zoneKeys(): readonly string[];
  openSharing(back: () => void): void;
}

export interface DailyTablesMenu {
  open(back: () => void): void;
  /** Ce que dit la porte des Classements (ou un onglet de l'Arène). */
  detail(): string;
}

/** Mes dernières tables proposées quand personne n'a joué : la course s'ouvre avec elles. */
const RECENT_OFFERED = 5;

/** « 4ᵉ », « 1ᵉʳ » : une place. */
export const placeLabel = (rank: number): string => (rank === 1 ? t('1ᵉʳ') : t('{n}ᵉ', { n: rank }));

/** « Niv. 24 », « Niv. ? » : le niveau d'un joueur à côté de son nom. */
export const levelLabel = (h: { level?: number; levelUnsure?: true }): string | undefined => (h.level ? t('Niv. {n}', { n: h.level }) : h.levelUnsure ? t('Niv. ?') : undefined);

export function createDailyTablesMenu(host: DailyTablesMenuHost): DailyTablesMenu {
  const svc = host.service;
  let back: () => void = () => undefined;
  let scope: DailyScope = 'country';

  const scopeLabel = (sc: DailyScope) => (sc === 'world' ? t('Monde') : sc === 'friends' ? t('Amis') : svc.country() ? countryName(svc.country()!, locale()) : t('Pays'));

  /** Pourquoi une portée ne montre rien (partage coupé, pays non choisi, aucun ami). */
  function scopeUnavailable(sc: DailyScope): string | undefined {
    const off = svc.unavailable();
    if (off) return off;
    if (sc === 'country' && !svc.country()) return t('Pays non choisi : Mon profil > Mon pays');
    if (sc === 'friends' && !svc.friends()) return t('Aucun ami pour l’instant');
    return undefined;
  }

  /** La portée d'ouverture : mon pays, sinon le monde. */
  const firstScope = (): DailyScope => (scopeUnavailable('country') ? 'world' : 'country');

  function playsText(line: Pick<DailyLine, 'plays' | 'unsure'>): string {
    const n = tn(line.plays, '{n} partie', '{n} parties');
    return line.unsure ? `${n} ?` : n;
  }

  /** « Record du jour : Paul · Niv. 24 · 10 340 000 ». */
  function recordText(line: DailyLine, board: DailyBoard): string {
    if (!line.record) return t('Aucun score publié : votre score sera le premier');
    const who = [line.record.mine ? t('vous') : line.record.name, levelLabel(line.record), formatNumber(line.record.score)].filter(Boolean).join(' · ');
    return board.period === 'today' ? t('Record du jour : {who}', { who }) : t('Record de la semaine : {who}', { who });
  }

  /** Ma ligne : ma place et mon écart, ou ce que j'ai de cette table. */
  function mineText(line: DailyLine, board: DailyBoard, local: LocalMatch, holder: { name: string } | undefined): string {
    if (local.state === 'pending') return t('Empreinte de la table en calcul…');
    if (local.state === 'other')
      return holder ? t('Autre version que la vôtre · Start : récupérer cette version chez {name}', { name: holder.name }) : t('Autre version que la vôtre · récupérer cette version : aucun ami ne l’a pour l’instant');
    if (local.state === 'missing') return holder ? t('Vous n’avez pas cette table · Start : la récupérer chez {name}', { name: holder.name }) : t('Vous n’avez pas cette table');
    const me = line.me;
    if (!me) return board.period === 'today' ? t('Pas encore jouée aujourd’hui') : t('Pas encore jouée cette semaine');
    if (!me.above) return t('Vous : {score} · {place}, le record est à vous', { score: formatNumber(me.score), place: placeLabel(me.rank) });
    return t('Vous : {score} · {place} · à {gap} de {name} ({above})', { score: formatNumber(me.score), place: placeLabel(me.rank), gap: formatNumber(me.gap ?? 0), name: me.above.name, above: placeLabel(me.above.rank) });
  }

  function lineRow(line: DailyLine, board: DailyBoard, actions: Action[], here: () => void): Row {
    const local = svc.localFor(line);
    const holder = local.state === 'other' || local.state === 'missing' ? host.versionHolders?.(line.board)[0] : undefined;
    const run =
      local.state === 'mine'
        ? () => host.play(local.table)
        : holder
          ? () => holder.fetch(here)
          : () => undefined;
    const label = local.state === 'mine' ? t('Jouer · {title}', { title: line.title }) : holder ? t('Récupérer cette version · {title}', { title: line.title }) : line.title;
    const action = actions.push({ label, key: `daily:${line.board}|${line.balls ?? ''}`, icon: local.state === 'mine' ? 'play' : 'download', run }) - 1;
    const aside = local.state === 'mine' ? (line.me ? placeLabel(line.me.rank) : '—') : local.state === 'pending' ? '…' : local.state === 'other' ? t('autre version') : t('absente');
    return {
      text: `${line.title} · ${playsText(line)}`,
      detail: recordText(line, board),
      sub: mineText(line, board, local, holder),
      ...(line.record ? { avatar: svc.face(line.record) } : { icon: 'star' as const }),
      aside,
      ...(local.state === 'mine' ? (line.record?.mine ? { tone: 'ok' as const } : {}) : { tone: 'quiet' as const }),
      action,
      pick: true,
    };
  }

  /** Personne n'a joué dans cette portée : mes dernières tables, la course s'ouvre avec elles. */
  function calmRows(board: DailyBoard, actions: Action[]): Row[] {
    const recent = host
      .tables()
      .filter((x) => lastRunOf(x) > 0)
      .sort((a, b) => lastRunOf(b) - lastRunOf(a))
      .slice(0, RECENT_OFFERED);
    const head: Row = {
      text: board.period === 'today' ? t('Personne n’a encore joué aujourd’hui') : t('Personne n’a encore joué cette semaine'),
      detail: t('Votre prochain score sera le premier du classement'),
      icon: 'info',
      tone: 'info',
    };
    const rows = recent.map((table): Row => {
      const action = actions.push({ label: t('Jouer · {title}', { title: table.title }), key: `recent:${table.file}`, icon: 'play', run: () => host.play(table) }) - 1;
      return { text: table.title, detail: t('Jouée récemment : ouvrez le classement'), icon: 'play', action, pick: true };
    });
    return [head, ...rows];
  }

  function dateLabel(): string {
    return new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function build(): Built {
    const here = () => host.library.openCustom(build, DAILY_SCOPES.length);
    const actions: Action[] = [];
    const sections: Section[] = [];
    const boards = new Map(DAILY_SCOPES.map((sc) => [sc, scopeUnavailable(sc) ? undefined : svc.board(sc)] as const));
    const tabs = DAILY_SCOPES.map((sc) => {
      const why = scopeUnavailable(sc);
      const b = boards.get(sc);
      const action = actions.push({ label: t('Onglet {period}', { period: scopeLabel(sc) }), key: `scope-${sc}`, run: () => ((scope = sc), here()) }) - 1;
      const flag: FlagView | undefined = sc === 'country' && svc.country() ? flagView(svc.country()!, locale()) : undefined;
      return { label: scopeLabel(sc), count: why ?? playsText({ plays: b?.plays ?? 0 }), current: sc === scope, disabled: Boolean(why), action, ...(flag ? { flag } : {}) };
    });
    const why = scopeUnavailable(scope);
    const board = boards.get(scope);
    if (why || !board) {
      sections.push({ rows: [{ text: why ?? t('Indisponible'), icon: 'info', tone: 'quiet' }] });
      if (svc.unavailable()) actions.push({ label: t('Partage et réseau'), icon: 'network', run: () => host.openSharing(here) });
    } else if (!board.lines.length) {
      sections.push({ rows: calmRows(board, actions) });
    } else {
      sections.push({ rows: board.lines.map((l) => lineRow(l, board, actions, here)) });
    }
    actions.push({ label: t('Retour : Classements'), icon: 'back', key: 'back', run: () => back() });
    const calm = board?.period === 'week';
    return {
      heading: t('Tables du jour'),
      icon: 'trophy',
      subheading: calm ? t('Peu de parties aujourd’hui : les plus jouées cette semaine') : t('Les plus jouées aujourd’hui · {date}', { date: dateLabel() }),
      tabs,
      sections,
      actions,
      back: () => back(),
      hint: t('Flippers : choisir · Start : jouer · MagnaSave : portée suivante · Exit : retour'),
      listHint: t('Flippers : parcourir · Start : jouer · MagnaSave : portée suivante · Exit : sortir de la liste'),
      keys: (input) => {
        const magna = host.zoneKeys();
        if (!magna.includes(input.code)) return false;
        const dir = magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
        const at = DAILY_SCOPES.indexOf(scope);
        scope = DAILY_SCOPES[(at + dir + DAILY_SCOPES.length) % DAILY_SCOPES.length]!;
        here();
        return true;
      },
    };
  }

  return {
    open(to) {
      back = to;
      scope = firstScope();
      // Le curseur sur la première table, juste après les onglets.
      host.library.openCustom(build, DAILY_SCOPES.length);
    },
    detail() {
      if (svc.unavailable()) return t('Indisponible : {why}', { why: svc.unavailable()! });
      const board = svc.board(firstScope());
      const top = board.lines[0];
      if (!top) return t('Les plus jouées aujourd’hui, le record du jour, votre écart');
      return board.period === 'today' ? t('{title} en tête aujourd’hui · {plays}', { title: top.title, plays: playsText(top) }) : t('{title} en tête cette semaine · {plays}', { title: top.title, plays: playsText(top) });
    },
  };
}
