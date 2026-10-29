// La même table sous deux noms (29/10/2026) : le PinCab récupère « Game of Thrones LE (Stern 2015) »
// chez l'ami ; le plan d'ajout la nomme d'après VPS, « Game of Thrones (Limited Edition) », avec son
// identifiant VPS, que la table de l'ami n'a pas. Ses invitations disaient alors à l'ami « Vous
// n'avez pas cette table ». Le même .vpx est la même table, quel que soit son nom ; une table
// reçue garde le nom qu'elle a chez l'ami.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { matchLiveTable, parseLiveMessage, sameTable, type LiveInvite, type LiveMessage, type LiveTable, type TableIdentity } from '../index';
import type { TableEntry } from '../tables';

const PRINT = 'a'.repeat(64);
const LE: TableIdentity = { title: 'Game of Thrones LE', manufacturer: 'Stern', year: 2015 };
const VPS: TableIdentity = { vpsId: '0jCbA0Ttem', title: 'Game of Thrones (Limited Edition)', manufacturer: 'Stern', year: 2015 };

test('cœur : les deux noms ne désignent pas le même jeu ; le même .vpx, si', () => {
  assert.equal(sameTable(VPS, LE), undefined, 'le cas rapporté : identité VPS d’un côté, autre titre de l’autre');
  const theirs: LiveTable = { table: VPS, print: PRINT, bytes: 123 };
  assert.deepEqual(matchLiveTable(theirs, [{ entry: 'mien', identity: LE, print: PRINT }]), { match: 'same', entry: 'mien' });
  // Sans empreinte commune, rien ne change : autre jeu, absent.
  assert.deepEqual(matchLiveTable(theirs, [{ entry: 'mien', identity: LE, print: 'b'.repeat(64) }]), { match: 'missing' });
  // L'empreinte prime sur un autre exemplaire du même jeu.
  assert.deepEqual(matchLiveTable(theirs, [{ entry: 'autre', identity: VPS, print: 'b'.repeat(64) }, { entry: 'mien', identity: LE, print: PRINT }]), { match: 'same', entry: 'mien' });
});

test('message : la taille du .vpx voyage avec l’invitation, vérifiée', () => {
  const invite = (bytes: unknown) => parseLiveMessage({ t: 'game-invite', game: { id: '0123456789abcdef', title: 'GoT', players: [], table: { table: VPS, print: PRINT, bytes } } });
  const table = (m: LiveMessage | undefined) => (m?.t === 'game-invite' ? m.game.table : undefined);
  assert.equal(table(invite(123_456_789))?.bytes, 123_456_789);
  for (const bad of [-1, 0, 1.5, '12', Number.MAX_SAFE_INTEGER + 1]) assert.equal(table(invite(bad))?.bytes, undefined, String(bad));
});

// ---------------------------------------------------------------------------
// Service (app/src/live-game.ts, compilé) : l'invité calcule l'empreinte des tables de la taille annoncée.

