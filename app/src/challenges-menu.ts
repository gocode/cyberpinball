// Défis asynchrones, côté écrans (22/11/2026, planche « Engagement » : carte « Défi de Nina ») :
// - l'onglet « Défis » de l'Arène (sections) : à jouer, envoyés en attente, résultats récents, et
//   « Défier un joueur… » ;
// - les cartes « Défi de … » dans « À jouer maintenant » (playCards) et la page de l'affiche à points
//   quand un défi expire bientôt (boardPage) ;
// - « Défier {nom} » d'un geste (button) : « Votre place est prise », le retour de partie ;
// - « Jouer ensemble… > Défier un joueur… » sur la fiche d'une table (sheetAction) : les amis et les
//   joueurs classés sur cette version ;
// - l'écran d'un défi (openChallenge) : la notification, sa ligne d'Activité ;
// - défier un joueur depuis son profil (openPlayer) : le choix de la table.
// Une version de table que je n'ai pas : le défi reste visible, grisé, avec « Récupérer cette version »
// quand un ami l'a (comme les tables du jour).
//
// Sans electron à l'exécution : les tests chargent ce module avec des services d'essai.

import {
  dmdNumber,
  presenceTable,
  challengeElapsed,
  challengeOpen,
  challengeTimeLeft,
  challengeToPlay,
  CHALLENGE_EXPIRING_MS,
  formatNumber,
  t,
  tn,
  XP,
  type ArenaBoardPage,
  type AvatarView,
  type Challenge,
  type ChallengeOffer,
  type ChallengePlayer,
  type ChallengeTable,
  type TableEntry,
} from '@cyberpinball/core';
import type { ChallengeService } from './challenge-service';
import type { LocalMatch } from './daily-tables';
import type { HubButtonSpec, HubCardSpec, HubSectionSpec } from './hub-screen';
import type { Action, Built, Row } from './library';
import type { TableVersion } from './table-rankings';

/** Un joueur qu'on peut défier sur une version : un ami, ou un joueur classé dessus. */
export interface ChallengeCandidate extends ChallengePlayer {
  friend: boolean;
  /** Son meilleur score publié sur cette version. */
  score?: number;
}

export interface ChallengesMenuHost {
  library: { openCustom(build: () => Built, at?: number): void };
  service: ChallengeService;
  /** Ma table de cette version (daily-tables.ts) ; sa pastille. */
  localFor(line: { board: string; balls?: number; title: string }): LocalMatch;
  face(p: { key: string; name: string }): AvatarView;
  /** Les amis qui ont cette version (« Récupérer cette version chez … »). */
  versionHolders?(board: string): { key: string; name: string; fetch(back: () => void): void }[];
  play(table: TableEntry): void;
  /** La version exacte d'une de mes tables (table-rankings.ts). */
  versionOf(table: TableEntry): TableVersion;
  /** Mon meilleur score relevé par Cyber Pinball sur une version : le score à battre. */
  myBest(version: { board: string; balls?: number }): number | undefined;
  /** Les joueurs à défier sur cette version : mes amis, puis les joueurs classés dessus. */
  candidates(version: { board: string; balls?: number }): ChallengeCandidate[];
  /** Mes tables jouées, la plus récente d'abord (défier depuis un profil). */
  recentTables(): readonly TableEntry[];
  /** Le partage est coupé : « Régler le partage » à la place du long chemin dans les réglages. */
  sharingOff?(): boolean;
  openSharing?(back: () => void): void;
  now?(): Date;
}

