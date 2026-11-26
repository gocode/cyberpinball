// Ce qui pique et ce qui récompense (21/11/2026, planche « Engagement » validée, `homeArene` et
// `homeRetour`) : la place prise (notification, Activité, action du moment de l'Arène) et le retour de
// partie. Ces tests fixent ce qui déclenche ou non la notification, une fois par table et par jour, et
// l'écran de retour, qui ne s'ouvre que s'il y a du neuf.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { activityAct, type ActivityEntry } from '../activity';
import { arenaBoardPages, arenaMoment } from '../arena';
import type { DailyInput } from '../dailytables';
import { setLanguage } from '../i18n';
import { createNoticeCenter, NOTICE_RULES, noticeText, type NoticeEvent } from '../notices';
import { emptyLevels } from '../levels';
import { gameNews, gameOvertake, gameStanding, placesTaken, placeTakenKey, placeTakenTable, stillTaken, type PlaceTaken } from '../overtakes';
import type { RankedScore, RankingStore } from '../rankings';
import { fakeSocialNet } from './doublures';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

const NOW = new Date('2026-11-21T20:40:00');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();
const ME = 'a'.repeat(64);
const LEA = 'e'.repeat(64);
const PAUL = 'f'.repeat(64);
const THEO = 'c'.repeat(64);
const AFM = 'afm';

function score(key: string, name: string, value: number, min: number, board = AFM, title = 'Attack from Mars'): RankedScore {
  return { key, name, board, table: { title }, score: value, at: ago(min), how: 'rom', sig: '' };
}

/** Le classement d'Attack from Mars : Paul loin devant, moi ce soir, Théo derrière. */
const base = (): RankedScore[] => [score(PAUL, 'Paul', 10_340_000, 30), score(ME, 'Kiko', 8_912_340, 60), score(THEO, 'Théo', 6_000_000, 90)];
const store = (scores: RankedScore[]): RankingStore => ({ v: 1, hidden: [], scores });
const input = (scores: RankedScore[], extra: Partial<DailyInput> = {}): DailyInput => ({ store: store(scores), cards: [], me: { key: ME, name: 'Kiko' }, friends: new Set(), ...extra });

// ---------- Ce qui déclenche la place prise ----------

test('place prise : Léa passe devant moi au classement du jour, sur une version que j’ai jouée', () => {
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const taken = placesTaken(input([...base(), lea]), [lea], { now: NOW });
  assert.equal(taken.length, 1);
  const p = taken[0]!;
  assert.equal(p.rival.name, 'Léa');
  assert.equal(p.period, 'today');
  assert.equal(p.title, 'Attack from Mars');
  assert.equal(p.mine.score, 8_912_340);
  assert.equal(p.mine.rank, 3, 'Paul, Léa, puis moi');
});

test('place prise : rien quand personne ne passe devant, ni sur une table jamais jouée, ni pour un vieux score', () => {
  const below = score(LEA, 'Léa', 7_000_000, 20);
  assert.deepEqual(placesTaken(input([...base(), below]), [below], { now: NOW }), [], 'Léa reste derrière moi');
  const other = score(LEA, 'Léa', 9_450_000, 20, 'tz', 'Twilight Zone');
  assert.deepEqual(placesTaken(input([...base(), other]), [other], { now: NOW }), [], 'une version où je n’ai rien publié');
  const old = score(LEA, 'Léa', 9_450_000, 25 * 60);
  assert.deepEqual(placesTaken(input([...base(), old]), [old], { now: NOW }), [], 'un score de plus d’un jour n’est pas une nouvelle');
  const before = score(LEA, 'Léa', 9_450_000, 70);
  assert.deepEqual(placesTaken(input([...base(), before]), [before], { now: NOW }), [], 'son score est d’avant le mien : elle ne m’a pas dépassé');
  const mine = score(ME, 'Kiko', 9_999_999, 5);
  assert.deepEqual(placesTaken(input([...base(), mine]), [mine], { now: NOW }), [], 'mon propre score relayé');
  // Paul était déjà devant moi : un meilleur score de lui ne me prend rien.
  const paul = score(PAUL, 'Paul', 11_000_000, 10);
  assert.deepEqual(placesTaken(input([...base(), paul]), [paul], { now: NOW }), [], 'déjà devant moi');
});

