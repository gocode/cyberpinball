// Invitation pendant une partie (29/10/2026) : une invitation d'un ami à une
// partie en direct, reçue pendant que le joueur joue, est gardée (jamais « occupé », sauf pendant
// une partie en direct) ; elle s'annonce par le carillon et une carte discrète posée par-dessus
// VPX, dans le coin du plateau en haut à gauche pour le joueur, quel que soit le sens de l'écran
// et sans toucher le témoin d'un enregistrement (coin droit) ; carte, puis pastille, jusqu'à
// l'expiration ; la fenêtre ne prend jamais le focus et aucune capture ne la voit ; au retour au
// menu, l'invitation encore valable s'ouvre d'elle-même.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { GAME_NOTICE_FULL_MS, GAME_NOTICE_SIZE, gameNoticeBounds, gameNoticeView, inviteLeftMs } from '../gamenotice';
import { indicatorBounds } from '../gamerecording';
import { LIVE_INVITE_MS, type LiveInvite, type LiveMessage } from '../livegame';
import type { Rect, Rotation } from '../model';
import type { TableEntry } from '../tables';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** Coin de l'écran (repère de l'écran) où tombe le coin haut-gauche du joueur, plateau tourné de `rotation` dans le sens horaire. */
function playerTopLeft(zone: Rect, rotation: Rotation): { x: 'left' | 'right'; y: 'top' | 'bottom' } {
  return ({ 0: { x: 'left', y: 'top' }, 90: { x: 'right', y: 'top' }, 180: { x: 'right', y: 'bottom' }, 270: { x: 'left', y: 'bottom' } } as const)[rotation];
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('place : coin haut-gauche du joueur dans les quatre sens, dans la zone, jamais sur le témoin d’enregistrement', () => {
  for (const zone of [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 3840, height: 2160 },
    { x: -1080, y: 200, width: 1080, height: 1920 },
  ]) {
    for (const rotation of ROTATIONS) {
      const unit = Math.min(zone.width, zone.height) / 1080;
      const size = { width: Math.round(GAME_NOTICE_SIZE.full.width * unit), height: Math.round(GAME_NOTICE_SIZE.full.height * unit) };
      const margin = Math.round(GAME_NOTICE_SIZE.margin * unit);
      const r = gameNoticeBounds(zone, rotation, size, margin);
      const what = `${zone.width}×${zone.height}, ${rotation}°`;
      // Couchée quand le plateau l'est.
      const quarter = rotation === 90 || rotation === 270;
      assert.deepEqual([r.width, r.height], quarter ? [size.height, size.width] : [size.width, size.height], what);
      assert.ok(r.x >= zone.x && r.y >= zone.y && r.x + r.width <= zone.x + zone.width && r.y + r.height <= zone.y + zone.height, `${what} : dans la zone`);
      const corner = playerTopLeft(zone, rotation);
      assert.equal(corner.x === 'left' ? r.x - zone.x : zone.x + zone.width - r.x - r.width, margin, `${what} : bord ${corner.x}`);
      assert.equal(corner.y === 'top' ? r.y - zone.y : zone.y + zone.height - r.y - r.height, margin, `${what} : bord ${corner.y}`);
      // Le témoin d'un enregistrement (game-recording.ts : 420 × 72, marge 28) tient l'autre coin.
      const witness = indicatorBounds(zone, rotation, { width: Math.round(420 * unit), height: Math.round(72 * unit) }, Math.round(28 * unit));
      assert.ok(!overlap(r, witness), `${what} : pas sur le témoin`);
    }
  }
});

test('vue : carte entière quelques secondes, puis pastille ; temps restant ; rien une fois expirée', () => {
  const at = new Date('2026-10-29T20:00:00Z');
  const invite: LiveInvite = { id: '0123456789abcdef', host: { key: 'k', name: 'Bruno' }, table: { table: { title: 'Glass Lagoon', roms: [] } }, title: 'Glass Lagoon (Inventé 1987)', players: [], receivedAt: at.toISOString() };
  const view = (ms: number) => gameNoticeView(invite, at, new Date(at.getTime() + ms));
  assert.deepEqual(view(0), {
    mode: 'full',
    title: 'Bruno vous invite à jouer',
    short: 'Invitation de Bruno',
    table: 'Glass Lagoon (Inventé 1987)',
    hint: 'Quittez la partie pour le rejoindre, ou continuez : elle s’efface seule',
    left: '2:00',
    progress: 1,
  });
  assert.equal(view(GAME_NOTICE_FULL_MS - 1)?.mode, 'full');
  assert.equal(view(GAME_NOTICE_FULL_MS)?.mode, 'compact');
  assert.equal(view(36_000)?.left, '1:24');
  assert.equal(view(LIVE_INVITE_MS - 500)?.left, '0:01');
  assert.equal(view(LIVE_INVITE_MS), undefined);
  assert.equal(inviteLeftMs(invite, new Date(at.getTime() + LIVE_INVITE_MS + 1)), 0);
});

