// Future Pinball installé par Cyber Pinball (packages/core/src/futurepinball-managed.ts) : le dossier géré
// passe avant les emplacements habituels mais pas avant un choix à la main, la reprise d'une installation
// existante copie sans rien écraser ni toucher à la source, l'installateur n'est pas exécuté (son mode
// silencieux ne passe pas sa licence) mais extrait par innoextract après l'accord du joueur aux deux
// contrats, les fichiers du joueur ne sont jamais écrasés, et le manifeste ne livre rien (téléchargement à
// la demande, empreinte fixée).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  checkManagedFuturePinball,
  findFuturePinball,
  FUTURE_PINBALL_DEFAULT_PREFERENCES,
  FUTURE_PINBALL_EXE,
  FUTURE_PINBALL_LICENSE_RECORD,
  FUTURE_PINBALL_LICENSES,
  FUTURE_PINBALL_LICENSES_REVIEWED_FOR,
  futurePinballExtractArgs,
  layoutOf,
  licensePages,
  licenseTextHash,
  managedFuturePinballDir,
  migrateFuturePinball,
  moveExtractedFuturePinball,
  planFuturePinballMigration,
  readFuturePinballLicenseAcceptance,
  recordFuturePinballLicensesAccepted,
  writeFuturePinballConfig,
} from '../index';
import { REPO_ROOT } from './i18n-scan';

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fpm-'));
}

function put(file: string, content = 'x'): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Faux jeu : exécutable, BAM si demandé. */
function fakeGame(dir: string, bam = true): string {
  put(path.join(dir, FUTURE_PINBALL_EXE));
  if (bam) put(path.join(dir, 'BAM', 'FPLoader.exe'));
  return dir;
}

test('dossier géré : <racine>\\emulators\\futurepinball', () => {
  const root = tmp();
  assert.equal(managedFuturePinballDir(root), path.join(layoutOf(root).emulators, 'futurepinball'));
});

test('détection : choisi à la main, puis dossier géré, puis emplacements habituels', () => {
  const root = tmp();
  const managed = fakeGame(managedFuturePinballDir(root));
  const usual = fakeGame(path.join(root, 'Future Pinball'));
  const chosen = fakeGame(path.join(root, 'ailleurs'), false);
  const data = path.join(root, 'data');

  // Installation existante seule : utilisée telle quelle.
  assert.equal(findFuturePinball({ managedDir: path.join(root, 'absent'), candidates: [usual] })?.source, 'found');
  // Le dossier géré prime sur l'existante, BAM compris.
  const found = findFuturePinball({ managedDir: managed, candidates: [usual] });
  assert.equal(found?.gameDir, managed);
  assert.equal(found?.source, 'managed');
  assert.equal(found?.loader, path.join(managed, 'BAM', 'FPLoader.exe'));
  // Dossier géré pas installé : rien de perdu, l'existante reste détectée.
  assert.equal(findFuturePinball({ managedDir: path.join(root, 'vide'), candidates: [usual] })?.gameDir, usual);
  // Un dossier choisi à la main reste le choix du joueur.
  writeFuturePinballConfig(data, path.join(chosen, FUTURE_PINBALL_EXE));
  assert.equal(findFuturePinball({ dataDir: data, managedDir: managed, candidates: [usual] })?.gameDir, chosen);
  // Rien nulle part.
  assert.equal(findFuturePinball({ managedDir: path.join(root, 'vide'), candidates: [path.join(root, 'rien')] }), undefined);
});

test('contrôle de l’installation : le jeu et BAM', () => {
  const root = tmp();
  assert.deepEqual(checkManagedFuturePinball(path.join(root, 'absent')), { ok: false, bam: false, missing: ['Future Pinball.exe', path.join('BAM', 'FPLoader.exe')] });
  assert.deepEqual(checkManagedFuturePinball(fakeGame(path.join(root, 'a'), false)), { ok: true, bam: false, missing: [path.join('BAM', 'FPLoader.exe')] });
  assert.deepEqual(checkManagedFuturePinball(fakeGame(path.join(root, 'b'))), { ok: true, bam: true, missing: [] });
});

test('extraction : innoextract lit l’installateur sans l’exécuter (son mode silencieux ne passe pas la licence)', () => {
  const args = futurePinballExtractArgs('C:\\CyberPinball\\downloads\\FP-BAM-setup.exe', 'C:\\CyberPinball\\downloads\\future-pinball-extraction');
  assert.deepEqual(args, ['--extract', '--silent', '--no-warn-unused', '--output-dir', 'C:\\CyberPinball\\downloads\\future-pinball-extraction', 'C:\\CyberPinball\\downloads\\FP-BAM-setup.exe']);
  // Aucun paramètre de l'installateur lui-même.
  assert.ok(!args.some((a) => /^\/(VERYSILENT|SILENT|DIR|LOG|LOADINF)/i.test(a)));
});

