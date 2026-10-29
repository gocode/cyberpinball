// Écrans « Amis » (app/src/friends-menu.ts, compilé) sur un réseau coupé : ce que chaque entrée
// ouvre, la sélection de « Partage et réseau » sur « Retour » (un Start par mégarde ne coupe pas
// le partage), le pare-feu à autoriser seulement quand la règle manque, les actions uniques ; la
// bibliothèque partagée seulement après l'avertissement ; chaque écran d'une partie en direct.

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
  icon?: string;
  run: () => void | Promise<void>;
}
interface Built {
  heading: string;
  sections: { title?: string; rows: { text: string }[] }[];
  actions: Action[];
}
type Build = () => Built;
interface Item {
  detail?: string;
  attention?: boolean;
  run(): void;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendsMenu } = require(path.join(APP_DIST, 'friends-menu.js')) as { createFriendsMenu(host: object): { items: Record<string, Item>; live: { open(back: () => void): void } } };
const { createSocialNet } = require(path.join(APP_DIST, 'social-net.js')) as { createSocialNet(o: object): { state(): { shareLibrary: boolean; key: { publicKey: string } } } };
const { createFirewallRule } = require(path.join(APP_DIST, 'firewall-rule.js')) as { createFirewallRule(o: object): { check(): Promise<string> } };
const { createFriendContent } = require(path.join(APP_DIST, 'friend-content.js')) as { createFriendContent(o: object): object };
/* eslint-enable @typescript-eslint/no-require-imports */

const FRIEND = newSocialState().key.publicKey;

/** Parties en direct d'essai : la partie montrée, et une invitation en attente. */
function fakeGames() {
  const games = {
    game: undefined as LiveGame | undefined,
    pending: undefined as LiveInvite | undefined,
    current: () => games.game,
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

function setup(content?: object) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-friends-menu-'));
  // Un ami déjà là (hors ligne : réseau coupé).
  fs.writeFileSync(path.join(dir, 'social.json'), JSON.stringify({ ...newSocialState(), friends: [{ key: FRIEND, name: 'Bruno', since: new Date().toISOString(), events: [] }] }));
  const opened: { build: Build; at?: number }[] = [];
  const net = createSocialNet({ dataDir: dir, mode: 'off' });
  const firewall = createFirewallRule({ exe: 'C:\\x\\CyberPinball.exe', simulated: true });
  const games = fakeGames();
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
      manager: createDownloadManager({ dataDir: dir, transports: {} }),
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
  return { menu, opened, firewall, net, games, last: () => opened.at(-1)! };
}

function uniqueIcons(built: Built, what: string): void {
  const icons = built.actions.map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, `${what} : une icône par action`);
}

test('chaque entrée de la rubrique Amis ouvre son écran, aux actions toutes différentes', () => {
  const { menu, last } = setup();
  for (const [id, heading] of [['friends', 'Mes amis'], ['find-player', 'Trouver un joueur'], ['friend-requests', 'Demandes d’amis'], ['badges', 'Mes badges'], ['sharing', 'Partage et réseau']] as const) {
    menu.items[id]!.run();
    const built = last().build();
    assert.equal(built.heading, heading);
    assert.equal(built.actions.at(-1)!.label, 'Retour', `${id} : Retour en dernier`);
    uniqueIcons(built, id);
  }
  assert.equal(menu.items['friend-requests']!.attention, false);
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
      { key: FRIEND, name: 'Bruno', state: 'accepted', match: 'other-version' },
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
      assert.match(texts.join('|'), /\|1\. Bruno #[0-9A-F]{4} — 2\s?000\s?000\|Alice #[0-9A-F]{4} \(vous\) — Score non disponible$/u);
      assert.equal(texts[0], 'Versions différentes : scores peu comparables');
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
});

test('toute une table d’un ami : chaque ligne mène à sa partie, la ROM et le PuP-Pack décochés, la réception d’abord', async () => {
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
    stop: () => undefined,
  };
  const { menu, last } = setup(content);
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
  // Start sur la ROM la prend.
  await built.actions[rows.find((r) => r.text === 'ROM')!.action!]!.run();
  assert.equal(last().build().actions[0]!.label, 'Récupérer les 3 parties choisies');
});