test('place prise : de tout temps quand je n’ai pas joué aujourd’hui', () => {
  const yesterday = [score(PAUL, 'Paul', 10_340_000, 3000), score(ME, 'Kiko', 8_912_340, 2000)];
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const taken = placesTaken(input([...yesterday, lea]), [lea], { now: NOW });
  assert.equal(taken[0]?.period, 'all');
  assert.equal(taken[0]?.mine.rank, 3);
});

test('place prise : encore prise tant que je ne l’ai pas reprise', () => {
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const ref = { board: AFM, title: 'Attack from Mars', rival: LEA };
  assert.equal(stillTaken(input([...base(), lea]), ref, NOW)?.rival.name, 'Léa', 'relue du journal, sans période : celle du jour');
  const back = score(ME, 'Kiko', 9_600_000, 2);
  assert.equal(stillTaken(input([...base(), lea, back]), ref, NOW), undefined, 'ma place reprise');
  assert.equal(stillTaken(input([...base(), lea]), ref, new Date(NOW.getTime() + 25 * 3600_000)), undefined, 'au-delà d’un jour');
});

test('place prise : une clé par table et par jour, relue pour lancer la table', () => {
  const key = placeTakenKey({ board: AFM, balls: 3 }, NOW);
  assert.equal(key, `place|${AFM}|3|2026-11-21`);
  assert.deepEqual(placeTakenTable(key), { board: AFM, balls: 3 });
  assert.notEqual(placeTakenKey({ board: AFM }, new Date('2026-11-22T09:00:00')), placeTakenKey({ board: AFM }, NOW), 'un autre jour, une autre notification');
});

// ---------- La notification et son journal ----------

const event = (over: Partial<NoticeEvent> = {}): NoticeEvent => ({ kind: 'place-taken', key: placeTakenKey({ board: AFM }, NOW), at: NOW.getTime(), who: 'Léa', player: LEA, subject: 'Attack from Mars', ...over });

test('notification : « Léa t’a dépassé sur Attack from Mars », partout, et un clic lance sa table', () => {
  assert.equal(noticeText('place-taken', [event()]).title, 'Léa t’a dépassé sur Attack from Mars');
  const long = noticeText('place-taken', [event({ subject: 'The Addams Family Special Collectors Edition' })]);
  assert.equal(long.title, 'Léa t’a dépassé', 'trop long : la table passe en précision');
  assert.match(long.detail ?? '', /^The Addams Family/);
  const rule = NOTICE_RULES['place-taken'];
  assert.equal(rule.away, true, 'par-dessus VPX aussi, sauf si le réglage le masque');
  assert.notEqual(rule.journal, false, 'au journal d’Activité');
  assert.ok(rule.quietMs >= 24 * 3600_000, 'pas redite dans la journée');
  const center = createNoticeCenter();
  center.push([event()]);
  center.push([event({ at: NOW.getTime() + 60_000 })]);
  assert.equal(center.pending().length, 1, 'une fois par table et par jour');
  const tick = center.tick(NOW.getTime() + 5000, { canShow: true });
  assert.deepEqual(tick.view?.act, { type: 'place-taken', key: event().key });
  const entry = { id: 'x', kind: 'place-taken', key: event().key, at: NOW.getTime(), count: 1, times: [NOW.getTime()], read: false } as ActivityEntry;
  assert.deepEqual(activityAct(entry), { type: 'place', key: event().key }, 'Start sur sa ligne : reprendre ma place');
});

interface ServiceHost {
  pushed: NoticeEvent[][];
  played: string[];
  journal: { kind: string; key: string; player?: string; subject?: string; at: number }[];
  closed: boolean;
}

interface PlaceTakenLike {
  scores(fresh: readonly RankedScore[]): void;
  current(): PlaceTaken[];
  reach(key: string): { run?: () => void; gone?: string; status?: string };
}

function service(scores: () => RankedScore[], over: Partial<ServiceHost> & { local?: unknown } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPlaceTaken } = require(path.join(REPO_ROOT, 'app', 'dist', 'place-taken.js')) as { createPlaceTaken(host: unknown): PlaceTakenLike };
  const h: ServiceHost = { pushed: [], played: [], journal: [], closed: false, ...over };
  const table = { title: 'Attack from Mars', file: 'afm.vpx' };
  const s = createPlaceTaken({
    daily: { input: () => input(scores()), localFor: () => over.local ?? { state: 'mine', table }, unavailable: () => undefined },
    push: (events: NoticeEvent[]) => h.pushed.push([...events]),
    journal: () => h.journal,
    closed: () => h.closed,
    play: (t: { title: string }) => h.played.push(t.title),
    log: () => undefined,
    now: () => NOW,
  });
  return { s, h };
}