test('pose des fichiers extraits : le programme est remplacé, les fichiers du joueur jamais écrasés', async () => {
  const root = tmp();
  const staging = path.join(root, 'app');
  const to = path.join(root, 'gere');
  put(path.join(staging, 'Future Pinball.exe'), 'neuf');
  put(path.join(staging, 'BAM', 'FPLoader.exe'), 'neuf');
  put(path.join(staging, 'BAM', 'License.txt'), 'contrat');
  put(path.join(staging, 'BAM', 'cfg', 'defaut.cfg'), 'defaut');
  put(path.join(staging, 'Tables', 'Demo.fpt'), 'demo');
  put(path.join(staging, 'Libraries', 'fpModels.fpl'), 'neuf');
  put(path.join(staging, 'Help', 'aide.chm'), 'neuf');
  // Installation précédente, abîmée, avec les tables et réglages du joueur.
  put(path.join(to, 'Future Pinball.exe'), 'ancien');
  put(path.join(to, 'Tables', 'Demo.fpt'), 'retouchee par le joueur');
  put(path.join(to, 'Libraries', 'fpModels.fpl'), 'du joueur');
  put(path.join(to, 'BAM', 'cfg', 'defaut.cfg'), 'reglage du joueur');
  put(path.join(to, 'Tables', 'Perso.fpt'), 'perso');

  const moved = await moveExtractedFuturePinball(staging, to);
  assert.equal(fs.readFileSync(path.join(to, 'Future Pinball.exe'), 'utf8'), 'neuf', 'le programme est remplacé : une réparation remet l’original');
  assert.equal(fs.readFileSync(path.join(to, 'BAM', 'License.txt'), 'utf8'), 'contrat', 'le contrat de BAM est posé tel quel');
  assert.equal(fs.readFileSync(path.join(to, 'Help', 'aide.chm'), 'utf8'), 'neuf');
  assert.equal(fs.readFileSync(path.join(to, 'Tables', 'Demo.fpt'), 'utf8'), 'retouchee par le joueur');
  assert.equal(fs.readFileSync(path.join(to, 'Libraries', 'fpModels.fpl'), 'utf8'), 'du joueur');
  assert.equal(fs.readFileSync(path.join(to, 'BAM', 'cfg', 'defaut.cfg'), 'utf8'), 'reglage du joueur');
  assert.equal(fs.readFileSync(path.join(to, 'Tables', 'Perso.fpt'), 'utf8'), 'perso');
  assert.deepEqual(moved, { placed: 4, kept: 3 });
  // Ce qui n'a pas été posé reste dans l'extraction ; dans une installation neuve, les tables et bibliothèques d'exemple sont posées.
  const fresh = path.join(root, 'neuf');
  assert.deepEqual(await moveExtractedFuturePinball(staging, fresh), { placed: 3, kept: 0 });
  assert.equal(fs.readFileSync(path.join(fresh, 'Tables', 'Demo.fpt'), 'utf8'), 'demo');
});

test('préférences d’une installation neuve : les six valeurs relevées, dans les deux clés du jeu', () => {
  assert.deepEqual(
    FUTURE_PINBALL_DEFAULT_PREFERENCES.map((p) => `${p.key.split('\\').pop()}\\${p.name}=${p.value}`),
    ['Editor\\LoadImagesIntoEditor=0', 'Editor\\NumberShapePoints=0', 'Editor\\PolygonInfo=0', 'GamePlayer\\BallDirt=1', 'GamePlayer\\CpuAffinity=0', 'GamePlayer\\ModelRenderQuality=2'],
  );
  assert.ok(FUTURE_PINBALL_DEFAULT_PREFERENCES.every((p) => p.key.startsWith('Software\\Future Pinball\\')), 'HKCU seulement, jamais HKLM');
});

test('seedFuturePinballPreferences : écrit ce qui manque, jamais par-dessus une valeur existante', () => {
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'futurepinball-registry.js')) as {
    seedFuturePinballPreferences(
      read: (key: string, name: string) => unknown,
      write: (key: string, name: string, value: number) => void,
    ): { written: string[]; present: string[]; failed: { name: string; reason: string }[] };
  };
  const store = new Map<string, number>([['Software\\Future Pinball\\GamePlayer\\BallDirt', 0]]);
  const refused = 'Software\\Future Pinball\\Editor\\PolygonInfo';
  const done = app.seedFuturePinballPreferences(
    (key, name) => store.get(`${key}\\${name}`),
    (key, name, value) => {
      if (`${key}\\${name}` === refused) throw new Error('accès refusé');
      store.set(`${key}\\${name}`, value);
    },
  );
  assert.equal(store.get('Software\\Future Pinball\\GamePlayer\\BallDirt'), 0, 'le réglage du joueur est gardé');
  assert.equal(store.get('Software\\Future Pinball\\GamePlayer\\ModelRenderQuality'), 2);
  assert.deepEqual(done.present, ['GamePlayer\\BallDirt = 1']);
  assert.equal(done.written.length, 4);
  assert.deepEqual(done.failed, [{ name: 'Editor\\PolygonInfo = 0', reason: 'accès refusé' }]);
});

