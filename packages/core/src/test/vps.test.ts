import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { applyImport, planImport } from '../tableimport';
import { parseTableName, readInfo } from '../tables';
import { createVpsDb, loadVpsDb, matchVps, refreshVpsDb, VPS_DB_FILE, VPS_DB_URL, VPS_UPDATED_URL, type VpsGame } from '../vps';

// Extrait réduit de la base VPS, recopié à la main (identifiants, noms, fabricants,
// années, auteurs et versions tels que VPS les donne) : la base n'est pas livrée.
const vpx = (id: string, authors: string[], version: string, mod = false) => ({ id, authors, version, tableFormat: 'VPX', features: mod ? ['MOD'] : [] });
const GAMES: VpsGame[] = [
  {
    id: 'BunvWvh9',
    name: 'Terminator 2 - Judgment Day',
    manufacturer: 'Williams',
    year: 1991,
    ipdbUrl: 'http://www.ipdb.org/machine.cgi?id=2524',
    romFiles: [{ version: 't2_l8' }],
    tableFiles: [
      vpx('zO90ygmN', ['Bigus1', 'Hanibal', '32assassin', 'Tipoto'], '3.0', true),
      vpx('3a3JZPkj', ['G5k', 'VPW'], '1.25'),
      vpx('t2-1.1d', ['Ejse83', 'G5k', 'VPW'], '1.1d', true),
      vpx('t2-1.0', ['Sixtoe', 'G5k', 'VPW'], '1.0', true),
    ],
  },
  { id: 'gyhULWKc', name: "JP's Terminator 2", manufacturer: 'Original', year: 2020, romFiles: [{ version: 't2_l8' }], tableFiles: [vpx('jpt2', ['JPSalas'], '1.0')] },
  { id: 'Iwa8DTGr', name: 'The Terminator', manufacturer: 'Original', year: 2019, tableFiles: [vpx('term', ['Ivantba', 'Lodger'], '1.0')] },
  {
    id: 'aT_GONvw',
    name: 'The Addams Family',
    manufacturer: 'Bally',
    year: 1992,
    romFiles: [{ version: 'taf_l7' }],
    tableFiles: [vpx('taf-vpw', ['G5k', '3rdAxis', 'SliderPoint', 'VPW'], '2.4.41'), vpx('taf-bigus', ['Bigus1', 'SliderPoint'], '3.0', true)],
  },
  { id: '9Paf7-CL', name: 'Attack from Mars', manufacturer: 'Bally', year: 1995, romFiles: [{ version: 'afm_113b' }], tableFiles: [vpx('afm', ['JPSalas', 'Arngrim'], '6.0.0')] },
  { id: 'lkSumsrF', name: 'Indiana Jones - The Pinball Adventure', manufacturer: 'Williams', year: 1993, romFiles: [{ version: 'ij_l7' }], tableFiles: [vpx('ij', ['VPW'], '1.1')] },
  { id: 'NqaGRv8k', name: 'Indiana Jones', manufacturer: 'Stern', year: 2008, romFiles: [{ version: 'ij4_210' }], tableFiles: [vpx('ij4', ['Hanibal', 'Glxb', 'Highlnder00', 'GTXJoe'], '2.6', true)] },
  { id: 'ON5FmcPI', name: 'Star Wars', manufacturer: 'Data East', year: 1992, romFiles: [{ version: 'stwr_107' }], tableFiles: [vpx('sw-vpw', ['VPW'], '1.2.2'), vpx('sw-2', ['Bigus1'], '4', true)] },
  { id: '5RKcbqT2', name: 'Star Wars', manufacturer: 'Sonic', year: 1987, romFiles: [{ version: 'sonstwar' }], tableFiles: [vpx('sw-sonic', ['Hmueck'], '1.1')] },
  { id: '0wPuijKc', name: 'Doctor Who', manufacturer: 'Bally', year: 1992, romFiles: [{ version: 'dw_l2' }], tableFiles: [vpx('dw', ['Sixtoe'], '1.0.0')] },
  { id: '8ND2ag4u', name: 'Black Knight 2000', manufacturer: 'Williams', year: 1989, romFiles: [{ version: 'bk2k_l4' }], tableFiles: [vpx('bk2k', ['Flupper'], '2.0')] },
  { id: 'GsTo4kGh', name: 'Black Knight', manufacturer: 'Williams', year: 1980, romFiles: [{ version: 'bk_l4' }], tableFiles: [vpx('bk', ['Bord'], '3.0')] },
  { id: 'O1-qbuxg', name: 'Funhouse', manufacturer: 'Williams', year: 1990, romFiles: [{ version: 'fh_l9' }], tableFiles: [vpx('fh', ['Fidiko'], '1.0.0')] },
  { id: 'CIyg-Fkr', name: 'Jurassic Park Pinball', manufacturer: 'Zen Studios', year: 2018, tableFiles: [{ id: 'zen', tableFormat: 'FX3' }] },
  { id: 'i47o-Nvr', name: 'Jurassic Park', manufacturer: 'Data East', year: 1993, romFiles: [{ version: 'jupk_513' }], tableFiles: [vpx('jp', ['VPW', 'Flux'], '1.0')] },
];
const db = createVpsDb(GAMES);