test('service : une notification à l’arrivée des scores, une seule par table et par jour, même après un redémarrage', () => {
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const { s, h } = service(() => [...base(), lea]);
  s.scores([lea]);
  assert.equal(h.pushed.length, 1);
  const e = h.pushed[0]![0]!;
  assert.equal(e.kind, 'place-taken');
  assert.equal(e.who, 'Léa');
  assert.deepEqual(e.place, { rank: 3, of: 4 });
  s.scores([lea]);
  assert.equal(h.pushed.length, 1, 'pas deux fois le même jour');
  assert.equal(s.current()[0]?.rival.name, 'Léa', 'l’Arène la reprend');
  // Un redémarrage : la mémoire est vide, le journal d'Activité garde la ligne du jour.
  const again = service(() => [...base(), lea], { journal: [{ kind: 'place-taken', key: e.key, player: LEA, subject: 'Attack from Mars', at: NOW.getTime() }] });
  again.s.scores([lea]);
  assert.equal(again.h.pushed.length, 0, 'déjà annoncée aujourd’hui');
  assert.equal(again.s.current()[0]?.rival.name, 'Léa', 'relue du journal pour l’Arène');
  // « Reprendre ma place » : la table lancée.
  again.s.reach(e.key).run?.();
  assert.deepEqual(again.h.played, ['Attack from Mars']);
});

test('service : rien en jeu local ni en mode invité ; une table absente le dit', () => {
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const off = service(() => [...base(), lea], { closed: true });
  off.s.scores([lea]);
  assert.equal(off.h.pushed.length, 0);
  assert.deepEqual(off.s.current(), []);
  const missing = service(() => [...base(), lea], { local: { state: 'missing' } });
  missing.s.scores([lea]);
  const r = missing.s.reach(missing.h.pushed[0]![0]!.key);
  assert.equal(r.run, undefined);
  assert.equal(r.gone, 'Table absente de cette borne');
});

// ---------- L'Arène ----------

test('Arène : la place prise est l’action du moment et la première page de l’affiche', () => {
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const taken = placesTaken(input([...base(), lea]), [lea], { now: NOW })[0]!;
  assert.equal(arenaMoment({ taken, open: [], rivals: [], playedToday: true, now: NOW })?.kind, 'taken');
  assert.equal(arenaMoment({ mine: { title: 'TZ', seated: 1, max: 2 }, taken, open: [], rivals: [], playedToday: true, now: NOW })?.kind, 'my-game', 'ma partie qui attend reste devant');
  const pages = arenaBoardPages({ open: [], rivals: [], records: [], taken, ago: () => 'il y a 20 min', now: NOW });
  assert.equal(pages[0]?.id, 'taken');
  assert.equal(pages[0]?.lines[0]?.cells[0]?.text, 'Ta place est prise');
  assert.equal(pages[0]?.foot, 'Léa t’a dépassé il y a 20 min');
});

test('Arène : « Reprendre ma place » lance la table, « Défier » grisé, « Lui écrire » entre amis', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createArenaMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'arena-menu.js')) as { createArenaMenu(host: unknown): { openHome(back: () => void): void } };
  const lea = score(LEA, 'Léa', 9_450_000, 20);
  const taken = placesTaken(input([...base(), lea]), [lea], { now: NOW })[0]!;
  let built: (() => { actions: { key?: string; run: () => void }[]; hub: { sections: { cards: { title: string; buttons?: { label: string; action?: number; off?: string }[] }[] }[] } }) | undefined;
  const events: string[] = [];
  const facts = new Proxy({}, { get: () => 0 }) as never;
  const menu = createArenaMenu({
    library: { openCustom: (b: typeof built) => (built = b) },
    net: fakeSocialNet({ state: () => ({ key: { publicKey: ME }, badges: [], friends: [] }), rankings: () => store([]) }),
    levels: { state: () => emptyLevels(), facts: () => facts },
    instant: { door: () => ({ detail: '', quiet: false }), arena: () => ({ open: [] }), open: () => undefined, openNew: () => undefined },
    rankings: { standing: () => undefined, open: () => undefined },
    level: { open: () => undefined, openBadges: () => undefined, openRules: () => undefined },
    history: { open: () => undefined },
    players: () => [],
    places: { current: () => [taken], retake: () => () => events.push('lancée') },
    write: () => ({ off: 'Entre amis seulement' }),
    zoneKeys: () => [],
    now: () => NOW,
  });
  menu.openHome(() => undefined);
  built!().actions.find((a) => a.key === 'tab:home')!.run();
  const b = built!();
  const hero = b.hub.sections[0]!.cards[0]!;
  assert.equal(hero.title, 't’a dépassé sur Attack from Mars');
  assert.deepEqual(hero.buttons!.map((x) => [x.label, x.off]), [['Reprendre ma place', undefined], ['Défier Léa', 'Bientôt'], ['Lui écrire', 'Entre amis seulement']]);
  assert.equal(hero.buttons![1]!.action, undefined, 'Défier : ni flipper ni clic');
  // Navigation par blocs : « Reprendre ma place » est le seul bouton possible du bloc, Start sur le bloc le fait tout de suite.
  b.actions.find((a) => a.key === 'block:section:0')!.run();
  assert.deepEqual(events, ['lancée']);
});