// ---------------------------------------------------------------------------
// Service de la partie en direct (app/src/live-game.ts, compilé), sur un réseau d'essai en mémoire.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { invites(): LiveInvite[]; create(table: TableEntry): Promise<unknown>; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function fakeNet() {
  let deliver: ((key: string, m: unknown) => void) | undefined;
  const sent: { key: string; message: LiveMessage }[] = [];
  return {
    sent,
    receive: (key: string, m: LiveMessage) => deliver!(key, m),
    net: {
      state: () => ({ key: { publicKey: 'moi' }, name: 'Moi', friends: [{ key: 'bruno', name: 'Bruno' }] }),
      online: () => true,
      send: (key: string, message: LiveMessage) => (sent.push({ key, message }), true),
      onMessage: (cb: (key: string, m: unknown) => void) => ((deliver = cb), () => (deliver = undefined)),
    },
  };
}

const inviteFrom = (id: string): LiveMessage => ({ t: 'game-invite', game: { id, table: { table: { title: 'Glass Lagoon', roms: [] } }, title: 'Glass Lagoon', players: [{ key: 'bruno', name: 'Bruno' }] } });

test('service : une invitation reçue pendant une partie est gardée et annoncée, jamais « occupé » ; seule une partie en direct en cours répond « occupé »', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-invitation-en-partie-'));
  const vpx = path.join(dir, 'Glass Lagoon.vpx');
  fs.writeFileSync(vpx, 'table');
  const table = { file: vpx, folder: dir, title: 'Glass Lagoon', info: {} } as unknown as TableEntry;
  const { net, sent, receive } = fakeNet();
  const announced: string[] = [];
  const games = createLiveGames({ net, dataDir: dir, tables: () => [table], onInvite: (i: LiveInvite) => announced.push(i.id), play: async () => undefined });
  try {
    // La borne joue (le service n'en sait rien) : l'invitation est gardée, aucune réponse ne part.
    receive('bruno', inviteFrom('0123456789abcdef'));
    assert.deepEqual(announced, ['0123456789abcdef']);
    assert.deepEqual(games.invites().map((i) => i.id), ['0123456789abcdef']);
    assert.equal(sent.length, 0);
    // Déjà dans une partie en direct : « occupé ».
    await games.create(table);
    receive('bruno', inviteFrom('fedcba9876543210'));
    assert.deepEqual(announced, ['0123456789abcdef']);
    assert.deepEqual(sent.map((s) => s.message.t === 'game-answer' && s.message.answer), ['busy']);
  } finally {
    games.stop();
  }
});

// ---------------------------------------------------------------------------
// Branchements

test('branchements : carillon à chaque invitation, carte pendant la partie, fermée à la fin, invitation ouverte au retour', () => {
  const main = read('app', 'src', 'frontend.ts');
  const live = main.slice(main.indexOf('const liveGames = createLiveGames({'), main.indexOf('const friendsMenu = createFriendsMenu({'));
  assert.doesNotMatch(live, /busy:/, 'plus de réponse « occupé » pendant la partie');
  assert.match(live, /onInvite: \(invite\) => \{\s+playUiSound\('invite'\);\s+if \(playing\) gameNotices\.show\(invite\);\s+else if \(liveCanShow\(\)\) friendsMenu\.live\.openInvite/);
  const start = main.indexOf('async function play(');
  const play = main.slice(start, start + main.slice(start).search(/\r?\n\}\r?\n/));
  assert.match(play, /const result = await game\.done;\r?\n\s+if \(watchLive\) clearInterval\(watchLive\);\r?\n\s+gameNotices\.close\(\);/);
  assert.match(play, /const invite = state\.phase === 'menu' && !liveGames\.current\(\) \? liveGames\.invites\(\)\[0\] : undefined;\r?\n\s+if \(invite\) friendsMenu\.live\.openInvite\(invite\.id/);
  // La fenêtre : naît par createWindow, sans focus, traversée par les clics, hors des captures, au-dessus de VPX, montrée sans activation.
  const notice = read('app', 'src', 'game-notice.ts');
  assert.match(notice, /createWindow\(\{/);
  assert.match(notice, /focusable: false,/);
  assert.match(notice, /setIgnoreMouseEvents\(true\)/);
  assert.match(notice, /setContentProtection\(true\)/);
  assert.match(notice, /setAlwaysOnTop\(true, 'screen-saver'\)/);
  assert.match(notice, /showInactive\(\)/);
  assert.doesNotMatch(notice, /\.show\(\)|\.focus\(\)/);
  // La fiche d'une table : « Jouer avec un ami » juste après « Jouer », derrière sa porte (fermée à l'invité).
  const library = read('app', 'src', 'library.ts');
  const sheet = library.slice(library.indexOf('function buildSheet('), library.indexOf('function pagesAction('));
  assert.ok(sheet.indexOf("door: 'sheet.play'") < sheet.indexOf("door: 'sheet.friends'"));
  assert.ok(sheet.indexOf("door: 'sheet.friends'") < sheet.indexOf('...further'));
});