test('contrats : montrés en entier, découpés en pages sans rien perdre ni couper un paragraphe', () => {
  for (const license of FUTURE_PINBALL_LICENSES) {
    const pages = licensePages(license.paragraphs);
    assert.deepEqual(pages.flat(), license.paragraphs, `${license.id} : tous les paragraphes, dans l'ordre`);
    assert.ok(pages.length >= 1);
  }
  assert.deepEqual(licensePages(['a'.repeat(900), 'b'.repeat(900), 'c'], 1500), [['a'.repeat(900)], ['b'.repeat(900), 'c']]);
  assert.deepEqual(licensePages(['x'.repeat(5000)], 1500), [['x'.repeat(5000)]], 'un paragraphe plus long que la limite a sa page, entier');
  assert.deepEqual(licensePages([]), []);
});

test('contrats : le texte des deux auteurs, relu pour CET installateur', () => {
  assert.deepEqual(FUTURE_PINBALL_LICENSES.map((l) => l.id), ['future-pinball', 'bam']);
  const eula = FUTURE_PINBALL_LICENSES[0]!.paragraphs.join('\n');
  assert.match(eula, /End User License Agreement for Future Pinball/);
  assert.match(eula, /each copy shall be a true and complete copy/);
  assert.match(eula, /shall not be for commercial purposes/);
  assert.match(eula, /reverse engineer, decompile, or disassemble/);
  const bam = FUTURE_PINBALL_LICENSES[1]!.paragraphs.join('\n');
  assert.match(bam, /Rafal Janicki/);
  assert.match(bam, /All file's provided MUST remain unchanged and in full/);
  assert.match(bam, /You may not "bundle" ANY of said AUTHOR's products/);
  assert.equal(licenseTextHash(FUTURE_PINBALL_LICENSES[0]!.paragraphs), '0a472bf8f1c6475b8b5d578760a571f33781775a278e0ce19bb28350ee91872b');
  assert.equal(licenseTextHash(FUTURE_PINBALL_LICENSES[1]!.paragraphs), '5efc44da476dd2e22786ad5131bbc87b7647eba587d327e25c5e752f82743402');
  // Les contrats ont été relus pour l'installateur du manifeste : un autre installateur, un autre contrat à relire.
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'installer', 'components.json'), 'utf8').replace(/^\uFEFF/, '')) as { components: Record<string, unknown>[] };
  assert.equal(manifest.components.find((c) => c.id === 'future-pinball')?.sha256, FUTURE_PINBALL_LICENSES_REVIEWED_FOR, 'installateur changé : relire les deux contrats (futurepinball-licenses.ts)');
});

test('accord aux contrats : gardé à côté du jeu, avec l’installateur et l’empreinte de chaque texte', () => {
  const dir = path.join(tmp(), 'futurepinball');
  assert.equal(readFuturePinballLicenseAcceptance(dir), undefined);
  const record = recordFuturePinballLicensesAccepted(dir, { sha256: 'abc', version: '1.9.1' }, FUTURE_PINBALL_LICENSES, new Date('2026-11-24T10:00:00Z'));
  assert.equal(record.acceptedAt, '2026-11-24T10:00:00.000Z');
  assert.deepEqual(record.licenses.map((l) => l.id), ['future-pinball', 'bam']);
  assert.deepEqual(readFuturePinballLicenseAcceptance(dir), record);
  assert.ok(fs.existsSync(path.join(dir, FUTURE_PINBALL_LICENSE_RECORD)));
  fs.writeFileSync(path.join(dir, FUTURE_PINBALL_LICENSE_RECORD), '{ pas du json');
  assert.equal(readFuturePinballLicenseAcceptance(dir), undefined, 'un fichier abîmé vaut pas d’accord');
});

test('le téléchargement ne lance jamais l’installateur : extraction, jamais d’exécution ni de demande d’administrateur', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'futurepinball-install.ts'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /startElevated|elevation|execFile\(\s*download\.installer|\/VERYSILENT/, 'l’installateur n’est pas exécuté');
  const ui = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'futurepinball-ui.ts'), 'utf8');
  // L'extraction n'est lancée que par « J'accepte », jamais par le téléchargement ni par un autre écran.
  assert.equal((ui.match(/extractManagedFuturePinball\(/g) ?? []).length, 1);
  assert.equal((ui.match(/extract_\(\)/g) ?? []).length, 2, 'définition et unique appel : le bouton « J’accepte les deux contrats »');
  assert.match(ui, /contract:accept[\s\S]{0,60}run: \(\) => void extract_\(\)/);
});