// ---------- Le retour de partie ----------

test('retour de partie : du neuf seulement pour un record battu ou un joueur dépassé', () => {
  assert.equal(gameNews({ best: 900, previousBest: 1000 }), undefined, 'moins bien que mon record');
  assert.equal(gameNews({ best: 900 }), undefined, 'un premier score ne bat rien');
  assert.deepEqual(gameNews({ best: 1200, previousBest: 1000 })?.record, { score: 1200, previous: 1000 });
  // Ma partie de ce soir (5 min) passe devant Léa, qui était devant moi.
  const since = new Date(NOW.getTime() - 15 * 60_000);
  const lea = score(LEA, 'Léa', 9_450_000, 120);
  const before = [...base(), lea];
  const mine = score(ME, 'Kiko', 9_712_450, 5);
  const o = gameOvertake(input([...before, mine]), { board: AFM }, since, { now: NOW });
  assert.equal(o?.passed[0]?.name, 'Léa');
  assert.equal(o?.period, 'today');
  assert.equal(o?.rank, 2);
  assert.equal(o?.previous, 3);
  assert.equal(o?.next?.name, 'Paul');
  assert.equal(o?.gap, 10_340_000 - 9_712_450);
  assert.ok(gameNews({ best: 9_712_450, previousBest: 9_800_000, ...(o ? { overtake: o } : {}) })?.overtake, 'un joueur dépassé suffit');
  // Une partie qui ne passe personne : rien.
  const small = score(ME, 'Kiko', 7_000_000, 5);
  assert.equal(gameOvertake(input([...before, small]), { board: AFM }, since, { now: NOW }), undefined);
  // Mais sa place au classement se lit quand même, avec le prochain à battre (retour de partie, 26/11/2026).
  const better = score(ME, 'Kiko', 9_000_000, 5);
  const place = gameStanding(input([...before, better]), { board: AFM }, since, { now: NOW });
  assert.deepEqual([place?.period, place?.rank, place?.players, place?.passed.length, place?.next?.name, place?.gap], ['today', 3, 4, 0, 'Léa', 450_000]);
  assert.equal(gameStanding(input(before), { board: AFM }, since, { now: NOW }), undefined, 'score pas publié : pas de place');
});

interface ReturnBuilt {
  key: number;
  hint: string;
  hub: { tabs: unknown[]; band?: { fresh?: number; lines: string[] }; sections: { title?: string; cards: { title: string; eyebrow?: string; aside?: string; buttons?: unknown[] }[] }[] };
}

interface GameReturnLike {
  expect(): void;
  report(f: unknown): boolean;
  release(): void;
  holding(): boolean;
  showing(): boolean;
  view(): ReturnBuilt | undefined;
  key(kind: 'start' | 'exit' | 'other'): boolean;
  dismiss(why: string): void;
}

