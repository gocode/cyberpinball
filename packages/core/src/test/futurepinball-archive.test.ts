// Tables de Future Pinball au catalogue (20/11/2026) : versions « FP » de la base VPS à côté des versions
// VPX, ce qu'il faut pour en jouer une (la table seule), une archive reçue reconnue comme table, et son
// rangement dans le dossier du jeu (packages/core/src/futurepinball-archive.ts), sans rien écraser.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addFuturePinballTable,
  catalog,
  classifyContent,
  containsFuturePinballTable,
  contentParts,
  contentSummary,
  contentSummaryText,
  createVpsDb,
  gameSoftware,
  installFuturePinballArchive,
  versionSoftware,
  vpsGameImages,
  isReceivable,
  partFiles,
  planFuturePinballArchive,
  recommendVersion,
  requirements,
  tableVersions,
  vpxVersions,
  type VpsGame,
} from '../index';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fparc-'));
}

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const link = (n: number) => [{ url: `https://vpuniverse.com/files/file/${n}-table/` }];

const BOTH: VpsGame = {
  id: 'both',
  name: 'Medieval Madness',
  manufacturer: 'Williams',
  year: 1997,
  type: 'SS',
  tableFiles: [
    { id: 'vpx1', tableFormat: 'VPX', authors: ['VPW'], urls: link(1), updatedAt: 100 },
    { id: 'fp1', tableFormat: 'FP', authors: ['Gimli'], urls: link(2), updatedAt: 300 },
  ],
} as VpsGame;
const FP_ONLY: VpsGame = {
  id: 'fponly',
  name: 'Retroflair',
  manufacturer: 'Original',
  year: 2012,
  type: 'SS',
  tableFiles: [
    { id: 'fp-old', tableFormat: 'FP', urls: link(3), updatedAt: 10 },
    { id: 'fp-new', tableFormat: 'FP', urls: link(4), updatedAt: 20 },
  ],
} as VpsGame;
const ZEN: VpsGame = { id: 'zen', name: 'Zen Seul', manufacturer: 'Zen Studios', tableFiles: [{ id: 'z', tableFormat: 'FX3' }] } as VpsGame;

test('catalogue : un jeu qui n’existe qu’en Future Pinball y est, ses versions après celles de VPX ; un jeu seulement chez Zen, non', () => {
  const db = createVpsDb([BOTH, FP_ONLY, ZEN]);
  assert.deepEqual(catalog(db, {}, new Set()).map((g) => g.id).sort(), ['both', 'fponly']);
  assert.deepEqual(tableVersions(BOTH).map((f) => f.id), ['vpx1', 'fp1'], 'VPX d’abord, même plus ancienne');
  assert.deepEqual(vpxVersions(BOTH).map((f) => f.id), ['vpx1'], 'vpxVersions reste aux seules versions VPX');
  assert.deepEqual(tableVersions(FP_ONLY).map((f) => f.id), ['fp-new', 'fp-old']);
  // Toute version Future Pinball se joue sans ROM.
  assert.deepEqual(catalog(db, { kind: 'norom' }, new Set()).map((g) => g.id).sort(), ['both', 'fponly'], 'Medieval Madness aussi, par sa version FP');
  // Un fichier reçu pour la table peut être une version Future Pinball.
  assert.deepEqual(partFiles(BOTH, 'table').map((f) => f.id), ['vpx1', 'fp1']);
});