export interface ChallengesMenu {
  /** L'onglet « Défis » de l'Arène. */
  sections(here: () => void): { sections: HubSectionSpec[]; empty?: { title: string; detail: string } };
  /** Les cartes « Défi de … » à mettre en tête de « À jouer maintenant » (au plus `max`). */
  playCards(here: () => void, max?: number): HubCardSpec[];
  /** Un défi attend que je joue : la pastille de l'onglet. */
  attention(): boolean;
  /** Un défi expire bientôt et je ne mène pas : sa page en tête du tableau à points de l'affiche. */
  boardPage(): ArenaBoardPage | undefined;
  /** « Défier {nom} » d'un geste, avec ce score ; grisé avec sa raison quand ce n'est pas possible. */
  button(p: ChallengePlayer, table: ChallengeTable | undefined, score: number | undefined, source: ChallengeOffer['source'], key: string, after: () => void): HubButtonSpec;
  /** Fiche d'une table : « Défier un joueur… ». */
  sheetAction(table: TableEntry, back: () => void): Action;
  /** L'écran d'un défi. */
  openChallenge(id: string, back: () => void): void;
  /** Défier ce joueur (son profil) : le choix de la table. */
  openPlayer(p: ChallengePlayer, back: () => void): void;
}

/** Résultats montrés au plus dans l'onglet. */
const RESULTS_MAX = 6;
/** Joueurs proposés au plus sur la fiche d'une table, et tables depuis un profil. */
const CANDIDATES_MAX = 12;
const TABLES_MAX = 12;