function gameReturn(over: { now?: () => number; mine?: number; tableAllowed?: () => boolean; board?: { rank: number; score: number; initials?: string; at?: string }[] } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createGameReturn } = require(path.join(REPO_ROOT, 'app', 'dist', 'game-return.js')) as { createGameReturn(host: unknown): GameReturnLike };
  const lea = score(LEA, 'Léa', 9_450_000, 120);
  const mine = score(ME, 'Kiko', over.mine ?? 9_712_450, 5);
  const events: string[] = [];
  let clock = NOW.getTime();
  const r = createGameReturn({
    daily: { input: () => input([...base(), lea, mine]), face: (h: { key: string; name: string }) => ({ key: h.key, name: h.name, initials: 'L', hue: 0 }), unavailable: () => undefined },
    play: (t: { title: string }) => events.push(`rejouer ${t.title}`),
    ...(over.board ? { board: () => over.board } : {}),
    canOpen: () => true,
    tableAllowed: over.tableAllowed,
    log: () => undefined,
    now: over.now ?? (() => clock),
  });
  const table = { title: 'Attack from Mars', file: 'afm.vpx' };
  const facts = (best: number | undefined, previousBest?: number) => ({ table, version: { board: AFM }, since: new Date(NOW.getTime() - 15 * 60_000), report: { gains: [{ kind: 'game' as const, xp: 10, at: NOW.toISOString() }, { kind: 'play' as const, xp: 12, at: NOW.toISOString(), value: 12 }], from: 1000, to: 1022, best, ...(previousBest ? { previousBest } : {}) } });
  return { r, events, facts, built: () => r.view(), tick: (ms: number) => (clock += ms) };
}

test('retour de partie : une carte sur la roue après toute partie au score connu, avec le classement ou le tableau de la table', () => {
  // Aucun score relevé : pas de carte, le moment des badges passe.
  const nothing = gameReturn();
  nothing.r.expect();
  assert.equal(nothing.r.holding(), true, 'le moment des badges attend le bilan');
  assert.equal(nothing.r.report(nothing.facts(undefined)), false);
  assert.equal(nothing.built(), undefined, 'aucune carte');
  assert.equal(nothing.r.holding(), false, 'le moment des badges passe');

  // Rien de neuf (sous mon record, personne de dépassé) : la carte s'ouvre avec la place et le prochain.
  const plain = gameReturn({ mine: 9_000_000 });
  assert.equal(plain.r.report(plain.facts(9_000_000, 9_800_000)), true);
  const ranked = plain.built()!.hub.sections;
  const rankTitles = ranked.flatMap((s) => s.cards.map((c) => c.title));
  assert.ok(rankTitles.includes('9 000 000') || rankTitles.some((x) => x.replace(/\D/g, '') === '9000000'), 'le score');
  assert.ok(rankTitles.includes('Ta place : 3ᵉ du jour'), rankTitles.join(' | '));
  assert.ok(rankTitles.includes('Prochain : Léa'));

  // Premier score, sur une table sans classement publié (table originale) : le tableau de la table.
  const at = new Date(NOW.getTime() - 60_000).toISOString();
  const board = [{ rank: 1, score: 90_000_000, initials: 'ABC' }, { rank: 2, score: 74_800_050, initials: 'JUL', at }];
  const original = gameReturn({ board });
  assert.equal(original.r.report({ ...original.facts(74_800_050), version: undefined }), true, 'un premier score ouvre la carte');
  const lines = original.built()!.hub.sections.find((s) => s.title === 'Tableau de la table')!.cards;
  assert.deepEqual(lines.map((c) => [c.title, c.eyebrow]), [['1. ABC', undefined], ['2. JUL', 'Ta partie']]);

  // Ni classement ni tableau : le score seul.
  const alone = gameReturn();
  assert.equal(alone.r.report({ ...alone.facts(5_000), version: undefined }), true);
  assert.ok(!alone.built()!.hub.sections.some((s) => s.title === 'Tableau de la table'));

  const h = gameReturn();
  h.r.expect();
  assert.equal(h.r.report(h.facts(9_712_450, 9_000_000)), true);
  const b = h.built()!;
  assert.deepEqual(b.hub.tabs, [], 'pas d’onglets');
  const titles = b.hub.sections.flatMap((s) => s.cards.map((c) => c.title));
  assert.ok(titles.includes('Tu passes devant Léa'));
  assert.ok(titles.includes('Prochain : Paul'));
  assert.ok(b.hub.band!.fresh! > 0, 'la part gagnée en clair sur la barre');
  assert.deepEqual(b.hub.band!.lines, ['Partie menée au bout +10', 'Partie de 12 min +12'], 'le détail du barème');
  for (const absent of ['Ligue', 'Mission', 'Défier']) assert.ok(!JSON.stringify(b.hub).includes(absent), `ni ${absent}`);
  // Une carte à lire, pas un écran à parcourir : aucun bouton, les commandes en pied.
  assert.ok(b.hub.sections.every((s) => s.cards.every((c) => !c.buttons)), 'aucun bouton sur la carte');
  assert.equal(b.hint, 'Start : rejouer · Flippers : changer de table · Exit : fermer');
});