const match = (names: string[], roms?: string[]) => matchVps(db, { names, roms });
const top = (names: string[], roms?: string[]) => match(names, roms).candidates[0];

test('VPS : nom VPUniverse à préfixe numérique, auteur et version collés', () => {
  const m = match(['1492939964_Terminator2(Williams1991)g5kv1.0.directb2s']);
  assert.equal(m.confident, true);
  assert.equal(m.candidates[0]!.game.id, 'BunvWvh9');
  assert.equal(m.candidates[0]!.score, 1);
  assert.equal(m.candidates[0]!.table?.version, '1.0');
  // Version à lettre : la recréation 1.1d de g5k.
  assert.equal(top(['1431544526_Terminator2(Williams1991)g5kv1.1d.vpx'])!.table?.id, 't2-1.1d');
});

test('VPS : titre avec article, VPW, mod et version', () => {
  const vpw = match(['Addams Family (Bally 1992) VPW v2.4.41.vpx']);
  assert.equal(vpw.confident, true);
  assert.equal(vpw.candidates[0]!.game.name, 'The Addams Family');
  assert.equal(vpw.candidates[0]!.table?.id, 'taf-vpw');
  assert.equal(top(['The Addams Family (Bally 1992) Bigus MOD 3.0.vpx'])!.table?.id, 'taf-bigus');
  assert.equal(top(['Medieval Madness (Williams 1997).vpx']), undefined, 'absent de cet extrait');
});

test('VPS : nom sans parenthèses, le titre ne se confond pas avec un titre plus court', () => {
  const m = match(['Terminator 2 VPW 1.25.vpx']);
  assert.equal(m.confident, true);
  assert.equal(m.candidates[0]!.game.id, 'BunvWvh9');
  assert.equal(m.candidates[0]!.table?.id, '3a3JZPkj');
  assert.equal(top(['AttackFromMars_1.0.vpx'])!.game.id, '9Paf7-CL');
  // « JP's » devant le titre : l'auteur, pas le jeu.
  assert.equal(top(["JP's Attack from Mars (Bally 1995) 1.0.vpx"])!.game.id, '9Paf7-CL');
});

test('VPS : même titre chez deux fabricants, l’année et le fabricant tranchent', () => {
  const stern = match(['Indiana Jones (Stern 2008) mod 2.6.vpx']);
  assert.equal(stern.confident, true);
  assert.equal(stern.candidates[0]!.game.id, 'NqaGRv8k');
  assert.equal(stern.candidates[0]!.table?.id, 'ij4');
  assert.equal(top(['Indiana Jones (Williams 1993).vpx'])!.game.id, 'lkSumsrF');
  assert.equal(top(['Star Wars (Data East 1992) VPW 1.2.2.vpx'])!.game.id, 'ON5FmcPI');
  assert.equal(top(['Black Knight (Williams 1980).vpx'])!.game.id, 'GsTo4kGh');
  assert.equal(top(['Black Knight 2000 (Williams 1989).vpx'])!.game.id, '8ND2ag4u');
});

test('VPS : sans fabricant ni année, plusieurs propositions', () => {
  const m = match(['Star Wars.vpx']);
  assert.equal(m.confident, false);
  assert.deepEqual(m.candidates.map((c) => c.game.id).sort(), ['5RKcbqT2', 'ON5FmcPI']);
  const ij = match(['Indiana Jones.vpx']);
  assert.equal(ij.confident, false);
  assert.ok(ij.candidates.length >= 2);
});

test('VPS : la ROM du script désigne le jeu quand le nom ne dit rien', () => {
  // t2_l8 sert aussi à « JP's Terminator 2 » : deux propositions.
  const m = match(['T2_VPW.vpx'], ['t2_l8']);
  assert.equal(m.confident, false);
  assert.deepEqual(m.candidates.map((c) => c.game.id).sort(), ['BunvWvh9', 'gyhULWKc']);
  // Le nom et la ROM ensemble : sûr.
  assert.equal(match(['Terminator 2.vpx'], ['t2_l8']).confident, true);
  assert.equal(top(['DW.vpx'], ['dw_l2'])!.game.id, '0wPuijKc');
});