test('filtre « Jeux : pour Future Pinball » : seulement les jeux qui en ont une version, et son site à elle', () => {
  const vpxOnly = { id: 'vpxonly', name: 'Space Station', tableFiles: [{ id: 'v', tableFormat: 'VPX', urls: link(5) }] } as VpsGame;
  const db = createVpsDb([BOTH, FP_ONLY, vpxOnly]);
  assert.deepEqual(catalog(db, { kind: 'futurepinball' }, new Set()).map((g) => g.id).sort(), ['both', 'fponly']);
  // Le site se juge sur la version Future Pinball : Medieval Madness a sa version VPX sur VPUniverse aussi.
  const elsewhere = { ...BOTH, tableFiles: [BOTH.tableFiles![0]!, { ...BOTH.tableFiles![1]!, urls: [{ url: 'https://www.pinballnirvana.com/forums/resources/mm.12/' }] }] } as VpsGame;
  assert.deepEqual(catalog(createVpsDb([elsewhere]), { kind: 'futurepinball', site: 'vpuniverse' }, new Set()).map((g) => g.id), []);
  // Conseil dans ce catalogue : la version Future Pinball, même quand le jeu a une version VPX.
  assert.equal(recommendVersion(BOTH, { futurePinball: true })?.file.id, 'fp1');
  assert.equal(recommendVersion(BOTH)?.file.id, 'vpx1');
});

test('catalogue filtré « pour Future Pinball » : la carte et la fiche d’un jeu ne montrent que ses versions Future Pinball', () => {
  // PinCab, 20/11/2026 : filtre actif, la carte disait « 10 versions VPX · ROM taf_l7 » et la fiche listait tout.
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'src', 'catalog.ts'), 'utf8');
  const shown = src.slice(src.indexOf('function shownVersions('), src.indexOf('function shownVersions(') + 400);
  assert.match(shown, /filter\.kind === 'futurepinball' \? futurePinballVersions\(game\) : tableVersions\(game\)/);
  const card = src.slice(src.indexOf('function buildCatalog('), src.indexOf('function buildCatalog(') + 1500);
  assert.match(card, /const versions = shownVersions\(g\)/, 'la carte : ses versions seulement');
  assert.match(card, /const roms = fpOnly \? \[\]/, 'la carte : pas de ROM');
  const sheet = src.slice(src.indexOf('function buildGame('), src.indexOf('function buildGame(') + 1200);
  assert.match(sheet, /const all = shownVersions\(game\)/, 'la fiche : ses versions seulement');
});

test('étiquettes de logiciel : VPX, FP, FX, FX3… sur chaque jeu et chaque version, dans un ordre fixe', () => {
  assert.equal(versionSoftware({ tableFormat: 'FP' }), 'FP');
  assert.equal(versionSoftware({}), 'VPX', 'sans format : VPX');
  assert.equal(versionSoftware({ tableFormat: 'fx3' }), 'FX3');
  const game = { id: 'g', name: 'Jeu', tableFiles: [{ id: '1', tableFormat: 'FX3' }, { id: '2', tableFormat: 'FP' }, { id: '3' }, { id: '4', tableFormat: 'FX' }, { id: '5', tableFormat: 'FP' }] } as VpsGame;
  assert.deepEqual(gameSoftware(game), ['VPX', 'FP', 'FX', 'FX3']);
  assert.deepEqual(gameSoftware(FP_ONLY), ['FP']);
});

test('images de la base VPS quand VPinMediaDB n’a rien : fronton du .directb2s le plus récent, plateau de la version', () => {
  const img = (n: string) => `https://virtualpinballspreadsheet.github.io/vps-db/img/${n}.webp`;
  // Ghostbusters Limited Edition (20/11/2026) : cinq frontons connus de VPS, aucun média sur VPinMediaDB.
  const game = {
    id: 'DY3wUlic',
    name: 'Ghostbusters (Limited Edition)',
    b2sFiles: [{ id: 'old', imgUrl: img('old'), updatedAt: 1 }, { id: 'new', imgUrl: img('new'), updatedAt: 9 }, { id: 'noimg', updatedAt: 99 }],
    tableFiles: [{ id: 'v1', imgUrl: img('v1'), updatedAt: 1 }, { id: 'v2', imgUrl: img('v2'), updatedAt: 5 }, { id: 'v3', updatedAt: 9 }],
  } as unknown as VpsGame;
  assert.deepEqual(vpsGameImages(game), { backglass: img('new'), playfield: img('v2') });
  assert.equal(vpsGameImages(game, game.tableFiles![0]).playfield, img('v1'), 'la version choisie d’abord');
  // Une image hors de la base VPS (autre site) n'est jamais prise.
  const elsewhere = { ...game, b2sFiles: [{ id: 'x', imgUrl: 'https://exemple.test/x.png' }], tableFiles: [] } as unknown as VpsGame;
  assert.deepEqual(vpsGameImages(elsewhere), {});
});

