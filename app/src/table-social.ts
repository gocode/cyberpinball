// La fiche d'une table, côté joueurs (maquettes de l'engagement validées le 21/11/2026) :
// - « Sur cette table », à la place des fichiers (rangés dans « Gérer la table… ») : l'objectif (le
//   joueur juste au-dessus de moi), le record du jour, l'ami qui y joue en ce moment, mes amis cette
//   semaine ; une table que personne n'a jouée en ligne : « votre prochain score sera le premier »,
//   jamais un tableau vide ;
// - mon record et mon groupe (table de la semaine) dans les statistiques ;
// - une partie instantanée ouverte sur cette version passe avant « Jouer », qui porte l'objectif ;
// - « Jouer ensemble… » regroupe « Jouer avec un ami » et « Partie instantanée » ; « Défier un
//   joueur » y est, grisé avec sa raison (fonction à venir).
//
// Les données viennent du service des tables du jour (daily-tables.ts) ; library.ts ne fait que
// poser ce que ce module rend.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des services d'essai.

import { countryName, formatNumber, locale, rankingBoard, t, tn, type Presence, type RankingStore, type TableEntry } from '@cyberpinball/core';
import { levelLabel, placeLabel } from './daily-tables-menu';
import type { DailyTablesService, TableGoal } from './daily-tables';
import type { Action, Built, Row, Section } from './library';
import { searchKey } from './rankings-menu';

export interface TableSocialHost {
  library: { openCustom(build: () => Built, at?: number): void };
  service: DailyTablesService;
  net: {
    state(): { friends: readonly { key: string; name: string }[]; key: { publicKey: string } };
    online(key: string): boolean;
    presenceOf(key: string): Presence | undefined;
  };
  /** Mon meilleur score sur cette table, relevé par Cyber Pinball. */
  myBest(table: TableEntry): number | undefined;
  /** Mes groupes dont cette table est la table de la semaine. */
  groupsOf?(table: TableEntry): { name: string; until: string }[];
  /** « Jouer avec un ami » (live-game-menu.ts) et « Partie instantanée » (instant-menu.ts), tels que la fiche les avait. */
  playWithFriend?(table: TableEntry, back: () => void): Action;
  instantGame?(table: TableEntry, back: () => void): Action;
  /** Une partie instantanée ouverte sur cette version, à rejoindre. */
  joinInstant?(board: string, back: () => void): Action | undefined;
}

/** Ce que la fiche pose : sa section, ses statistiques, les actions avant « Jouer », le détail de « Jouer », « Jouer ensemble… ». */
export interface SheetSocial {
  section: Section;
  stats: Row[];
  first: Action[];
  playDetail?: string;
  together: Action;
}

export interface TableSocial {
  sheet(table: TableEntry, back: () => void): SheetSocial;
  openTogether(table: TableEntry, back: () => void): void;
}

/** Amis nommés au plus dans « Vos amis cette semaine ». */
const FRIENDS_NAMED = 3;