test('nom de fichier à édition entre parenthèses : le fabricant reste le fabricant', () => {
  assert.deepEqual(parseTableName('Yukon (Special) (Williams 1971)'), { title: 'Yukon (Special)', manufacturer: 'Williams', year: 1971, rest: undefined });
  assert.deepEqual(parseTableName('1492939964_Terminator2(Williams1991)g5kv1.0'), { title: 'Terminator2', manufacturer: 'Williams', year: 1991, rest: 'g5kv1.0' });
});

test('VPS : abréviations, orthographe et jeux absents', () => {
  assert.equal(top(['Dr. Who (Bally 1992).vpx'])!.game.id, '0wPuijKc');
  assert.equal(top(['Fun House (Williams 1990).vpx'])!.game.id, 'O1-qbuxg');
  assert.deepEqual(match(['Mon Flipper Perso.vpx']).candidates, []);
  // Un jeu qui n'existe pas en VPX passe après celui qui existe.
  assert.equal(top(['Jurassic Park.vpx'])!.game.id, 'i47o-Nvr');
});

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-vps-'));
  fs.mkdirSync(path.join(root, 'tables'));
  return root;
}

function write(file: string, content = ''): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

test('plan d’installation : le jeu VPS donne le dossier et le .info, rien ne bouge avant Installer', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const pack = path.join(root, 'import', 'Terminator 2 (Williams 1991)');
  const table = write(path.join(pack, '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx'), 'vpx');
  const b2s = write(path.join(pack, '1492939964_Terminator2(Williams1991)g5kv1.0.directb2s'), 'b2s');
  const plan = planImport([{ path: pack, mode: 'move' }], { tablesDir, vps: db });
  const t = plan.tables[0]!;
  assert.equal(t.folderName, 'Terminator 2 - Judgment Day (Williams 1991)');
  assert.equal(t.vps?.confident, true);
  assert.equal(t.vps?.fromFiles.folderName, 'Terminator 2 (Williams 1991)');
  assert.deepEqual(
    t.steps.map((s) => s.target),
    ['1431544526_Terminator2(Williams1991)g5kv1.1d.vpx', 'Terminator 2 - Judgment Day (Williams 1991).directb2s'],
  );
  assert.deepEqual(t.info.Info, {
    Title: 'Terminator 2 - Judgment Day',
    Manufacturer: 'Williams',
    Year: 1991,
    VPSId: 'BunvWvh9',
    Authors: ['Ejse83', 'G5k', 'VPW'],
    IPDBId: '2524',
  });
  // Le plan n'a rien déplacé ni créé.
  assert.ok(fs.existsSync(table) && fs.existsSync(b2s));
  assert.deepEqual(fs.readdirSync(tablesDir), []);

  applyImport(t, { trashDir: path.join(root, 'trash'), cleanupRoots: [path.join(root, 'import')] });
  const info = readInfo(path.join(tablesDir, t.folderName, `${t.folderName}.info`));
  assert.equal(info.Info?.VPSId, 'BunvWvh9');
  assert.ok(fs.existsSync(path.join(tablesDir, t.folderName, 'Terminator 2 - Judgment Day (Williams 1991).directb2s')));
});

test('plan d’installation : jeu incertain, choix parmi les propositions ou nom des fichiers', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const file = write(path.join(root, 'usb', 'Star Wars.vpx'), 'vpx');
  const plan = (choices?: Map<string, string | null>) => planImport([{ path: file, mode: 'copy' }], { tablesDir, vps: db, vpsChoices: choices }).tables[0]!;

  const pending = plan();
  assert.equal(pending.vps?.confident, false);
  assert.equal(pending.vps?.decided, false);
  assert.equal(pending.vps?.chosen, undefined);
  assert.equal(pending.folderName, 'Star Wars');
  assert.equal(pending.info.Info?.VPSId, undefined);

  const key = pending.vps!.key;
  const chosen = plan(new Map([[key, 'ON5FmcPI']]));
  assert.equal(chosen.vps?.decided, true);
  assert.equal(chosen.folderName, 'Star Wars (Data East 1992)');
  assert.equal(chosen.info.Info?.VPSId, 'ON5FmcPI');

  const kept = plan(new Map([[key, null]]));
  assert.equal(kept.vps?.decided, true);
  assert.equal(kept.folderName, 'Star Wars');
  assert.equal(kept.info.Info?.VPSId, undefined);
});