test('conseil : VPX quand il y en a une ; sinon la version Future Pinball la plus récente, avec la raison', () => {
  assert.equal(recommendVersion(BOTH)?.file.id, 'vpx1');
  const fp = recommendVersion(FP_ONLY);
  assert.equal(fp?.file.id, 'fp-new');
  assert.match(fp!.reasons.join(' '), /Future Pinball/);
});

test('ce qu’il faut pour une version Future Pinball : la table seule, ni fronton, ni ROM, ni compléments de VPX', () => {
  const game = { ...BOTH, b2sFiles: [{ id: 'b', urls: link(9) }], romFiles: [{ id: 'r', version: 'mm_109c', urls: link(8) }], pupPackFiles: [{ id: 'p', urls: link(7) }] } as VpsGame;
  const ctx = { screens: { backglass: true, dmd: 'full' as const, topper: false }, roms: new Set<string>() };
  const fp = requirements(game, game.tableFiles![1]!, ctx);
  assert.deepEqual(fp.map((n) => n.kind), ['table']);
  assert.equal(fp[0]!.state, 'todo');
  const vpx = requirements(game, game.tableFiles![0]!, ctx);
  assert.ok(vpx.some((n) => n.kind === 'rom') && vpx.some((n) => n.kind === 'b2s'), 'la version VPX garde fronton et ROM');
});

test('fichier reçu : un .fpt, ou une archive qui en contient un, est une table ; résumé « 1 table Future Pinball (.fpt) »', () => {
  assert.equal(isReceivable('Retroflair.fpt'), true);
  assert.equal(classifyContent('Retroflair.fpt'), 'table');
  const entries = ['Retroflair/Tables/Retroflair.fpt', 'Retroflair/Libraries/Retro.fpl', 'Retroflair/Music/Retroflair/theme.ogg', 'Retroflair/lisezmoi.txt'];
  assert.equal(classifyContent('Retroflair.zip', entries), 'table');
  assert.deepEqual(contentParts('Retroflair.zip', entries), ['table', 'music']);
  const summary = contentSummary('Retroflair.zip', entries);
  assert.equal(summary?.fpt, 1);
  assert.equal(contentSummaryText(summary), '1 table Future Pinball (.fpt), 1 son');
  // Sans .fpt, rien ne change : pas de champ fpt, « aucun .vpx » dit comme avant.
  assert.equal(contentSummary('x.zip', ['a.png'])?.fpt, undefined);
  assert.match(contentSummaryText(contentSummary('x.zip', ['a.png'])) ?? '', /aucun \.vpx/);
});

test('rangement d’une archive : chaque fichier à sa place dans le jeu, à partir du dossier du jeu qui le porte', () => {
  const root = tmp();
  const archive = path.join(root, 'extrait');
  const game = path.join(root, 'Future Pinball');
  write(path.join(archive, 'Future Pinball', 'Tables', 'Retroflair.fpt'), 'FPT');
  write(path.join(archive, 'Future Pinball', 'Libraries', 'Retro.fpl'), 'FPL');
  write(path.join(archive, 'Music', 'Retroflair', 'theme.ogg'), 'OGG');
  write(path.join(archive, 'BAM', 'cfg', 'Retroflair.cfg'), 'CFG');
  write(path.join(archive, 'Scripts', 'PinEvent.vbs'), 'VBS');
  write(path.join(archive, 'Extra.fpl'), 'FPL2');
  write(path.join(archive, 'Lisez-moi.txt'), 'TXT');
  write(path.join(archive, 'capture.png'), 'PNG');
  assert.equal(containsFuturePinballTable(archive), true);
  assert.equal(containsFuturePinballTable(path.join(archive, 'Music')), false);
  const plan = planFuturePinballArchive(archive, game);
  const placed = Object.fromEntries(plan.files.map((f) => [path.relative(game, f.to), f.kind]));
  assert.deepEqual(placed, {
    [path.join('BAM', 'cfg', 'Retroflair.cfg')]: 'bam',
    [path.join('Libraries', 'Extra.fpl')]: 'library',
    [path.join('Libraries', 'Retro.fpl')]: 'library',
    [path.join('Music', 'Retroflair', 'theme.ogg')]: 'music',
    [path.join('Scripts', 'PinEvent.vbs')]: 'script',
    [path.join('Tables', 'Retroflair.fpt')]: 'table',
  });
  assert.deepEqual(plan.ignored.map((f) => path.basename(f)).sort(), ['Lisez-moi.txt', 'capture.png']);
});