export function createChallengesMenu(host: ChallengesMenuHost): ChallengesMenu {
  const now = () => host.now?.() ?? new Date();
  const svc = host.service;
  const thin = String.fromCharCode(0x202f);
  const nbsp = String.fromCharCode(0xa0);
  const fmt = (n: number | undefined) => formatNumber(n ?? 0).split(thin).join(nbsp);
  const xpText = (n: number) => t('+{n} XP', { n });
  const left = (c: Challenge) => challengeTimeLeft(c.until, now());
  /** Dernier envoi dit à l'écran (« Défi envoyé à Nina »), le temps d'un écran. */
  let sentTo: string | undefined;

  /** De quoi jouer ce défi : la table de cette version, ou la récupérer chez un ami, ou pourquoi pas. */
  function playable(c: Challenge, back: () => void): { run?: () => void; fetch?: { name: string; run: () => void }; off?: string } {
    const local = host.localFor(c.table);
    if (local.state === 'mine') return { run: () => host.play(local.table) };
    if (local.state === 'pending') return { off: t('Version de la table en calcul') };
    const holder = host.versionHolders?.(c.table.board)[0];
    if (holder) return { fetch: { name: holder.name, run: () => holder.fetch(back) } };
    return { off: local.state === 'other' ? t('Autre version que la tienne') : t('Table absente de cette borne') };
  }

  /** « Jouer » (ou « Récupérer cette version », ou grisé) et « Refuser » d'un défi ouvert. */
  function playButtons(c: Challenge, back: () => void, after: () => void): HubButtonSpec[] {
    const p = playable(c, back);
    const out: HubButtonSpec[] = [];
    if (p.run) out.push({ label: t('Jouer'), xp: xpText(XP.challengeWin), primary: true, key: 'play', run: p.run });
    else if (p.fetch) out.push({ label: t('Récupérer cette version'), primary: true, key: 'fetch', run: p.fetch.run });
    else out.push({ label: t('Jouer'), key: 'play', run: () => undefined, off: p.off ?? '' });
    if (c.state === 'received')
      out.push({
        label: t('Refuser'),
        key: 'decline',
        run: () => {
          svc.decline(c.id);
          after();
        },
      });
    return out;
  }

  /** Ce que dit un défi ouvert, sous son titre. */
  function openDetail(c: Challenge): string {
    const time = t('Il te reste {left}', { left: left(c) });
    if (c.role === 'sent' && c.theirs === undefined) return t('{name} n’a pas encore joué · reste {left}', { name: c.opponent.name, left: left(c) });
    if (c.leader === 'me') return t('Tu mènes : {mine} contre {theirs} · reste {left}', { mine: fmt(c.mine), theirs: fmt(c.theirs), left: left(c) });
    return t('{time} · si tu gagnes {xp}', { time, xp: xpText(XP.challengeWin) });
  }

  /** La carte d'un défi ouvert : « Défi de Nina », la table, le score à battre, le temps qui passe. */
  function openCard(c: Challenge, back: () => void, after: () => void): HubCardSpec {
    const toPlay = challengeToPlay(c);
    const eyebrow = c.role === 'received' ? t('Défi de {name}', { name: c.opponent.name }) : t('Défi à {name}', { name: c.opponent.name });
    const target = c.leader === 'me' ? c.mine : c.theirs ?? c.target;
    return {
      key: `challenge:${c.id}`,
      eyebrow,
      tone: toPlay ? 'warning' : 'meta',
      avatar: host.face(c.opponent),
      title: c.table.title,
      aside: fmt(target),
      ...(toPlay ? { asideTone: 'warning' as const } : {}),
      progress: challengeElapsed(c, now()),
      detail: [openDetail(c), playable(c, back).fetch ? t('Autre version que la tienne : récupère-la chez {name}', { name: playable(c, back).fetch!.name }) : undefined].filter(Boolean).join(' · '),
      ...(toPlay ? { buttons: playButtons(c, back, after) } : { run: () => openChallenge(c.id, back) }),
    };
  }

  /** Le mot d'un résultat. */
  function resultWord(c: Challenge): string {
    switch (c.state) {
      case 'won':
        return t('Gagné');
      case 'lost':
        return t('Perdu');
      case 'declined':
        return c.role === 'sent' ? t('Refusé par {name}', { name: c.opponent.name }) : t('Refusé');
      default:
        return t('Expiré');
    }
  }

  function resultDetail(c: Challenge): string {
    if (c.state === 'expired') return c.role === 'sent' ? t('{name} n’a pas joué', { name: c.opponent.name }) : t('Tu n’as pas joué');
    if (c.state === 'declined') return t('Contre {name}', { name: c.opponent.name });
    return t('{mine} contre {theirs} · {name}', { mine: fmt(c.mine), theirs: fmt(c.theirs), name: c.opponent.name });
  }

  /** « Revanche » : un nouveau défi au même joueur, sur la même version, d'un geste. */
  function rematch(c: Challenge, after: () => void): HubButtonSpec {
    const best = Math.max(host.myBest(c.table) ?? 0, c.mine ?? 0) || undefined;
    return { ...button(c.opponent, c.table, best, 'best', `rematch:${c.id}`, after), label: t('Revanche') };
  }

  function resultCard(c: Challenge, back: () => void, after: () => void): HubCardSpec {
    return {
      key: `challenge:${c.id}`,
      eyebrow: resultWord(c),
      tone: c.state === 'won' ? 'signal' : 'meta',
      avatar: host.face(c.opponent),
      title: c.table.title,
      detail: resultDetail(c),
      ...(c.state === 'won' ? { aside: xpText(XP.challengeWin) } : {}),
      ...(c.state === 'declined' ? { run: () => openChallenge(c.id, back) } : { buttons: [rematch(c, after)] }),
    };
  }

  /** « Lancer un défi » : la carte qui mène au choix de la table, puis du joueur (plus de chemin à deviner). */
  function launchCard(here: () => void): HubCardSpec {
    const reason = tablesToChallenge().length ? undefined : t('Joue d’abord une partie : ton meilleur score sera celui à battre');
    return {
      key: 'challenge:how',
      icon: 'trophy',
      title: t('Choisir une table, puis un joueur'),
      detail: t('48 h pour battre ton score, chacun quand il veut'),
      buttons: [{ label: t('Lancer un défi'), icon: 'trophy', xp: xpText(XP.challengeWin), primary: true, key: 'launch', run: () => host.library.openCustom(() => buildTables(here)), ...(reason ? { off: reason } : {}) }],
    };
  }

  function sections(here: () => void): { sections: HubSectionSpec[]; empty?: { title: string; detail: string } } {
    const off = svc.unavailable();
    if (off) {
      const fix = host.sharingOff?.() && host.openSharing;
      return {
        sections: [
          {
            layout: 'list',
            cards: [
              { key: 'challenges:off', icon: 'network', title: t('Défis'), detail: off, quiet: true },
              ...(fix ? [{ key: 'challenges:sharing', icon: 'network' as const, title: t('Régler le partage'), detail: t('Activer le partage, le réseau local et la présence publique'), run: () => fix(here) }] : []),
            ],
          },
        ],
      };
    }
    const list = svc.list();
    const out: HubSectionSpec[] = [];
    const toPlay = list.filter(challengeToPlay);
    const waiting = list.filter((c) => challengeOpen(c) && !challengeToPlay(c));
    const done = list.filter((c) => !challengeOpen(c)).slice(0, RESULTS_MAX);
    if (toPlay.length) out.push({ title: t('À jouer'), note: tn(toPlay.length, '{n} défi t’attend', '{n} défis t’attendent'), layout: 'cards', cards: toPlay.map((c) => openCard(c, here, here)) });
    if (waiting.length) out.push({ title: t('En attente'), note: t('Envoyés, ou tu mènes'), layout: 'list', cards: waiting.map((c) => openCard(c, here, here)) });
    out.push({
      title: t('Défier un joueur'),
      layout: 'list',
      cards: [
        launchCard(here),
        ...(sentTo ? [{ key: 'challenge:sent', icon: 'check' as const, title: t('Défi envoyé à {name}', { name: sentTo }), detail: t('Il arrive dès que sa borne est jointe') }] : []),
      ],
    });
    if (done.length) out.push({ title: t('Résultats récents'), layout: 'list', cards: done.map((c) => resultCard(c, here, here)) });
    return { sections: out };
  }

  function playCards(here: () => void, max = 1): HubCardSpec[] {
    if (svc.unavailable()) return [];
    return svc
      .list()
      .filter(challengeToPlay)
      .slice(0, max)
      .map((c) => openCard(c, here, here));
  }

  function attention(): boolean {
    return svc.list().some(challengeToPlay);
  }

  function boardPage(): ArenaBoardPage | undefined {
    const at = now().getTime();
    const c = svc.list().find((x) => challengeOpen(x) && x.leader !== 'me' && Date.parse(x.until) - at <= CHALLENGE_EXPIRING_MS && (x.role === 'received' || x.theirs !== undefined));
    if (!c) return undefined;
    const target = c.theirs ?? c.target;
    return {
      id: `challenge:${c.id}`,
      lines: [
        { cells: [{ text: t('Défi de {name}', { name: c.opponent.name }), align: 'center' }], head: true },
        { cells: [{ text: c.table.title, align: 'center' }] },
        { cells: [{ text: t('À battre') }, { text: dmdNumber(target), align: 'right' }] },
        { cells: [{ text: t('Reste {left}', { left: left(c) }), align: 'center' }] },
      ],
      foot: t('Défi de {name} : plus que {left}', { name: c.opponent.name, left: left(c) }),
    };
  }

  function button(p: ChallengePlayer, table: ChallengeTable | undefined, score: number | undefined, source: ChallengeOffer['source'], key: string, after: () => void): HubButtonSpec {
    const label = t('Défier {name}', { name: p.name });
    if (!table) return { label, key, run: () => undefined, off: t('Version de la table inconnue') };
    const sent = svc.list().find((c) => challengeOpen(c) && c.role === 'sent' && c.opponent.key === p.key && c.table.board === table.board && (c.table.balls ?? 0) === (table.balls ?? 0));
    if (sent) return { label, key, run: () => undefined, off: t('Défi envoyé') };
    // Mon meilleur sur cette version : le plus haut entre celui qu'on me donne et celui que je connais.
    if (source === 'best') score = Math.max(score ?? 0, host.myBest(table) ?? 0) || undefined;
    const reason = svc.blocked(p.key, table) ?? (score ? undefined : t('Pas encore de score sur cette version'));
    if (reason) return { label, key, run: () => undefined, off: reason };
    return {
      label,
      xp: xpText(XP.challengeWin),
      key,
      run: () => {
        const r = svc.offer(p, table, score!, source);
        if ('challenge' in r) sentTo = p.name;
        after();
      },
    };
  }

  // ---------- Fiche d'une table : « Défier un joueur… » ----------

  function tableOf(entry: TableEntry, v: { board: string; balls?: number }): ChallengeTable {
    const seen = presenceTable(entry);
    return { board: v.board, ...(v.balls ? { balls: v.balls } : {}), title: seen.title, ...(seen.vpsId ? { vpsId: seen.vpsId } : {}) };
  }

  /** Pourquoi on ne peut pas défier sur cette table (version en calcul, illisible, pas de score) ; undefined : on peut. */
  function sheetReason(entry: TableEntry): string | undefined {
    const off = svc.unavailable();
    if (off) return off;
    const v = host.versionOf(entry);
    if (v.state === 'pending') return t('Empreinte de la table en calcul…');
    if (v.state === 'none') return t('Version de la table illisible : pas de défi possible');
    if (!host.myBest(v)) return t('Joue d’abord une partie : ton meilleur score sera celui à battre');
    return undefined;
  }

  function buildPick(entry: TableEntry, back: () => void): Built {
    const here = () => host.library.openCustom(() => buildPick(entry, back));
    const v = host.versionOf(entry);
    const actions: Action[] = [];
    const rows: Row[] = [];
    const reason = sheetReason(entry);
    if (!reason && v.state === 'ok') {
      const table = tableOf(entry, v);
      const best = host.myBest(v)!;
      const list = host.candidates(v).slice(0, CANDIDATES_MAX);
      for (const p of list) {
        const b = button(p, table, best, 'best', `pick:${p.key}`, here);
        const action = actions.push({ label: t('Défier {name}', { name: p.name }), key: `pick:${p.key}`, icon: 'trophy', run: b.run, ...(b.off ? { tone: 'quiet' as const } : {}) }) - 1;
        rows.push({
          text: p.name,
          detail: [p.friend ? t('Ami') : undefined, p.score ? t('Son meilleur : {score}', { score: fmt(p.score) }) : undefined].filter(Boolean).join(' · ') || t('Pas encore de score sur cette version'),
          ...(b.off ? { sub: b.off, tone: 'quiet' as const } : {}),
          avatar: host.face(p),
          aside: b.off ? '—' : xpText(XP.challengeWin),
          action,
          pick: true,
        });
      }
      if (!list.length) rows.push({ text: t('Personne à défier pour l’instant'), detail: t('Tes amis et les joueurs classés sur cette version apparaissent ici'), icon: 'info', tone: 'quiet' });
    } else rows.push({ text: t('Défi impossible pour l’instant'), detail: reason ?? '', icon: 'info', tone: 'quiet' });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    const best = v.state === 'ok' ? host.myBest(v) : undefined;
    return {
      heading: t('Défier un joueur'),
      icon: 'trophy',
      subheading: entry.title,
      lead: best ? t('Score à battre : ton meilleur sur cette version, {score}. Il a 48 h, essais illimités ; le plus haut gagne {xp}.', { score: fmt(best), xp: xpText(XP.challengeWin) }) : t('48 h pour battre ton score, chacun quand il veut.'),
      sections: [{ ...(sentTo ? { title: t('Défi envoyé à {name}', { name: sentTo }) } : {}), rows }],
      actions,
      back,
    };
  }

  function sheetAction(entry: TableEntry, back: () => void): Action {
    const reason = sheetReason(entry);
    return { label: t('Défier un joueur…'), detail: reason ?? t('48 h pour battre ton score, chacun quand il veut'), icon: 'trophy', ...(reason ? { tone: 'quiet' as const } : {}), run: () => host.library.openCustom(() => buildPick(entry, back)) };
  }

  // ---------- Lancer un défi depuis l'Arène : le choix de la table ----------

  /** Mes tables jouées dont la version est lisible et qui ont un meilleur score à battre. */
  function tablesToChallenge(): { entry: TableEntry; best: number }[] {
    const out: { entry: TableEntry; best: number }[] = [];
    for (const entry of host.recentTables().slice(0, TABLES_MAX * 2)) {
      if (out.length >= TABLES_MAX) break;
      const v = host.versionOf(entry);
      if (v.state !== 'ok') continue;
      const best = host.myBest(v);
      if (best) out.push({ entry, best });
    }
    return out;
  }

  function buildTables(back: () => void): Built {
    const actions: Action[] = [];
    const rows: Row[] = [];
    for (const { entry, best } of tablesToChallenge()) {
      const action = actions.push({ label: entry.title, key: `table:${entry.id}`, icon: 'trophy', run: () => host.library.openCustom(() => buildPick(entry, () => host.library.openCustom(() => buildTables(back)))) }) - 1;
      rows.push({ text: entry.title, detail: t('Ton meilleur : {score}', { score: fmt(best) }), icon: 'trophy', action, pick: true });
    }
    if (!rows.length) rows.push({ text: t('Aucune table à proposer'), detail: t('Joue d’abord une partie : ton meilleur score sera celui à battre'), icon: 'info', tone: 'quiet' });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Lancer un défi'),
      icon: 'trophy',
      lead: t('Choisis la table : ton meilleur score sur cette version est celui à battre. Tu choisiras ensuite le joueur.'),
      sections: [{ ...(sentTo ? { title: t('Défi envoyé à {name}', { name: sentTo }) } : {}), rows }],
      actions,
      back,
    };
  }

  // ---------- Défier depuis un profil : le choix de la table ----------

  function buildPlayer(p: ChallengePlayer, back: () => void): Built {
    const here = () => host.library.openCustom(() => buildPlayer(p, back));
    const actions: Action[] = [];
    const rows: Row[] = [];
    const off = svc.unavailable();
    if (off) rows.push({ text: t('Défi impossible pour l’instant'), detail: off, icon: 'info', tone: 'quiet' });
    else {
      for (const entry of host.recentTables().slice(0, TABLES_MAX * 2)) {
        if (rows.length >= TABLES_MAX) break;
        const v = host.versionOf(entry);
        if (v.state !== 'ok') continue;
        const best = host.myBest(v);
        if (!best) continue;
        const b = button(p, tableOf(entry, v), best, 'best', `table:${entry.id}`, here);
        const action = actions.push({ label: t('Défier sur {table}', { table: entry.title }), key: `table:${entry.id}`, icon: 'trophy', run: b.run, ...(b.off ? { tone: 'quiet' as const } : {}) }) - 1;
        rows.push({ text: entry.title, detail: t('Ton meilleur : {score}', { score: fmt(best) }), ...(b.off ? { sub: b.off, tone: 'quiet' as const } : {}), icon: 'trophy', aside: b.off ? '—' : xpText(XP.challengeWin), action, pick: true });
      }
      if (!rows.length) rows.push({ text: t('Aucune table à proposer'), detail: t('Joue d’abord une partie : ton meilleur score sera celui à battre'), icon: 'info', tone: 'quiet' });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Défier {name}', { name: p.name }),
      icon: 'trophy',
      avatar: host.face(p),
      lead: t('Choisis la table : ton meilleur score sur cette version est celui à battre. 48 h, essais illimités ; le plus haut gagne {xp}.', { xp: xpText(XP.challengeWin) }),
      sections: [{ ...(sentTo ? { title: t('Défi envoyé à {name}', { name: sentTo }) } : {}), rows }],
      actions,
      back,
    };
  }

  // ---------- L'écran d'un défi ----------

  function stateLead(c: Challenge): string {
    switch (c.state) {
      case 'received':
        return t('{name} te défie : bats {score} avant l’échéance. Essais illimités, ton meilleur score compte.', { name: c.opponent.name, score: fmt(c.theirs ?? c.target) });
      case 'sent':
        return t('{name} n’a pas encore joué. Le défi lui arrive dès que sa borne est jointe.', { name: c.opponent.name });
      case 'running':
        return c.leader === 'me' ? t('Tu mènes. {name} peut encore jouer jusqu’à l’échéance.', { name: c.opponent.name }) : t('{name} a battu ton score : à toi.', { name: c.opponent.name });
      case 'won':
        return t('Défi gagné contre {name}.', { name: c.opponent.name });
      case 'lost':
        return t('Défi perdu contre {name}.', { name: c.opponent.name });
      case 'declined':
        return c.role === 'sent' ? t('{name} a refusé ton défi.', { name: c.opponent.name }) : t('Tu as refusé ce défi.');
      case 'expired':
        return resultDetail(c);
    }
  }

  function buildChallenge(id: string, back: () => void): Built {
    const here = () => host.library.openCustom(() => buildChallenge(id, back));
    const c = svc.list().find((x) => x.id === id) ?? svc.get(id);
    if (!c) return { heading: t('Défi'), icon: 'trophy', lead: svc.unavailable() ?? t('Ce défi n’est plus sur cette borne.'), sections: [], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
    const rows: Row[] = [
      { text: t('Toi'), aside: c.mine !== undefined ? fmt(c.mine) : '—', ...(c.leader === 'me' ? { tone: 'ok' as const } : {}), icon: 'star' },
      { text: c.opponent.name, aside: c.theirs !== undefined ? fmt(c.theirs) : '—', avatar: host.face(c.opponent), ...(c.leader === 'them' ? { tone: 'warning' as const } : {}) },
    ];
    if (challengeOpen(c)) rows.push({ text: t('Temps restant'), aside: left(c), icon: 'clock', progress: { value: challengeElapsed(c, now()), tone: 'warning' } });
    rows.push({ text: t('Si tu gagnes'), aside: xpText(XP.challengeWin), icon: 'trophy', ...(c.state === 'won' ? { tone: 'ok' as const } : {}) });
    const actions: Action[] = [];
    const fromButton = (b: HubButtonSpec, icon: Action['icon']): Action => ({ label: b.label, key: b.key, icon, run: b.run, ...(b.off ? { detail: b.off, tone: 'quiet' as const } : b.xp ? { detail: b.xp } : {}) });
    if (challengeOpen(c)) {
      for (const b of playButtons(c, here, here)) actions.push(fromButton(b, b.key === 'decline' ? 'close' : b.key === 'fetch' ? 'download' : 'play'));
    } else if (c.state !== 'declined') actions.push(fromButton(rematch(c, here), 'trophy'));
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: t('Défi · {table}', { table: c.table.title }),
      icon: 'trophy',
      avatar: host.face(c.opponent),
      subheading: c.role === 'received' ? t('Défi de {name}', { name: c.opponent.name }) : t('Défi à {name}', { name: c.opponent.name }),
      lead: stateLead(c),
      sections: [{ rows }],
      actions,
      back,
    };
  }

  function openChallenge(id: string, back: () => void): void {
    host.library.openCustom(() => buildChallenge(id, back));
  }

  return {
    sections,
    playCards,
    attention,
    boardPage,
    button,
    sheetAction,
    openChallenge,
    openPlayer: (p, back) => host.library.openCustom(() => buildPlayer(p, back)),
  };
}

/** Une version de table telle que la défie l'Arène (place prise, retour de partie) : son empreinte et son titre. */
export function challengeTableOf(v: { board: string; balls?: number }, title: string, vpsId?: string): ChallengeTable {
  return { board: v.board, ...(v.balls ? { balls: v.balls } : {}), title, ...(vpsId ? { vpsId } : {}) };
}