test('plan d’installation : nouvelle version d’une table installée, retrouvée par son VPSId', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, 'T2 maison');
  write(path.join(folder, 'T2.vpx'), 'vpx');
  const file = write(path.join(root, 'usb', 'Terminator 2 (Williams 1991) VPW 1.25.vpx'), 'vpx');
  const plan = planImport([{ path: file, mode: 'copy' }], {
    tablesDir,
    vps: db,
    existing: [{ folder, title: 'T2 maison', roms: [], vpsId: 'BunvWvh9' }],
  });
  assert.equal(plan.tables.length, 1);
  assert.equal(plan.tables[0]!.folder, folder);
  assert.equal(plan.tables[0]!.isNew, false);
});

test('plan d’installation sans base VPS : noms déduits des fichiers, comme avant', () => {
  const root = tmpRoot();
  const file = write(path.join(root, 'usb', '1431544526_Terminator2(Williams1991)g5kv1.1d.vpx'), 'vpx');
  const t = planImport([{ path: file, mode: 'copy' }], { tablesDir: path.join(root, 'tables') }).tables[0]!;
  assert.equal(t.folderName, 'Terminator2 (Williams 1991)');
  assert.equal(t.vps, undefined);
});

// ---------- Cache ----------

function fakeFetch(responses: Record<string, string | Error>, calls: string[]): typeof fetch {
  return (async (url: string | URL | Request) => {
    const key = String(url);
    calls.push(key);
    const body = responses[key];
    if (body instanceof Error) throw body;
    if (body === undefined) return new Response('absent', { status: 404 });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

test('base VPS : premier téléchargement, puis cache réutilisé sans réseau', async () => {
  const downloads = path.join(tmpRoot(), 'downloads');
  assert.equal(loadVpsDb(downloads), undefined);
  const calls: string[] = [];
  const now = new Date('2026-10-20T10:00:00Z');
  const responses = { [VPS_UPDATED_URL]: '1792509720957', [VPS_DB_URL]: JSON.stringify(GAMES) };
  assert.deepEqual(await refreshVpsDb(downloads, { fetch: fakeFetch(responses, calls), now }), { status: 'updated' });
  assert.deepEqual(calls, [VPS_UPDATED_URL, VPS_DB_URL]);
  const loaded = loadVpsDb(downloads)!;
  assert.equal(loaded.games.length, GAMES.length);
  assert.equal(loaded.updatedAt?.getTime(), 1792509720957);
  assert.equal(loaded.downloadedAt?.toISOString(), now.toISOString());

  // Vérifié il y a moins de 12 h : aucune requête.
  calls.length = 0;
  const later = new Date(now.getTime() + 3600_000);
  assert.deepEqual(await refreshVpsDb(downloads, { fetch: fakeFetch(responses, calls), now: later }), { status: 'fresh' });
  assert.deepEqual(calls, []);

  // Base inchangée chez VPS : seule la date est demandée.
  assert.deepEqual(await refreshVpsDb(downloads, { fetch: fakeFetch(responses, calls), now: later, force: true }), { status: 'unchanged' });
  assert.deepEqual(calls, [VPS_UPDATED_URL]);

  // Sans réseau : le cache reste tel quel.
  const offline = await refreshVpsDb(downloads, { fetch: fakeFetch({ [VPS_UPDATED_URL]: new TypeError('fetch failed') }, []), force: true });
  assert.equal(offline.status, 'offline');
  assert.equal(offline.message, 'fetch failed');
  assert.equal(loadVpsDb(downloads)!.games.length, GAMES.length);
});

test('base VPS : une réponse invalide ne remplace pas le cache', async () => {
  const downloads = path.join(tmpRoot(), 'downloads');
  const bad = await refreshVpsDb(downloads, { fetch: fakeFetch({ [VPS_UPDATED_URL]: '1', [VPS_DB_URL]: '<html>erreur</html>' }, []) });
  assert.equal(bad.status, 'offline');
  assert.equal(fs.existsSync(path.join(downloads, VPS_DB_FILE)), false);
  const notGames = await refreshVpsDb(downloads, { fetch: fakeFetch({ [VPS_UPDATED_URL]: '1', [VPS_DB_URL]: '[{"x":1}]' }, []) });
  assert.equal(notGames.status, 'offline');
  assert.equal(loadVpsDb(downloads), undefined);
});
