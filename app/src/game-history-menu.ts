// Menu système > Amis > Historique des parties (packages/core/src/gamehistory.ts) : les parties
// entre amis finies sur cette borne, de la plus récente à la plus ancienne, rangées par jour ; la
// table en titre, les joueurs dessous avec leur rang et leur score. On ouvre une partie pour revoir
// son détail : la version de la table, l'hôte, et chaque joueur (rang, score, pourquoi hors
// classement, place prise au tableau de la table, durée jouée).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un historique d'essai.

import {
  formatNumber,
  historyOffLabel,
  historyPlayersCount,
  historyStateLabel,
  language,
  playDuration,
  t,
  tn,
  type HistoryGame,
  type HistoryPlayer,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section } from './library';

export interface GameHistoryMenuHost {
  library: { openCustom(build: () => Built, at?: number): void };
  /** Les parties gardées, de la plus récente à la plus ancienne. */
  history(): readonly HistoryGame[];
  /** Retour de la liste : la rubrique Amis. */
  back(): void;
}

export interface GameHistoryMenu {
  open(at?: number): void;
  /** Ce que dit l'entrée du menu système. */
  detail(): string;
}

const locale = () => (language() === 'en' ? 'en-GB' : 'fr-FR');
/** « Jeudi 30 octobre 2026 ». */
const day = (iso: string) => {
  const text = new Date(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const time = (iso: string) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

export function createGameHistoryMenu(host: GameHistoryMenuHost): GameHistoryMenu {
  const who = (game: HistoryGame, p: HistoryPlayer) => (p.key === game.me ? t('{name} (vous)', { name: p.name }) : p.name);

  /** Un joueur sur la ligne d'une partie : « 1. Bruno 2 841 350 120 », « Chloé 9 999, hors classement ». */
  function short(game: HistoryGame, p: HistoryPlayer): string {
    const name = who(game, p);
    if (p.rank) return t('{rank}. {name} {score}', { rank: p.rank, name, score: formatNumber(p.score!) });
    if (p.score !== undefined) return t('{name} {score}, hors classement', { name, score: formatNumber(p.score) });
    return t('{name}, score inconnu', { name });
  }

  function buildList(): Built {
    const games = host.history();
    const actions: Action[] = [];
    const sections: Section[] = [];
    for (const game of games) {
      const index: number = actions.push({ label: game.title, key: `game:${game.id}`, icon: 'gamepad', run: (): void => openGame(game.id, index) }) - 1;
      const mine = game.players.find((p) => p.key === game.me);
      const counted = game.players.filter((p) => p.rank).length;
      const row: Row = {
        text: game.title,
        detail: game.players.map((p) => short(game, p)).join(' · '),
        icon: mine?.rank === 1 && counted > 1 ? 'star' : 'gamepad',
        tone: mine?.rank === 1 && counted > 1 ? 'ok' : undefined,
        badges: [time(game.at)],
        action: index,
        pick: true,
      };
      const title = day(game.at);
      const last = sections.at(-1);
      if (last?.title === title) last.rows.push(row);
      else sections.push({ title, rows: [row] });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: host.back });
    return {
      heading: t('Historique des parties'),
      icon: 'clock',
      subheading: games.length ? tn(games.length, '{n} partie entre amis sur cette borne', '{n} parties entre amis sur cette borne') : undefined,
      lead: t('Chaque partie en direct finie, de la plus récente à la plus ancienne : la table, puis les joueurs avec leur rang et leur score.'),
      sections: sections.length
        ? sections
        : [{ rows: [{ text: t('Aucune partie entre amis pour l’instant'), detail: t('Chaque partie en direct finie s’inscrit ici, avec la table, les joueurs et leurs scores'), tone: 'info' }] }],
      actions,
      back: host.back,
    };
  }

  function playerRow(game: HistoryGame, p: HistoryPlayer, counted: number): Row {
    const name = who(game, p);
    const text = p.rank ? `${p.rank}. ${name} — ${formatNumber(p.score!)}` : p.score !== undefined ? `${name} — ${formatNumber(p.score)}` : `${name} — ${t('Score non disponible')}`;
    const detail = [
      historyOffLabel(p, game.table.balls),
      historyStateLabel(p),
      p.record ? t('Record enregistré, place {rank} du tableau', { rank: p.record.rank }) : undefined,
      p.seconds !== undefined ? playDuration(p.seconds) : undefined,
    ].filter(Boolean).join(' · ');
    const badges = [...(p.rank === 1 && counted > 1 ? [t('Meilleur score')] : []), ...(p.host ? [t('Hôte')] : [])];
    return { text, ...(detail ? { detail } : {}), icon: p.rank === 1 ? 'star' : 'friend-list', tone: p.rank ? 'ok' : 'quiet', ...(badges.length ? { badges } : {}) };
  }

  function buildGame(id: string, from: number): Built {
    const back = () => open(from);
    const game = host.history().find((g) => g.id === id);
    if (!game) return { heading: t('Historique des parties'), icon: 'clock', sections: [{ rows: [{ text: t('Cette partie n’est plus dans l’historique'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    const hostPlayer = game.players.find((p) => p.host);
    const counted = game.players.filter((p) => p.rank).length;
    const offs = game.players.filter((p) => p.off).length;
    return {
      heading: game.title,
      icon: 'clock',
      subheading: t('{day}, {time}', { day: day(game.at), time: time(game.at) }),
      sections: [
        {
          rows: [
            { text: game.table.version ? t('Version : {version}', { version: game.table.version }) : t('Version de la table : celle de l’hôte'), detail: game.table.balls ? tn(game.table.balls, '{n} bille par partie', '{n} billes par partie') : undefined, icon: 'play' },
            { text: t('Hôte : {name}', { name: hostPlayer ? who(game, hostPlayer) : '?' }), detail: historyPlayersCount(game), icon: 'friends' },
          ],
        },
        {
          title: t('Classement'),
          rows: game.players.map((p) => playerRow(game, p, counted)),
        },
        ...(offs ? [{ rows: [{ text: tn(offs, '{n} score hors classement', '{n} scores hors classement'), detail: t('Gardé ici, il ne compte ni au classement de la partie ni aux records du groupe'), tone: 'quiet' as const, icon: 'info' as const }] }] : []),
      ],
      actions: [{ label: t('Retour'), icon: 'back', run: back }],
      back,
    };
  }

  function openGame(id: string, from: number): void {
    host.library.openCustom(() => buildGame(id, from));
  }

  function open(at?: number): void {
    host.library.openCustom(buildList, at);
  }

  return {
    open,
    detail() {
      const last = host.history()[0];
      return last ? t('Dernière : {table}, {day}', { table: last.title, day: new Date(last.at).toLocaleDateString(locale()) }) : t('Les parties entre amis jouées sur cette borne');
    },
  };
}