/* eslint-disable @typescript-eslint/no-require-imports */
const { createLiveGames } = require(path.join(REPO_ROOT, 'app', 'dist', 'live-game.js')) as {
  createLiveGames(o: object): { create(table: TableEntry): Promise<{ table: LiveTable }>; matchFor(invite: LiveInvite): Promise<{ match: string; table?: TableEntry }>; stop(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

const net = { state: () => ({ key: { publicKey: 'moi' }, name: 'Moi', friends: [] }), online: () => true, send: () => true, onMessage: () => () => undefined };

test('service : la table reçue et renommée est reconnue à son .vpx, et le journal le dit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-meme-table-'));
  const table = (folder: string, file: string, title: string, content: string, info: object) => {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
    fs.writeFileSync(path.join(root, folder, file), content);
    return { file: path.join(root, folder, file), folder: path.join(root, folder), title, manufacturer: 'Stern', year: 2015, info: { Info: info } } as unknown as TableEntry;
  };
  // Chez l'ami (PinCab) : la table reçue, nommée d'après VPS.
  const pincab = table('Game of Thrones (Limited Edition) (Stern 2015)', 'Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx', 'Game of Thrones (Limited Edition)', 'le même fichier', {
    Title: 'Game of Thrones (Limited Edition)',
    Manufacturer: 'Stern',
    Year: 2015,
    VPSId: '0jCbA0Ttem',
  });
  // Ici (le bureau) : l'original, une table d'une autre taille, une autre de la même taille.
  const mine = table('Game of Thrones LE (Stern 2015)', 'Game of Thrones LE (Stern 2015) VPW 1.2.1.vpx', 'Game of Thrones LE', 'le même fichier', { Title: 'Game of Thrones LE', Manufacturer: 'Stern', Year: 2015 });
  const other = table('Autre (Stern 2015)', 'Autre.vpx', 'Autre', 'un autre fichier, plus long', { Title: 'Autre', Manufacturer: 'Stern', Year: 2015 });
  const twin = table('Jumeau (Stern 2015)', 'Jumeau.vpx', 'Jumeau', 'le même fichieX', { Title: 'Jumeau', Manufacturer: 'Stern', Year: 2015 });
  const host = createLiveGames({ net, dataDir: path.join(root, 'pincab'), tables: () => [pincab], play: async () => undefined });
  const lines: string[] = [];
  const guest = createLiveGames({ net, dataDir: path.join(root, 'bureau'), tables: () => [other, twin, mine], play: async () => undefined, log: (l: string) => lines.push(l) });
  try {
    const sent = (await host.create(pincab)).table;
    assert.equal(sent.bytes, fs.statSync(pincab.file).size);
    const invite: LiveInvite = { id: '0123456789abcdef', host: { key: 'pincab', name: 'PinCab' }, table: sent, title: 'Game of Thrones (Limited Edition) (Stern 2015)', players: [], receivedAt: new Date().toISOString() };
    const found = await guest.matchFor(invite);
    assert.equal(found.match, 'same');
    assert.equal(found.table, mine);
    assert.match(lines.join('\n'), /reconnue par l'empreinte de son \.vpx, ici « Game of Thrones LE »/);
    // Seules les tables de la taille annoncée ont été lues : la plus longue n'a pas d'empreinte.
    const prints = fs.readFileSync(path.join(root, 'bureau', 'amis', 'empreintes.json'), 'utf8').toLowerCase();
    assert.ok(prints.includes(mine.file.toLowerCase().replace(/\\/g, '\\\\')));
    assert.ok(!prints.includes(other.file.toLowerCase().replace(/\\/g, '\\\\')));
    // Un fichier différent : absente, et le journal dit ce qui a été cherché.
    fs.writeFileSync(mine.file, 'le même fichieR');
    lines.length = 0;
    assert.equal((await guest.matchFor(invite)).match, 'missing');
    assert.match(lines.join('\n'), /« Game of Thrones \(Limited Edition\), Stern, 2015, VPS 0jCbA0Ttem » introuvable ici/);
  } finally {
    host.stop();
    guest.stop();
  }
});

test('table reçue : elle garde le nom qu’elle a chez l’ami (un .info pour le plan d’ajout)', () => {
  const menu = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'friend-library-menu.ts'), 'utf8');
  assert.match(menu, /owned \? \{ owned: owned\.file \} : identity \? \{ identity \} : \{\}/, 'l’identité de l’ami voyage avec le téléchargement');
  assert.match(menu, /else seedIdentity\(dir, parseTableIdentity\(job\.data\?\.identity\)\);\s+host\.library\.installReceived/);
  // Le plan d'ajout prend le .info reçu avant le nom du jeu chez VPS.
  const plan = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'core', 'src', 'tableimport.ts'), 'utf8');
  assert.match(plan, /info\.Info = \{ \.\.\.extra\.Info, \.\.\.info\.Info \};[\s\S]*?info\.Info\.Title \?\?= game\.title;/);
});