test('retour de partie : le premier geste ferme la carte pour de bon', () => {
  // Un bouton encore tenu en sortant de la partie : la touche est prise, la carte reste.
  const held = gameReturn();
  held.r.report(held.facts(9_712_450, 9_000_000));
  assert.equal(held.r.key('other'), true, 'un flipper tenu ne fait rien');
  assert.equal(held.r.showing(), true);
  // Ensuite, un flipper ferme la carte et passe à la roue (la touche n'est pas prise) ; elle ne revient pas.
  held.tick(2000);
  assert.equal(held.r.key('other'), false, 'le flipper fait aussi tourner la roue');
  assert.equal(held.r.showing(), false);
  assert.equal(held.built(), undefined, 'fermée pour de bon, même en revenant sur la table');
  assert.equal(held.r.key('other'), false, 'plus de carte : les touches vont à la roue');

  // Exit ferme seulement.
  const exit = gameReturn();
  exit.r.report(exit.facts(9_712_450, 9_000_000));
  exit.tick(2000);
  assert.equal(exit.r.key('exit'), true);
  assert.equal(exit.r.showing(), false);
  assert.deepEqual(exit.events, []);

  // Start relance la table de la partie.
  const start = gameReturn();
  start.r.report(start.facts(9_712_450, 9_000_000));
  start.tick(2000);
  assert.equal(start.r.key('start'), true);
  assert.deepEqual(start.events, ['rejouer Attack from Mars']);
  assert.equal(start.r.showing(), false);

  // La roue quittée sans touche (partie lancée, autre écran) : fermée aussi.
  const gone = gameReturn();
  gone.r.report(gone.facts(9_712_450, 9_000_000));
  gone.r.dismiss('roue quittée');
  assert.equal(gone.built(), undefined);

  // Deux cartes ouvertes à la même milliseconde ont des clés différentes : le rendu, qui garde la carte
  // tant que sa clé ne change pas, montre bien la seconde.
  const one = gameReturn({ now: () => NOW.getTime() });
  const two = gameReturn({ now: () => NOW.getTime() });
  one.r.report(one.facts(9_712_450, 9_000_000));
  two.r.report(two.facts(9_712_450, 9_000_000));
  assert.notEqual(one.built()!.key, two.built()!.key);
});

test('retour de partie : le verrouillage parental retire définitivement la carte et empêche sa relance', () => {
  let authorized = false;
  const h = gameReturn({ tableAllowed: () => authorized });
  const report = h.facts(5_000);
  assert.equal(h.r.report(report), false);
  authorized = true;
  assert.equal(h.r.report(report), true);
  assert.ok(h.built());
  authorized = false;
  assert.equal(h.r.key('start'), false);
  assert.deepEqual(h.events, []);
  assert.equal(h.built(), undefined);
  authorized = true;
  assert.equal(h.r.showing(), false);
});

// ---------- Câblage ----------

test('frontend : les scores relayés, la notification, l’Activité, l’Arène et le retour de partie sont câblés', () => {
  const main = frontendSource();
  assert.match(main, /onScores: \(fresh\) => placeTaken\.scores\(fresh\)/, 'à l’arrivée des scores relayés');
  assert.match(main, /closed: \(\) => socialClosed\(\)/, 'rien en jeu local ni en invité');
  assert.match(main, /places: \{ reach: \(key\) => placeTaken\.reach\(key\) \}/, 'Start sur la ligne d’Activité');
  assert.match(main, /action\.type === 'place-taken'/, 'un clic sur la notification');
  assert.match(main, /!gameReturn\.holding\(\)/, 'le moment des badges attend le retour de partie');
  assert.match(main, /gameReturn\.expect\(\)/);
  // La carte du bilan sur la roue : dessinée sur le plateau, fermée par la première touche et par un clic,
  // et fermée pour de bon quand la roue est quittée.
  assert.match(main, /gameReturn: gameReturnView\(\)/, 'la carte dans l’état du plateau');
  assert.match(main, /if \(gameReturnShowing\(\)\) \{[\s\S]{0,300}gameReturn\.key\(kind\)/, 'la première touche la ferme');
  assert.match(main, /gameReturnShowing\(\)\) \{\s*gameReturn\.dismiss\('un clic'\)/, 'un clic la ferme');
  assert.match(main, /if \(!gameReturnPlace\(\)\) \{\s*gameReturn\.dismiss\('roue quittée'\)/, 'la roue quittée la ferme');
  assert.doesNotMatch(main, /createGameReturn\(\{\s*library/, 'plus d’écran ouvert dans le front-end');
});