test('reprise d’une installation existante : plan chiffré, copie sans écrasement, source intacte', async () => {
  const root = tmp();
  const from = fakeGame(path.join(root, 'ancien'));
  const to = fakeGame(path.join(root, 'gere'));
  put(path.join(from, 'Tables', 'A.fpt'), 'aaaa');
  put(path.join(from, 'Tables', 'sous', 'B.fpt'), 'bb');
  put(path.join(from, 'Libraries', 'l.fpl'), 'l');
  put(path.join(from, 'Tables', 'C.fpt'), 'ancien');
  put(path.join(to, 'Tables', 'C.fpt'), 'nouveau');
  // BAM et l'exécutable ne sont pas repris : ils viennent de l'installateur.
  put(path.join(from, 'BAM', 'config.ini'), 'ini');

  const plan = planFuturePinballMigration(from, to);
  assert.equal(plan.files, 3);
  assert.equal(plan.bytes, 4 + 2 + 1);
  assert.deepEqual(plan.folders.map((f) => [f.folder, f.files.length, f.present]), [['Tables', 2, 1], ['Libraries', 1, 0]].sort((a, b) => ['Tables', 'Libraries'].indexOf(String(a[0])) - ['Tables', 'Libraries'].indexOf(String(b[0]))));
  // Le plan n'écrit rien.
  assert.equal(fs.existsSync(path.join(to, 'Tables', 'A.fpt')), false);

  const seen: number[] = [];
  assert.equal(await migrateFuturePinball(plan, (done) => seen.push(done)), 3);
  assert.deepEqual(seen, [1, 2, 3]);
  assert.equal(fs.readFileSync(path.join(to, 'Tables', 'A.fpt'), 'utf8'), 'aaaa');
  assert.equal(fs.readFileSync(path.join(to, 'Tables', 'sous', 'B.fpt'), 'utf8'), 'bb');
  assert.equal(fs.readFileSync(path.join(to, 'Libraries', 'l.fpl'), 'utf8'), 'l');
  assert.equal(fs.readFileSync(path.join(to, 'Tables', 'C.fpt'), 'utf8'), 'nouveau', 'un fichier déjà là n’est pas écrasé');
  assert.equal(fs.existsSync(path.join(to, 'BAM', 'config.ini')), false);
  // Source intacte.
  assert.equal(fs.readFileSync(path.join(from, 'Tables', 'A.fpt'), 'utf8'), 'aaaa');
  assert.equal(fs.readFileSync(path.join(from, 'Tables', 'C.fpt'), 'utf8'), 'ancien');
  // Rien de plus à reprendre une fois copié.
  assert.equal(planFuturePinballMigration(from, to).files, 0);
  // Source et destination identiques : rien.
  assert.equal(planFuturePinballMigration(from, from).files, 0);
});

test('manifeste : Future Pinball et BAM ne sont ni livrés ni installés d’office, empreinte fixée', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'installer', 'components.json'), 'utf8').replace(/^\uFEFF/, '')) as { components: Record<string, unknown>[] };
  const fp = manifest.components.find((c) => c.id === 'future-pinball');
  assert.ok(fp, 'composant future-pinball');
  assert.equal(fp.distribution, 'on-demand', 'jamais livré avec le paquet ni installé sans demande');
  assert.match(String(fp.url), /^https:\/\//);
  assert.match(String(fp.sha256), /^[0-9a-f]{64}$/);
  assert.ok(Number(fp.size) > 1e6);
  assert.equal(fp.installDir, 'emulators/futurepinball');
  assert.equal(fp.installArguments, undefined, 'l’installateur n’est pas exécuté : plus de paramètres de mode silencieux');
  assert.match(String(fp.license), /contrat/i, 'la licence dit que deux contrats sont montrés et acceptés');
  // L'outil qui l'ouvre : innoextract, à la demande lui aussi, empreinte fixée, extrait de son archive officielle.
  const tool = manifest.components.find((c) => c.id === 'innoextract');
  assert.ok(tool, 'composant innoextract');
  assert.equal(tool.kind, 'tool');
  assert.equal(tool.distribution, 'on-demand');
  assert.match(String(tool.url), /^https:\/\/constexpr\.org\/innoextract\/files\//);
  assert.match(String(tool.sha256), /^[0-9a-f]{64}$/);
  assert.equal(tool.executable, 'innoextract.exe');
  assert.match(String(tool.license), /zlib/);
});
