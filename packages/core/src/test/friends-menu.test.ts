// Écrans « Amis » (app/src/friends-menu.ts, compilé) sur un réseau coupé : ce que chaque entrée
// ouvre, la sélection de « Partage et réseau » sur « Retour » (un Start par mégarde ne coupe pas
// le partage), le pare-feu à autoriser seulement quand la règle manque, les actions uniques ; la
// bibliothèque partagée seulement après l'avertissement ; chaque écran d'une partie en direct ;
// l'invitation toujours là, grisée avec sa raison, et « Jouer avec un ami » sur la fiche d'une table ;
// le choix de la table avec deux amis : la même version chez tous en tête, les autres grisées avec qui bloque.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { createDownloadManager } from '../downloadmanager';
import { newSocialState } from '../social';
import type { LiveGame, LiveInvite } from '../livegame';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Action {
  label: string;
  detail?: string;
  tone?: string;
  icon?: string;
  run: () => void | Promise<void>;
}
interface Built {
  heading: string;
  subheading?: string;
  sections: { title?: string; rows: { text: string; detail?: string; tone?: string; action?: number }[] }[];
  actions: Action[];
}
type Build = () => Built;
interface Item {
  detail?: string;
  attention?: boolean;
  run(): void;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendsMenu } = require(path.join(APP_DIST, 'friends-menu.js')) as {
  createFriendsMenu(host: object): { items: Record<string, Item>; live: { open(back: () => void): void; sheetAction(table: object, back: () => void): Action; inviteFriends(keys: string[], back: () => void): void } };
};
const { createSocialNet } = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): { state(): { shareLibrary: boolean; key: { publicKey: string } }; status(): object } };
const { createFirewallRule } = require(path.join(APP_DIST, 'firewall-rule.js')) as { createFirewallRule(o: object): { check(): Promise<string>; checkVpx(): Promise<string | undefined> } };
const { createFriendContent } = require(path.join(APP_DIST, 'friend-content.js')) as { createFriendContent(o: object): object };
const { userGesture } = require(path.join(APP_DIST, 'gesture-flash.js')) as { userGesture(): void };
/* eslint-enable @typescript-eslint/no-require-imports */

const FRIEND = newSocialState().key.publicKey;

/** Parties en direct d'essai : la partie montrée, et une invitation en attente. */
function fakeGames() {
  const games = {
    game: undefined as LiveGame | undefined,
    pending: undefined as LiveInvite | undefined,
    current: () => games.game,
    board: () => [] as { player: string; name: string; score: number; at: string; game: string }[],
    history: () => [],
    table: () => undefined,
    manualOf: async () => undefined,
    waitView: () => undefined,
    invites: () => (games.pending ? [games.pending] : []),
    create: async () => games.game!,
    invite: () => true,
    matchFor: async () => ({ match: 'same' as const }),
    /** Empreinte de mes tables, par titre (live-game.ts la calcule) ; sans : illisible. */
    prints: new Map<string, string>(),
    versionOf: async (table: { title: string }) => (games.prints.has(table.title) ? { print: games.prints.get(table.title) } : {}),
    bytesOf: () => undefined,
    accept: async () => ({ match: 'same' as const }),
    decline: () => undefined,
    start: () => true,
    leave: () => undefined,
    close: () => undefined,
    stop: () => undefined,
  };
  return games;
}

/**
 * `presence` : Bruno vu en ligne, dans le menu ou en partie (le réseau reste coupé) ; `vpx` : les
 * programmes de VPX à fermer au réseau ; `extra` : d'autres amis, et les tables de la borne.
 */
function setup(content?: object, presence?: 'menu' | 'playing', vpx?: () => string[] | undefined, extra: { friends?: { key: string; name: string }[]; tables?: object[]; status?: object } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-friends-menu-'));
  // Un ami déjà là (hors ligne : réseau coupé).
  const friends = [{ key: FRIEND, name: 'Bruno' }, ...(extra.friends ?? [])].map((f) => ({ ...f, since: new Date().toISOString(), events: [] }));
  fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...newSocialState(), friends }));
  const opened: { build: Build; at?: number }[] = [];
  const off = createSocialNet({ dataDir: dir, mode: 'off' });
  const shown = presence ? { ...off, online: () => true, presenceOf: () => ({ status: presence, since: new Date().toISOString(), ...(presence === 'playing' ? { table: { title: 'Glass Lagoon' } } : {}) }) } : off;
  const net = extra.status ? { ...shown, status: () => ({ ...off.status(), ...extra.status }) } : shown;
  const firewall = createFirewallRule({ exe: 'C:\\x\\CyberPinball.exe', simulated: true, vpx });
  const games = fakeGames();
  const manager = createDownloadManager({ dataDir: dir, transports: {} });
  const menu = createFriendsMenu({
    library: {
      openCustom: (build: Build, at?: number) => opened.push({ build, at }),
      openSystem: () => undefined,
      openPrompt: () => undefined,
      task: async (_message: string, work: () => Promise<void> | void) => work(),
      openMediasWith: () => undefined,
      catalogFor: () => undefined,
      installReceived: () => undefined,
      isShowing: () => false,
    },
    net,
    firewall,
    // Gestionnaire de téléchargements sans source : les réceptions y entrent, rien ne part.
    downloads: {
      manager,
      finisher: () => undefined,
      deliverer: () => undefined,
      opener: () => undefined,
      deliver: () => undefined,
      openReturn: () => undefined,
    },
    content: content ?? createFriendContent({ net, dataDir: dir, tables: () => [], root: () => undefined, contents: () => undefined }),
    games,
    tables: () => extra.tables ?? [],
    root: () => undefined,
    redraw: () => undefined,
  });
  return { menu, opened, firewall, net, games, manager, last: () => opened.at(-1)! };
}

