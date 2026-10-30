// Écrans « Amis » (app/src/friends-menu.ts, compilé) sur un réseau coupé : ce que chaque entrée
// ouvre, la sélection de « Partage et réseau » sur « Retour » (un Start par mégarde ne coupe pas
// le partage), le pare-feu à autoriser seulement quand la règle manque, les actions uniques ; la
// bibliothèque partagée seulement après l'avertissement ; chaque écran d'une partie en direct ;
// l'invitation toujours là, grisée avec sa raison, et « Jouer avec un ami » sur la fiche d'une table.

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
  sections: { title?: string; rows: { text: string; detail?: string }[] }[];
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
  createFriendsMenu(host: object): { items: Record<string, Item>; live: { open(back: () => void): void; sheetAction(table: object, back: () => void): Action } };
};
const { createSocialNet } = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): { state(): { shareLibrary: boolean; key: { publicKey: string } } } };
const { createFirewallRule } = require(path.join(APP_DIST, 'firewall-rule.js')) as { createFirewallRule(o: object): { check(): Promise<string>; checkVpx(): Promise<string | undefined> } };
const { createFriendContent } = require(path.join(APP_DIST, 'friend-content.js')) as { createFriendContent(o: object): object };
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
    invites: () => (games.pending ? [games.pending] : []),
    create: async () => games.game!,
    invite: () => true,
    matchFor: async () => ({ match: 'same' as const }),
    accept: async () => ({ match: 'same' as const }),
    decline: () => undefined,
    start: () => true,
    leave: () => undefined,
    close: () => undefined,
    stop: () => undefined,
  };
  return games;
}

/** `presence` : Bruno vu en ligne, dans le menu ou en partie (le réseau reste coupé) ; `vpx` : les programmes de VPX à fermer au réseau. */
function setup(content?: object, presence?: 'menu' | 'playing', vpx?: () => string[] | undefined) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-friends-menu-'));
  // Un ami déjà là (hors ligne : réseau coupé).
  fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...newSocialState(), friends: [{ key: FRIEND, name: 'Bruno', since: new Date().toISOString(), events: [] }] }));
  const opened: { build: Build; at?: number }[] = [];
  const off = createSocialNet({ dataDir: dir, mode: 'off' });
  const net = presence ? { ...off, online: () => true, presenceOf: () => ({ status: presence, since: new Date().toISOString(), ...(presence === 'playing' ? { table: { title: 'Glass Lagoon' } } : {}) }) } : off;
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
    tables: () => [],
    root: () => undefined,
    redraw: () => undefined,
  });
  return { menu, opened, firewall, net, games, manager, last: () => opened.at(-1)! };
}

function uniqueIcons(built: Built, what: string): void {
  const icons = built.actions.map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, `${what} : une icône par action`);
}

test('chaque entrée de la rubrique Amis ouvre son écran, aux actions toutes différentes', () => {
  const { menu, last } = setup();
  for (const [id, heading] of [['friends', 'Mes amis'], ['game-history', 'Historique des parties'], ['find-player', 'Trouver un joueur'], ['friend-requests', 'Demandes d’amis'], ['badges', 'Mes badges'], ['sharing', 'Partage et réseau']] as const) {
    menu.items[id]!.run();
    const built = last().build();
    assert.equal(built.heading, heading);
    assert.equal(built.actions.at(-1)!.label, 'Retour', `${id} : Retour en dernier`);
    uniqueIcons(built, id);
  }
  assert.equal(menu.items['friend-requests']!.attention, false);
});

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
  assert.equal(row().tone, 'ok');
  assert.equal(allow(), undefined, 'les deux règles posées : plus rien à autoriser');
  // VPX change de version : la règle vise l'ancien dossier, l'état en direct redevient indisponible.
  version = '10.8.2-6000';
  await firewall.checkVpx();
  menu.items.sharing!.run();
  assert.match(row().detail!, /^Indisponible : VPX a changé de version/);
  assert.ok(allow(), 'la règle est à reposer');
  await allow()!.run();
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
  const row = choose.sections[0]!.rows[0] as { text: string; detail?: string };
  assert.ok(row.text.startsWith('Bruno'));
  assert.equal(row.detail, 'En partie : notifié sur sa table');
  assert.deepEqual(choose.actions.map((a) => a.label), ['Bruno', 'Retour']);
  uniqueIcons(choose, 'Jouer avec un ami');
});