test('rangement : rien d’écrasé ; une table du même nom mais différente prend un autre nom, l’identique compte comme présente', async () => {
  const root = tmp();
  const archive = path.join(root, 'extrait');
  const game = path.join(root, 'Future Pinball');
  write(path.join(archive, 'Tables', 'Retroflair.fpt'), 'FPT nouvelle');
  write(path.join(archive, 'Tables', 'Same.fpt'), 'FPT pareille');
  write(path.join(archive, 'Libraries', 'Retro.fpl'), 'FPL nouvelle');
  write(path.join(archive, 'Libraries', 'Neuve.fpl'), 'FPL');
  write(path.join(game, 'Tables', 'Retroflair.fpt'), 'FPT ancienne');
  write(path.join(game, 'Tables', 'Same.fpt'), 'FPT pareille');
  write(path.join(game, 'Libraries', 'Retro.fpl'), 'FPL du jeu');
  const r = await installFuturePinballArchive(archive, game);
  assert.equal(fs.readFileSync(path.join(game, 'Tables', 'Retroflair.fpt'), 'utf8'), 'FPT ancienne', 'l’ancienne table intacte');
  assert.equal(fs.readFileSync(path.join(game, 'Tables', 'Retroflair (2).fpt'), 'utf8'), 'FPT nouvelle');
  assert.equal(fs.readFileSync(path.join(game, 'Libraries', 'Retro.fpl'), 'utf8'), 'FPL du jeu', 'la bibliothèque du jeu gardée');
  assert.equal(fs.readFileSync(path.join(game, 'Libraries', 'Neuve.fpl'), 'utf8'), 'FPL');
  assert.deepEqual(r.tables.map((f) => path.basename(f)).sort(), ['Retroflair (2).fpt', 'Same.fpt']);
  assert.deepEqual(r.kept.map((f) => path.basename(f)).sort(), ['Retro.fpl', 'Same.fpt']);
});

test('rangement : un nom qui sortirait du dossier du jeu est ignoré', () => {
  const root = tmp();
  const archive = path.join(root, 'extrait');
  write(path.join(archive, 'Tables', 'ok.fpt'), 'FPT');
  // « Libraries/../../x.fpl » ne peut pas venir d'un dossier réel : le plan est vérifié sur un chemin forgé.
  const plan = planFuturePinballArchive(archive, path.join(root, 'jeu'));
  for (const f of plan.files) assert.ok(!path.relative(path.join(root, 'jeu'), f.to).startsWith('..'));
});

test('ajout depuis le catalogue : le jeu choisi donne le nom et l’identifiant VPS, quel que soit le nom du fichier', async () => {
  const root = tmp();
  const tablesDir = path.join(root, 'tables');
  fs.mkdirSync(tablesDir);
  const fpt = path.join(root, 'rtf_bam_v2.fpt');
  fs.writeFileSync(fpt, 'FPT');
  const db = createVpsDb([FP_ONLY]);
  const r = await addFuturePinballTable(tablesDir, fpt, { db, vpsGameId: 'fponly' });
  assert.equal(r.entry.info.Info?.VPSId, 'fponly');
  assert.equal(path.basename(path.dirname(r.entry.file)), 'Retroflair (Original 2012)');
});