export function createTableSocial(host: TableSocialHost): TableSocial {
  const svc = host.service;

  /** « 3ᵉ du jour · France », « 2ᵉ de tout temps dans le monde ». */
  function whereText(rank: number, period: 'today' | 'all', scope: 'world' | 'country' | 'friends'): string {
    const place = placeLabel(rank);
    const country = svc.country();
    if (scope === 'country' && country) {
      const where = countryName(country, locale());
      return period === 'today' ? t('{place} du jour · {where}', { place, where }) : t('{place} de tout temps · {where}', { place, where });
    }
    if (scope === 'friends') return period === 'today' ? t('{place} du jour entre amis', { place }) : t('{place} de tout temps entre amis', { place });
    return period === 'today' ? t('{place} du jour dans le monde', { place }) : t('{place} de tout temps dans le monde', { place });
  }

  /** L'objectif, en tête de « Sur cette table ». */
  function objectiveRow(goal: TableGoal, best: number | undefined): Row | undefined {
    if (goal.state === 'off') return { text: t('En ligne'), detail: goal.reason, icon: 'network', tone: 'quiet' };
    if (goal.state === 'pending') return { text: t('Objectif'), detail: t('Empreinte de la table en calcul…'), icon: 'star', tone: 'quiet' };
    if (goal.state === 'none') return { text: t('En ligne'), detail: t('Version de la table illisible : pas de classement'), icon: 'info', tone: 'quiet' };
    const o = goal.objective;
    if (!o) return { text: t('En ligne'), detail: t('Personne d’autre ne l’a encore jouée : votre prochain score sera le premier du classement'), icon: 'star', tone: 'info' };
    if (o.leader) return { text: t('Vous êtes {place}', { place: whereText(1, o.period, o.scope) }), detail: t('Personne au-dessus de vous : défendez votre place'), icon: 'trophy', tone: 'ok' };
    const target = o.target!;
    const gap = o.mine ? t('à {gap} de votre record', { gap: formatNumber(o.gap ?? 0) }) : best ? t('à {gap} de votre record', { gap: formatNumber(target.score - best) }) : t('pas encore de score pour vous');
    const level = levelLabel(target);
    return {
      text: t('Objectif : {name} · {score}', { name: target.name, score: formatNumber(target.score) }),
      detail: [whereText(target.rank, o.period, o.scope), gap].join(' · '),
      avatar: svc.face(target),
      ...(level ? { aside: level } : {}),
      tone: 'ok',
    };
  }

  /** Le record du jour : son auteur, la portée, les parties du jour. */
  function recordRow(goal: TableGoal): Row | undefined {
    if (goal.state !== 'ok' || !goal.record) return undefined;
    const r = goal.record;
    const country = svc.country();
    const where = goal.recordScope === 'country' && country ? countryName(country, locale()) : t('Monde');
    const line = svc.board(goal.recordScope, 'today').lines.find((l) => l.board === goal.board && (l.balls ?? undefined) === (goal.balls ?? undefined));
    const level = levelLabel(r);
    return {
      text: t('Record du jour : {name} · {score}', { name: r.mine ? t('vous') : r.name, score: formatNumber(r.score) }),
      detail: [where, line ? tn(line.plays, '{n} partie aujourd’hui', '{n} parties aujourd’hui') : undefined].filter(Boolean).join(' · '),
      avatar: svc.face(r),
      ...(level ? { aside: level } : {}),
      ...(r.mine ? { tone: 'ok' as const } : {}),
    };
  }

  /** Mes amis sur cette version cette semaine : leur meilleur score, les meilleurs d'abord. */
  function friendsWeek(goal: TableGoal): string | undefined {
    if (goal.state !== 'ok') return undefined;
    const s = host.net.state();
    if (!s.friends.length) return undefined;
    const data = svc.input();
    const board = rankingBoard(data.store as RankingStore, { board: goal.board, ...(goal.balls ? { balls: goal.balls } : {}), period: 'week', scope: 'friends', friends: data.friends, me: s.key.publicKey, limit: FRIENDS_NAMED + 1 });
    const others = board.lines.filter((l) => !l.mine).slice(0, FRIENDS_NAMED);
    return others.map((l) => `${l.name} ${formatNumber(l.score)}`).join(' · ');
  }

  /** Un ami en partie sur cette table en ce moment (sa présence, entre amis). */
  function friendPlaying(table: TableEntry): { key: string; name: string } | undefined {
    const key = searchKey(table.title);
    return host.net.state().friends.find((f) => {
      if (!host.net.online(f.key)) return false;
      const p = host.net.presenceOf(f.key);
      return p?.status === 'playing' && Boolean(p.table) && searchKey(p.table!.title) === key;
    });
  }

  function sheet(table: TableEntry, back: () => void): SheetSocial {
    const goal = svc.goalOf(table);
    const best = host.myBest(table);
    const rows: Row[] = [];
    const objective = objectiveRow(goal, best);
    if (objective) rows.push(objective);
    const record = recordRow(goal);
    if (record) rows.push(record);
    const week = friendsWeek(goal);
    const playing = friendPlaying(table);
    if (playing) rows.push({ text: t('{name} y joue en ce moment', { name: playing.name }), ...(week ? { detail: t('Vos amis cette semaine : {list}', { list: week }) } : {}), avatar: svc.face({ key: playing.key, name: playing.name }), badges: [t('En partie')] });
    else if (week !== undefined) rows.push({ text: t('Vos amis cette semaine'), detail: week || t('Aucun n’y a joué cette semaine'), icon: 'friends' });

    // Statistiques : mon record (et ma place du jour), mon groupe.
    const stats: Row[] = [];
    const o = goal.state === 'ok' ? goal.objective : undefined;
    if (best) stats.push({ text: t('Votre record'), detail: [formatNumber(best), o?.myRank && o.period === 'today' ? whereText(o.myRank, 'today', o.scope) : undefined].filter(Boolean).join(' · ') });
    for (const g of host.groupsOf?.(table) ?? []) stats.push({ text: t('Votre groupe'), detail: t('{group} : table de la semaine {until}', { group: g.name, until: g.until }) });

    const first: Action[] = [];
    const join = goal.state === 'ok' ? host.joinInstant?.(goal.board, back) : undefined;
    if (join) first.push(join);

    const playDetail =
      goal.state !== 'ok' ? undefined
      : o?.target ? t('Objectif : battre {name}, {score}', { name: o.target.name, score: formatNumber(o.target.score) })
      : o?.leader ? t('Défendre votre place')
      : t('Premier score en ligne de cette table');
    return {
      section: { title: t('Sur cette table'), rows },
      stats,
      first,
      ...(playDetail ? { playDetail } : {}),
      together: { label: t('Jouer ensemble…'), detail: t('Avec un ami, partie instantanée, défier un joueur'), icon: 'gamepad', run: () => openTogether(table, back) },
    };
  }

  /** « Jouer ensemble » : ce qui est possible tout de suite en tête, puis les trois façons. */
  function buildTogether(table: TableEntry, back: () => void): Built {
    const here = () => host.library.openCustom(() => buildTogether(table, back));
    const goal = svc.goalOf(table);
    const actions: Action[] = [];
    const join = goal.state === 'ok' ? host.joinInstant?.(goal.board, here) : undefined;
    if (join) actions.push(join);
    if (host.playWithFriend) actions.push({ ...host.playWithFriend(table, here), label: t('Jouer avec un ami…'), icon: 'friend-list' });
    if (host.instantGame) actions.push({ ...host.instantGame(table, here), label: t('Ouvrir une partie instantanée…'), icon: 'globe' });
    actions.push({ label: t('Défier un joueur…'), detail: t('Bientôt : 48 h pour battre votre score, chacun quand il veut'), icon: 'trophy', tone: 'quiet', run: () => undefined });
    actions.push({ label: t('Retour à la fiche'), icon: 'back', run: back });
    const friends = host.net.state().friends.filter((f) => host.net.online(f.key));
    const sections: Section[] = friends.length
      ? [{ rows: [{ text: t('Amis en ligne'), detail: friends.map((f) => (host.net.presenceOf(f.key)?.status === 'playing' ? t('{name} en partie', { name: f.name }) : f.name)).join(' · '), avatars: friends.slice(0, 6).map((f) => svc.face({ key: f.key, name: f.name })), icon: 'friends' }] }]
      : [];
    return {
      heading: t('Jouer ensemble'),
      icon: 'gamepad',
      subheading: [table.title, table.manufacturer, table.year].filter(Boolean).join(' · '),
      lead: t('Même version de la table pour tous : les scores comptent au classement.'),
      sections,
      actions,
      back,
    };
  }

  function openTogether(table: TableEntry, back: () => void): void {
    host.library.openCustom(() => buildTogether(table, back));
  }

  return { sheet, openTogether };
}