test('fiche d’un ami et sa bibliothèque : actions uniques, Retour en dernier', async () => {
  const { menu, last } = setup();
  menu.items.friends!.run();
  await last().build().actions.find((a) => a.label.startsWith('Bruno'))!.run();
  const friend = last().build();
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
      assert.match(texts.join('|'), /(^|\|)1\. Bruno #[0-9A-F]{4} — 2\s?000\s?000\|Alice #[0-9A-F]{4} \(vous\) — Score non disponible\|Aucun score classé pour l’instant$/u);
      // La même version, mais 5 billes par partie contre 3 : hors classement, avec la raison.
      games.game = { ...game, table: { ...game.table, balls: 3 }, players: game.players.map((p) => (p.host ? { ...p, balls: 3 } : { ...p, balls: 5 })) };
      menu.live.open(() => undefined);
      const balls = last().build().sections.flatMap((s) => s.rows);
      assert.equal(balls[0]!.text, 'Autre nombre de billes : score hors classement');
      assert.match(balls.map((r) => r.text).join('|'), /\|Bruno #[0-9A-F]{4} — 2\s?000\s?000\|/u);
      assert.match(balls.find((r) => r.text.startsWith('Bruno'))!.detail as string, /Hors classement : 5 billes au lieu de 3/);
      // Le tableau du groupe sur cette version, sous les résultats ; le record à battre, dans le salon.
      games.board = () => [{ player: FRIEND, name: 'Bruno', score: 2_000_000, at: '2026-10-30T20:00:00.000Z', game: 'g' }];
      menu.live.open(() => undefined);
      const boardSection = last().build().sections.at(-1)!;
      assert.equal(boardSection.title, 'Records du groupe sur cette version');
      assert.match(boardSection.rows[0]!.text, /^1\. Bruno #[0-9A-F]{4} — 2\s?000\s?000$/u);
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

test('toute une table d’un ami : chaque ligne mène à sa partie, la ROM et le PuP-Pack décochés jusqu’à l’attestation des droits, la réception d’abord', async () => {
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
  // Les parties arrivées pendant que l'écran est montré : il se rouvre, le curseur sur la réception.
  const opened = last();
  opened.build();
  await new Promise((r) => setImmediate(r));
  assert.notEqual(last(), opened, 'l’écran se rouvre une fois les parties arrivées');
  assert.ok(!last().at, 'le curseur sur la première action, pas sur « Retour »');
  const built = last().build() as unknown as { heading: string; actions: Action[]; sections: { rows: { text: string; action?: number; badges?: string[] }[] }[] };
  assert.equal(built.heading, 'Récupérer toute la table');
  assert.equal(built.actions[0]!.label, 'Récupérer les 2 parties choisies', 'la réception d’abord, la ROM et le PuP-Pack laissés de côté');
  const rows = built.sections.flatMap((x) => x.rows).filter((r) => r.action !== undefined);
  assert.equal(rows.length, 4);
  for (const row of rows) assert.equal(built.actions[row.action!]!.label, row.text, `la ligne « ${row.text} » mène à sa propre action`);
  assert.deepEqual(rows.find((r) => r.text === 'ROM')!.badges, ['Pas prise']);
  assert.deepEqual(rows.find((r) => r.text === 'PuP-Pack')!.badges, ['Pas prise']);
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
  assert.match(attest().sections.flatMap((x) => x.rows.map((r) => r.text)).join('|'), /la borne de Bruno #[0-9A-F]{4}/);
  const screens = () => last();
  const before = screens();
  await attest().actions.find((a) => a.label === 'Prendre la ROM')!.run();
  assert.equal(screens(), before, 'sans l’attestation cochée, « Prendre la ROM » ne fait rien');
  // Retour sans cocher : la ROM reste « Pas prise ».
  await attest().actions.find((a) => a.label === 'Retour')!.run();
  assert.equal(last().build().actions[0]!.label, 'Récupérer les 2 parties choisies');
  // Cochée puis prise : la ROM rejoint les parties choisies.
  const romRow = () => (last().build() as unknown as Shown).sections.flatMap((x) => x.rows).find((r) => r.text === 'ROM')!;
  await last().build().actions[romRow().action!]!.run();
  await attest().actions[0]!.run();
  assert.deepEqual(attest().sections.flatMap((x) => x.rows).find((r) => r.pick)!.badges, ['Cochée']);
  await attest().actions.find((a) => a.label === 'Prendre la ROM')!.run();
  assert.equal(last().build().actions[0]!.label, 'Récupérer les 3 parties choisies');
  assert.deepEqual(romRow().badges, ['La sienne']);
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
  await last().build().actions[0]!.run();
  const job = manager.jobs().at(-1)!;
  assert.deepEqual(job.files.map((f) => f.name).sort(), ['Bride of Pin-bot (Williams 1991).directb2s', 'Bride of Pin-bot (Williams 1991).vpx', 'pinmame/roms/bop_l7.zip']);
  assert.deepEqual(job.data?.attested, ['rom']);
  assert.ok(typeof job.data?.attestedAt === 'string');
});