function uniqueIcons(built: Built, what: string): void {
  const icons = built.actions.map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, `${what} : une icône par action`);
}

/**
 * Le nom d'un joueur s'affiche seul (listes, scores, amis, titres) : jamais d'étiquette « #A1B2 »
 * accolée. Son identifiant n'est que sur sa fiche, dans sa ligne « Identifiant : … ».
 */
function noTag(built: Built, what: string): void {
  const texts = [built.heading, built.subheading ?? '', ...built.actions.map((a) => a.label), ...built.sections.flatMap((x) => x.rows.map((r) => r.text))];
  for (const text of texts) assert.doesNotMatch(text, /#[0-9A-F]{4}\b/, `${what} : « ${text} » porte une étiquette`);
}

test('chaque entrée de la rubrique Amis ouvre son écran, aux actions toutes différentes', () => {
  const { menu, last } = setup();
  for (const [id, heading] of [['friends', 'Mes amis'], ['game-history', 'Historique des parties'], ['find-player', 'Trouver un joueur'], ['friend-requests', 'Demandes d’amis'], ['badges', 'Mes badges'], ['sharing', 'Partage et réseau']] as const) {
    menu.items[id]!.run();
    const built = last().build();
    assert.equal(built.heading, heading);
    assert.equal(built.actions.at(-1)!.label, 'Retour', `${id} : Retour en dernier`);
    uniqueIcons(built, id);
    noTag(built, id);
  }
  assert.equal(menu.items['friend-requests']!.attention, false);
});


/** L'autorisation de Windows est prévenue d'abord (uac-confirm.ts) : « Plus tard » choisi d'office, on confirme. */
async function confirmUac(last: () => { build(): { actions: { label: string; run(): unknown }[] }; at?: number }): Promise<void> {
  const warning = last().build();
  assert.equal(warning.actions[0]!.label, 'Plus tard, au bureau', '« Plus tard » en premier');
  assert.equal(last().at, 0, '« Plus tard » choisi d’office');
  await warning.actions.find((a) => a.label === 'Continuer : Windows demande l’autorisation')!.run();
}

test('« Partage et réseau » : l’état en direct des tables Stern SAM, grisé avec sa raison tant que VPX n’est pas fermé au réseau pour sa version', async () => {
  let version = '10.8.1-5436';
  const programs = () => [`D:\\CP\\emulators\\vpx\\${version}\\VPinballX_BGFX64.exe`, 'D:\\CP\\emulators\\vpx\\current\\VPinballX_BGFX64.exe'];
  let installed = false;
  const { menu, last, firewall } = setup(undefined, undefined, () => (installed ? programs() : undefined));
  const row = () => last().build().sections.flatMap((s) => s.rows).find((r) => r.text === 'État en direct des tables Stern SAM')! as { text: string; detail?: string; tone?: string };
  const allow = () => last().build().actions.find((a) => a.label === 'Autoriser dans le pare-feu de Windows');
  await firewall.check();
  menu.items.sharing!.run();
  assert.deepEqual([row().tone, row().detail], ['quiet', 'Indisponible : VPX n’est pas encore installé'], 'visible avant même l’installation de VPX');
  installed = true;
  await firewall.check();
  menu.items.sharing!.run();
  assert.equal(row().tone, 'quiet');
  assert.match(row().detail!, /^Indisponible : le pare-feu de Windows doit d’abord fermer VPX au réseau/);
  await allow()!.run();
  await confirmUac(last);
  assert.equal(row().tone, 'ok');
  assert.equal(allow(), undefined, 'les deux règles posées : plus rien à autoriser');
  // VPX change de version : la règle vise l'ancien dossier, l'état en direct redevient indisponible.
  version = '10.8.2-6000';
  await firewall.checkVpx();
  menu.items.sharing!.run();
  assert.match(row().detail!, /^Indisponible : VPX a changé de version/);
  assert.ok(allow(), 'la règle est à reposer');
  await allow()!.run();
  await confirmUac(last);
  assert.equal(row().tone, 'ok');
});

test('« Partage et réseau » : sélection sur Retour ; pare-feu à autoriser seulement s’il manque', async () => {
  const { menu, last, firewall } = setup();
  await firewall.check();
  menu.items.sharing!.run();
  assert.equal(last().at, Number.MAX_SAFE_INTEGER);
  const labels = () => last().build().actions.map((a) => a.label);
  assert.ok(labels().includes('Autoriser dans le pare-feu de Windows'));
  const allow = last().build().actions.find((a) => a.label === 'Autoriser dans le pare-feu de Windows')!;
  await allow.run();
  await confirmUac(last);
  assert.ok(!labels().includes('Autoriser dans le pare-feu de Windows'));
  // Réseau coupé pour les essais : dit, jamais présenté comme une panne.
  assert.ok(last().build().sections.some((s) => s.rows.some((r) => r.text === 'Partage activé')));
});

test('bibliothèque partagée : active par défaut entre amis, coupée et remise d’un geste', async () => {
  const { menu, last, net } = setup();
  menu.items.sharing!.run();
  assert.equal(net.state().shareLibrary, true);
  const rows = () => last().build().sections.flatMap((s) => s.rows.map((r) => r.text));
  assert.ok(rows().includes('Bibliothèque partagée avec vos amis'));
  await last().build().actions.find((a) => a.label === 'Ne plus partager ma bibliothèque')!.run();
  assert.equal(net.state().shareLibrary, false);
  assert.equal(last().at, Number.MAX_SAFE_INTEGER);
  await last().build().actions.find((a) => a.label === 'Partager ma bibliothèque avec mes amis')!.run();
  assert.equal(net.state().shareLibrary, true);
  uniqueIcons(last().build(), 'Partage et réseau');
});

test('le message d’un geste reste aux redessins (changement du profil, 250 ms plus tard), jusqu’au geste suivant', async () => {
  const { menu, last } = setup();
  menu.items.sharing!.run();
  const rows = () => last().build().sections.flatMap((s) => s.rows.map((r) => r.text));
  // Le geste (library.ts) précède l'action, qui pose son message.
  userGesture();
  await last().build().actions.find((a) => a.label === 'Ne plus partager ma bibliothèque')!.run();
  assert.ok(rows().includes('Bibliothèque plus partagée'));
  assert.ok(rows().includes('Bibliothèque plus partagée'), 'redessiné sans geste : toujours là');
  userGesture();
  assert.ok(!rows().includes('Bibliothèque plus partagée'), 'effacé au geste suivant');
});

/** La fiche de Bruno. */
async function friendPage(menu: ReturnType<typeof setup>['menu'], last: ReturnType<typeof setup>['last']): Promise<Built> {
  menu.items.friends!.run();
  await last().build().actions.find((a) => a.label.startsWith('Bruno'))!.run();
  return last().build();
}

test('fiche d’un ami : l’invitation toujours là, grisée hors ligne, active en partie avec la notification annoncée', async () => {
  const offline = setup();
  const invite = (b: Built) => b.actions.find((a) => a.label === 'Inviter à une partie en direct');
  const grey = invite(await friendPage(offline.menu, offline.last));
  assert.equal(grey?.tone, 'quiet');
  assert.equal(grey?.detail, 'Hors ligne : invitez-le quand il sera connecté');
  const before = offline.opened.length;
  await grey!.run();
  assert.equal(offline.opened.length, before, 'grisée : Start n’ouvre rien');
  const menu = setup(undefined, 'menu');
  assert.equal(invite(await friendPage(menu.menu, menu.last))?.detail, 'Chacun sur sa borne, au même moment');
  const playing = setup(undefined, 'playing');
  const active = invite(await friendPage(playing.menu, playing.last));
  assert.equal(active?.tone, 'ok');
  assert.equal(active?.detail, 'En partie : il recevra une notification discrète sur sa table');
  await active!.run();
  assert.equal(playing.last().build().heading, 'Partie en direct avec Bruno');
});

test('« Jouer avec un ami » : grisée sans ami en ligne ; sinon le choix de l’ami, en partie compris', async () => {
  const table = { file: 'C:\\t\\Glass Lagoon.vpx', title: 'Glass Lagoon', info: {} };
  const back = () => undefined;
  const offline = setup();
  const grey = offline.menu.live.sheetAction(table, back);
  assert.deepEqual([grey.label, grey.tone, grey.detail], ['Jouer avec un ami', 'quiet', 'Aucun ami en ligne pour l’instant']);
  const playing = setup(undefined, 'playing');
  const active = playing.menu.live.sheetAction(table, back);
  assert.deepEqual([active.tone, active.detail], ['ok', '1 ami en ligne : chacun sur sa borne, au même moment']);
  await active.run();
  const choose = playing.last().build();
  assert.equal(choose.heading, 'Jouer avec un ami');
  const row = choose.sections[0]!.rows[0] as { text: string; detail?: string; tone?: string };
  assert.ok(row.text.startsWith('Bruno'));
  // Sa bibliothèque injoignable (réseau coupé) : signalé, pas refusé.
  assert.equal(row.detail, 'En partie : notifié sur sa table · Bibliothèque de Bruno injoignable pour l’instant');
  assert.equal(row.tone, 'warning');
  assert.deepEqual(choose.actions.map((a) => a.label), ['Bruno', 'Retour']);
  uniqueIcons(choose, 'Jouer avec un ami');
});

test('fiche d’un ami et sa bibliothèque : actions uniques, Retour en dernier', async () => {
  const { menu, last } = setup();
  menu.items.friends!.run();
  await last().build().actions.find((a) => a.label.startsWith('Bruno'))!.run();
  const friend = last().build();
  assert.equal(friend.heading, 'Bruno', 'le nom seul');
  noTag(friend, 'fiche d’un ami');
  // L'identifiant unique : sur la fiche seulement.
  assert.ok(friend.sections.some((x) => x.rows.some((r) => /^Identifiant : [0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(r.text))));
  assert.equal(friend.actions.at(-1)!.label, 'Retour');
  uniqueIcons(friend, 'fiche d’un ami');
  await friend.actions.find((a) => a.label === 'Voir sa bibliothèque')!.run();
  const library = last().build();
  assert.equal(library.heading, 'Bibliothèque de Bruno');
  assert.ok(library.sections.some((s) => s.rows.some((r) => r.text === 'Bruno n’est pas en ligne')));
  uniqueIcons(library, 'bibliothèque');
});

test('partie en direct : salon, départ, résultats, invitation ; chaque écran a ses actions uniques', async () => {
  const { menu, last, games, net } = setup();
  const me = net.state().key.publicKey;
  const base: LiveGame = {
    id: '0123456789abcdef',
    host: me,
    table: { table: { title: 'Terminator 2', manufacturer: 'Williams', year: 1991 }, version: 'VPW 1.2' },
    title: 'Terminator 2 (Williams 1991)',
    players: [
      { key: me, name: 'Alice', state: 'accepted', host: true, match: 'same' },
      { key: FRIEND, name: 'Bruno', state: 'accepted', match: 'same', settings: 'ok' },
    ],
    phase: 'gathering',
    createdAt: new Date().toISOString(),
  };
  const phases: [LiveGame, string][] = [
    [base, 'Partie en direct'],
    [{ ...base, phase: 'countdown', startAt: new Date(Date.now() + 2500).toISOString() }, 'Départ commun'],
    [{ ...base, phase: 'playing', players: [{ ...base.players[0]!, state: 'done', seconds: 300, records: [{ score: 1_000_000, rank: 1 }] }, { ...base.players[1]!, state: 'playing' }] }, 'Partie en direct en cours'],
    [{ ...base, phase: 'finished', players: [{ ...base.players[0]!, state: 'done', seconds: 300 }, { ...base.players[1]!, state: 'done', seconds: 200, records: [{ score: 2_000_000, rank: 3 }] }] }, 'Résultats'],
    [{ ...base, phase: 'cancelled' }, 'Partie annulée'],
  ];
  for (const [game, heading] of phases) {
    games.game = game;
    menu.live.open(() => undefined);
    const built = last().build();
    assert.equal(built.heading, heading);
    uniqueIcons(built, heading);
    // Compte à rebours : le curseur sur « Retour » (un Start pour se préparer ne quitte pas la partie).
    if (game.phase === 'countdown') {
      assert.equal(last().at, Number.MAX_SAFE_INTEGER);
      assert.equal(built.sections[0]!.rows[0]!.text, '3');
    }
    // Le record entré passe devant la partie sans record, qui n'a pas de rang (score inconnu).
    if (game.phase === 'finished') {
      const texts = built.sections.flatMap((s) => s.rows.map((r) => r.text));
      assert.match(texts.join('|'), /(^|\|)1\. Bruno — 2\s?000\s?000\|Alice \(vous\) — Score non disponible\|Aucun score classé pour l’instant$/u);
      // La même version, mais 5 billes par partie contre 3 : hors classement, avec la raison.
      games.game = { ...game, table: { ...game.table, balls: 3 }, players: game.players.map((p) => (p.host ? { ...p, balls: 3 } : { ...p, balls: 5 })) };
      menu.live.open(() => undefined);
      const balls = last().build().sections.flatMap((s) => s.rows);
      assert.equal(balls[0]!.text, 'Autre nombre de billes : score hors classement');
      assert.match(balls.map((r) => r.text).join('|'), /\|Bruno — 2\s?000\s?000\|/u);
      assert.match(balls.find((r) => r.text.startsWith('Bruno'))!.detail as string, /Hors classement : 5 billes au lieu de 3/);
      // Le tableau du groupe sur cette version, sous les résultats ; le record à battre, dans le salon.
      games.board = () => [{ player: FRIEND, name: 'Bruno', score: 2_000_000, at: '2026-10-30T20:00:00.000Z', game: 'g' }];
      menu.live.open(() => undefined);
      const boardSection = last().build().sections.at(-1)!;
      assert.equal(boardSection.title, 'Records du groupe sur cette version');
      assert.match(boardSection.rows[0]!.text, /^1\. Bruno — 2\s?000\s?000$/u);
      games.game = base;
      menu.live.open(() => undefined);
      assert.ok(last().build().sections.flatMap((s) => s.rows).some((r) => /^Record du groupe à battre : 2\s?000\s?000$/u.test(r.text)));
      games.board = () => [];
    }
  }
  // Salon d'un invité : le curseur sur « Retour », pas sur « Quitter la partie ».
  games.game = { ...base, host: FRIEND, players: [{ ...base.players[1]!, host: true }, { ...base.players[0]!, host: undefined }] };
  menu.live.open(() => undefined);
  assert.equal(last().at, Number.MAX_SAFE_INTEGER);
  assert.equal(last().build().actions.at(-1)!.label, 'Retour');
  games.game = undefined;
  games.pending ={ id: 'fedcba9876543210', host: { key: FRIEND, name: 'Bruno' }, table: base.table, title: base.title, players: [], receivedAt: new Date().toISOString() };
  assert.equal(menu.items.friends!.attention, true);
  menu.live.open(() => undefined);
  // L'invitation s'ouvre une fois la table vérifiée sur la borne.
  await new Promise((r) => setImmediate(r));
  const invite = last().build();
  assert.equal(invite.heading, 'Invitation de Bruno');
  assert.equal(last().at, Number.MAX_SAFE_INTEGER, 'ouverte d’elle-même : le curseur sur « Répondre plus tard »');
  assert.equal(invite.actions.at(-1)!.label, 'Répondre plus tard');
  uniqueIcons(invite, 'invitation');
  assert.equal(invite.actions[0]!.label, 'Accepter');
  // Pas la même version (30/10/2026) : pas d'« Accepter », mais sa version chez lui, la table cochée d'office.
  for (const [scriptDiffers, row] of [[false, 'Autre version de cette table'], [true, 'Même table, autre script']] as const) {
    games.pending = { ...games.pending!, id: scriptDiffers ? '00000000000000a2' : '00000000000000a1' };
    games.matchFor = (async () => ({ match: 'other-version' as const, ...(scriptDiffers ? { scriptDiffers: true } : {}) })) as unknown as typeof games.matchFor;
    (menu.live as unknown as { openInvite(id: string, back: () => void): void }).openInvite(games.pending.id, () => undefined);
    await new Promise((r) => setImmediate(r));
    const other = last().build();
    assert.ok(other.sections.flatMap((s) => s.rows).some((r) => r.text === row), row);
    assert.ok(!other.actions.some((a) => a.label === 'Accepter'));
    assert.equal(other.actions[0]!.label, 'Récupérer sa version chez Bruno');
    uniqueIcons(other, row);
  }
});

test('toute une table d’un ami : chaque ligne mène à sa partie, la ROM et le PuP-Pack décochés jusqu’à l’attestation des droits, l’écran ouvert dans la liste', async () => {
  const id = (n: number) => n.toString(16).padStart(16, '0');
  const files = [
    { id: id(1), rel: 'Bride of Pin-bot (Williams 1991).vpx', bytes: 200_000, part: 'table' },
    { id: id(2), rel: 'Bride of Pin-bot (Williams 1991).directb2s', bytes: 50_000, part: 'b2s' },
    { id: id(3), rel: 'pinmame/roms/bop_l7.zip', bytes: 300_000, part: 'rom' },
    { id: id(4), rel: 'pupvideos/bop_l7/screens.pup', bytes: 2_000, part: 'pup' },
  ];
  const library = { at: new Date().toISOString(), tables: [{ id: id(9), table: { title: 'Bride of Pin-bot', manufacturer: 'Williams', year: 1991 }, medias: [] }] };
  const content = {
    library: () => ({ state: 'ready', library }),
    refresh: () => undefined,
    fetch: async () => ({ received: [], failed: [] }),
    tableFiles: async () => files,
    fetchTable: async () => ({ dir: '', received: [], failed: [] }),
    receivedDir: () => '',
    tableDir: (folder: string) => path.join(os.tmpdir(), 'cp-friends-menu-table', folder),
    stop: () => undefined,
  };
  const { menu, last, manager } = setup(content);
  menu.items.friends!.run();
  await last().build().actions.find((a) => a.label.startsWith('Bruno'))!.run();
  await last().build().actions.find((a) => a.label === 'Voir sa bibliothèque')!.run();
  await last().build().actions.find((a) => a.label.startsWith('Bride of Pin-bot'))!.run();
  await last().build().actions.find((a) => a.label === 'Récupérer toute la table')!.run();
  await new Promise((r) => setImmediate(r));
  // Les parties arrivées pendant que l'écran est montré : il se rouvre, le curseur sur la première partie (01/11/2026).
  const opened = last();
  opened.build();
  await new Promise((r) => setImmediate(r));
  assert.notEqual(last(), opened, 'l’écran se rouvre une fois les parties arrivées');
  assert.ok(!last().at, 'le curseur sur la première partie, dans la liste, pas sur « Retour »');
  const built = last().build() as unknown as { heading: string; actions: Action[]; sections: { rows: { text: string; action?: number; badges?: string[] }[] }[] };
  assert.equal(built.heading, 'Récupérer toute la table');
  assert.equal(built.actions[0]!.label, 'Table', 'les parties d’abord : l’écran s’ouvre dans la liste');
  const getLabel = () => last().build().actions.find((a) => a.label.startsWith('Récupérer les '))?.label;
  assert.equal(getLabel(), 'Récupérer les 2 parties cochées', 'la ROM et le PuP-Pack laissés de côté');
  const rows = built.sections.flatMap((x) => x.rows).filter((r) => r.action !== undefined);
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(built.actions[row.action!]!.label, row.text, `la ligne « ${row.text} » mène à sa propre action`);
  assert.deepEqual(rows.find((r) => r.text === 'ROM')!.badges, ['Non cochée']);
  assert.deepEqual(rows.find((r) => r.text === 'PuP-Pack')!.badges, ['Non cochée']);
  // Start sur la ROM ouvre sa mention légale : rien n'est coché tant que l'attestation ne l'est pas.
  await built.actions[rows.find((r) => r.text === 'ROM')!.action!]!.run();
  type Shown = { heading: string; lead?: string; actions: Action[]; sections: { rows: { text: string; action?: number; badges?: string[]; pick?: boolean }[] }[] };
  const attest = () => last().build() as unknown as Shown;
  assert.equal(attest().heading, 'La ROM : vos droits');
  assert.ok(!last().at, 'le curseur sur l’attestation');
  const pledge = attest().sections.flatMap((x) => x.rows).find((r) => r.pick)!;
  assert.match(pledge.text, /^J’atteste avoir le droit de détenir ce contenu/);
  assert.equal(pledge.action, 0, 'la ligne de l’engagement mène à la case');
  assert.deepEqual(pledge.badges, ['À cocher']);
  assert.match(attest().sections.flatMap((x) => x.rows.map((r) => r.text)).join('|'), /la borne de Bruno\b/);
  const screens = () => last();
  const before = screens();
  await attest().actions.find((a) => a.label === 'Prendre la ROM')!.run();
  assert.equal(screens(), before, 'sans l’attestation cochée, « Prendre la ROM » ne fait rien');
  // Retour sans cocher : la ROM reste « Non cochée ».
  await attest().actions.find((a) => a.label === 'Retour')!.run();
  assert.equal(getLabel(), 'Récupérer les 2 parties cochées');
  // Cochée puis prise : la ROM rejoint les parties choisies.
  const romRow = () => (last().build() as unknown as Shown).sections.flatMap((x) => x.rows).find((r) => r.text === 'ROM')!;
  await last().build().actions[romRow().action!]!.run();
  await attest().actions[0]!.run();
  assert.deepEqual(attest().sections.flatMap((x) => x.rows).find((r) => r.pick)!.badges, ['Cochée']);
  await attest().actions.find((a) => a.label === 'Prendre la ROM')!.run();
  assert.equal(getLabel(), 'Récupérer les 3 parties cochées');
  assert.deepEqual(romRow().badges, ['Cochée']);
  // Décochée puis recochée : l'attestation vaut pour l'écran, la mention ne revient pas.
  await last().build().actions[romRow().action!]!.run();
  await last().build().actions[romRow().action!]!.run();
  assert.equal(last().build().heading, 'Récupérer toute la table');
  // Le PuP-Pack demande sa propre attestation.
  const pupRow = (last().build() as unknown as Shown).sections.flatMap((x) => x.rows).find((r) => r.text === 'PuP-Pack')!;
  await last().build().actions[pupRow.action!]!.run();
  assert.equal(attest().heading, 'Le PuP-Pack : vos droits');
  await attest().actions.find((a) => a.label === 'Retour')!.run();
  // La réception : la ROM attestée part, avec la trace de l'attestation ; le PuP-Pack non attesté, jamais.
  await last().build().actions.find((a) => a.label.startsWith('Récupérer les '))!.run();
  const job = manager.jobs().at(-1)!;
  assert.deepEqual(job.files.map((f) => f.name).sort(), ['Bride of Pin-bot (Williams 1991).directb2s', 'Bride of Pin-bot (Williams 1991).vpx', 'pinmame/roms/bop_l7.zip']);
  assert.deepEqual(job.data?.attested, ['rom']);
  assert.ok(typeof job.data?.attestedAt === 'string');
});

test('choix de la table avec deux amis : la même version chez tous en tête, les autres grisées avec qui bloque, sa version à récupérer', async () => {
  const EMILE = newSocialState().key.publicKey;
  const P = (c: string) => c.repeat(64);
  const table = (title: string) => ({ file: `C:\\t\\${title}.vpx`, folder: 'C:\\t', title, manufacturer: 'Williams', year: 1991, info: {} });
  const tables = ['Fish Tales', 'Medieval Madness', 'Terminator 2', 'Twilight Zone'].map(table);
  const theirs = (id: number, title: string) => ({ id: id.toString(16).padStart(16, '0'), table: { title, manufacturer: 'Williams', year: 1991 }, medias: [] });
  // Bruno : T2 et Twilight Zone à l'identique, Fish Tales dans une autre version, pas Medieval.
  // Émile : T2, Fish Tales et Medieval à l'identique ; Twilight Zone, sa version encore en route.
  const libraries: Record<string, { tables: ReturnType<typeof theirs>[]; prints: Record<string, string | 'pending'> }> = {
    [FRIEND]: { tables: [theirs(1, 'Terminator 2'), theirs(2, 'Fish Tales'), theirs(3, 'Twilight Zone')], prints: { [theirs(1, '').id]: P('a'), [theirs(2, '').id]: P('e'), [theirs(3, '').id]: P('d') } },
    [EMILE]: { tables: [theirs(4, 'Terminator 2'), theirs(5, 'Fish Tales'), theirs(6, 'Medieval Madness'), theirs(7, 'Twilight Zone')], prints: { [theirs(4, '').id]: P('a'), [theirs(5, '').id]: P('b'), [theirs(6, '').id]: P('c'), [theirs(7, '').id]: 'pending' } },
  };
  const asked: string[] = [];
  const content = {
    library: (key: string) => ({ state: 'ready', library: { at: new Date().toISOString(), versions: true, tables: libraries[key]!.tables } }),
    refresh: () => undefined,
    tableVersions: (key: string, ids: readonly string[]) => {
      asked.push(...ids);
      return new Map(ids.map((id) => [id, libraries[key]!.prints[id] === 'pending' ? 'pending' : { id, print: libraries[key]!.prints[id] }]));
    },
    tableFiles: async () => 'offline',
    receivedDir: () => '',
    tableDir: () => '',
    stop: () => undefined,
  };
  const { menu, last, games } = setup(content, 'menu', undefined, { friends: [{ key: EMILE, name: 'Émile' }], tables });
  for (const [title, print] of [['Terminator 2', P('a')], ['Fish Tales', P('b')], ['Medieval Madness', P('c')], ['Twilight Zone', P('d')]] as const) games.prints.set(title, print);
  menu.live.inviteFriends([FRIEND, EMILE], () => undefined);
  // Mes empreintes se calculent d'abord (en arrière-plan) : « à vérifier », jamais « autre version ».
  const first = last().build();
  assert.deepEqual(first.sections.map((s) => s.title), ['À vérifier (3)', 'Indisponibles (1)']);
  const opened = last();
  await new Promise((r) => setImmediate(r));
  // Mes empreintes arrivées : les tables se rangent, l'écran se rouvre une fois, le curseur sur la première.
  opened.build();
  await new Promise((r) => setImmediate(r));
  assert.notEqual(last(), opened, 'rouvert une fois les empreintes connues');
  assert.equal(last().at, undefined);
  const built = last().build();
  assert.equal(built.heading, 'Partie en direct avec Bruno, Émile');
  assert.deepEqual(
    built.sections.map((s) => [s.title, s.rows.map((r) => [r.text, r.detail, r.tone])]),
    [
      ['Même version chez tous (1)', [['Terminator 2 (Williams 1991)', 'Même version chez Bruno, Émile', 'ok']]],
      ['À vérifier (1)', [['Twilight Zone (Williams 1991)', 'Version de Émile en cours de vérification…', 'warning']]],
      [
        'Indisponibles (2)',
        [
          ['Fish Tales (Williams 1991)', 'Autre version chez Bruno · Start : récupérer sa version chez Bruno', 'quiet'],
          ['Medieval Madness (Williams 1991)', 'Bruno n’a pas cette table', 'quiet'],
        ],
      ],
    ],
  );
  // Les versions demandées : celles des seules tables qui peuvent être les miennes.
  assert.ok(asked.length > 0 && asked.every((id) => Object.values(libraries).some((l) => l.tables.some((x) => x.id === id))));
  // Une table absente chez Bruno : Start n'ouvre rien.
  const rowAction = (text: string) => built.actions[built.sections.flatMap((s) => s.rows).find((r) => r.text.startsWith(text))!.action!]!;
  const before = last();
  await rowAction('Medieval Madness').run();
  assert.equal(last(), before, 'grisée : Start n’ouvre rien');
  // Une autre version chez Bruno : les parties de sa table, la table cochée d'office.
  await rowAction('Fish Tales').run();
  assert.equal(last().build().heading, 'Parties de sa table');
  // La même version chez tous : l'invitation part vers les deux.
  const invited: string[] = [];
  (games as unknown as { invite(key: string): boolean }).invite = (key: string) => (invited.push(key), true);
  await rowAction('Terminator 2').run();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(invited, [FRIEND, EMILE]);
});

test('« Ajouter une table > Depuis un ami » : les amis qui ont des tables à prendre d’abord, puis sa bibliothèque, ses tables absentes en tête', async () => {
  // Demande du 06/11/2026 : choisir une table chez un ami depuis « Ajouter une table ».
  const EMILE = newSocialState().key.publicKey;
  const table = (title: string) => ({ file: `C:\t\${title}.vpx`, folder: 'C:\t', title, manufacturer: 'Williams', year: 1991, info: {} });
  const theirs = (id: number, title: string) => ({ id: id.toString(16).padStart(16, '0'), table: { title, manufacturer: 'Williams', year: 1991 }, medias: [] });
  // Bruno n'a que des tables déjà sur la borne ; Émile en a deux qu'elle n'a pas.
  const libraries: Record<string, ReturnType<typeof theirs>[]> = {
    [FRIEND]: [theirs(1, 'Terminator 2')],
    [EMILE]: [theirs(2, 'Terminator 2'), theirs(3, 'Fish Tales'), theirs(4, 'Medieval Madness')],
  };
  const content = {
    library: (key: string) => ({ state: 'ready', library: { at: new Date().toISOString(), tables: libraries[key]! } }),
    refresh: () => undefined,
    receivedDir: () => '',
    tableDir: () => '',
    stop: () => undefined,
  };
  const { menu, last } = setup(content, 'menu', undefined, { friends: [{ key: EMILE, name: 'Émile' }], tables: [table('Terminator 2')] });
  const add = (menu as unknown as { addFromFriend: { detail(): string; open(back: () => void): void } }).addFromFriend;
  assert.match(add.detail(), /2 amis en ligne/);
  let back = 0;
  add.open(() => back++);
  type Shown = { heading: string; lead?: string; actions: Action[]; sections: { title?: string; rows: { text: string; detail?: string; tone?: string; action?: number; badges?: string[] }[] }[] };
  const friends = last().build() as unknown as Shown;
  assert.equal(friends.heading, 'Depuis un ami');
  const rows = friends.sections.flatMap((s) => s.rows).filter((r) => r.action !== undefined);
  assert.deepEqual(rows.map((r) => r.text), ['Émile', 'Bruno'], 'celle qui a des tables à prendre d’abord');
  assert.deepEqual(rows[0]!.badges, ['2 à prendre']);
  assert.match(rows[0]!.detail!, /^3 tables, dont 2 absentes de votre borne$/);
  assert.match(rows[1]!.detail!, /toutes déjà sur votre borne/);
  for (const row of rows) assert.equal(friends.actions[row.action!]!.label, row.text, `la ligne « ${row.text} » mène à sa propre action`);
  assert.equal(friends.actions.at(-1)!.label, 'Retour');
  await friends.actions.at(-1)!.run();
  assert.equal(back, 1, 'Retour revient à « Ajouter une table »');
  // Sa bibliothèque : ses tables absentes d'abord, le curseur sur la première.
  add.open(() => back++);
  await (last().build() as unknown as Shown).actions[rows[0]!.action!]!.run();
  const library = last().build() as unknown as Shown;
  assert.equal(library.heading, 'Bibliothèque de Émile');
  assert.deepEqual(library.sections.map((s) => s.title), ['Absentes de votre borne (2)', 'Sur votre borne (1)']);
  assert.match(library.actions[0]!.label, /^(Fish Tales|Medieval Madness)/, 'la première action est la première table absente');
  for (const row of library.sections.flatMap((s) => s.rows).filter((r) => r.action !== undefined)) assert.equal(library.actions[row.action!]!.label, row.text);
  // Son « Retour » ramène à la liste des amis de l'ajout.
  await library.actions.at(-1)!.run();
  assert.equal(last().build().heading, 'Depuis un ami');
});

test('« Depuis un ami » : un ami hors ligne est grisé avec sa raison, et Start n’y mène nulle part', () => {
  const { menu, last } = setup();
  const add = (menu as unknown as { addFromFriend: { detail(): string; open(back: () => void): void } }).addFromFriend;
  assert.match(add.detail(), /aucun ami en ligne/);
  add.open(() => undefined);
  const built = last().build();
  const row = built.sections.flatMap((s) => s.rows).find((r) => r.action !== undefined)!;
  assert.equal(row.tone, 'quiet');
  assert.match(row.detail!, /^Hors ligne/);
  const action = built.actions[row.action!]!;
  assert.equal(action.tone, 'quiet');
  assert.match(action.detail!, /^Indisponible : /);
  const before = last();
  void action.run();
  assert.equal(last(), before, 'rien ne s’ouvre');
});

test('réseau local en panne (multidiffusion refusée, aucune carte) : averti dans « Partage et réseau » et « À proximité », jamais « Bloquant »', () => {
  for (const [lanError, reason] of [['addMembership EHOSTUNREACH', 'addMembership EHOSTUNREACH'], ['no-interface', 'aucune carte réseau connectée']] as const) {
    const { menu, last } = setup(undefined, undefined, undefined, { status: { running: true, internet: true, lan: false, lanError } });
    const rows = () => last().build().sections.flatMap((s) => s.rows) as { text: string; detail?: string; tone?: string; badges?: string[] }[];
    menu.items.sharing!.run();
    const lan = rows().find((r) => r.text.startsWith('Réseau local'))!;
    assert.deepEqual([lan.text, lan.tone, lan.badges], ['Réseau local : indisponible', 'warning', ['Indisponible']]);
    assert.equal(lan.detail, `${reason} · Internet continue sans lui ; nouvel essai tout seul`);
    menu.items['find-player']!.run();
    assert.ok(rows().some((r) => r.text === `Réseau local indisponible : ${reason}` && r.tone === 'quiet'), 'À proximité : la raison, grisée');
    menu.items.friends!.run();
    assert.ok(!rows().some((r) => r.badges?.includes('Bloquant')), 'Mes amis : rien de bloquant, Internet tourne');
  }
});
