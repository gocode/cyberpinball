// Future Pinball installé par Cyber Pinball (packages/core/src/futurepinball-managed.ts) : le dossier géré
// passe avant les emplacements habituels mais pas avant un choix à la main, la reprise d'une installation
// existante copie sans rien écraser ni toucher à la source, l'installateur est lancé sans fenêtre dans le
// dossier géré, et le manifeste ne livre rien (téléchargement à la demande, empreinte fixée).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  checkManagedFuturePinball,
  findFuturePinball,
  FUTURE_PINBALL_EXE,
  futurePinballInstallerArgs,
  layoutOf,
  managedFuturePinballDir,
  migrateFuturePinball,
  planFuturePinballMigration,
  writeFuturePinballConfig,
} from '../index';

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

test('installateur : sans fenêtre, dans le dossier géré, avec un journal', () => {
  const args = futurePinballInstallerArgs(['/VERYSILENT', '/NORESTART'], 'C:\\CyberPinball\\emulators\\futurepinball', 'C:\\CyberPinball\\downloads\\f.log');
  assert.deepEqual(args, ['/VERYSILENT', '/NORESTART', '/DIR=C:\\CyberPinball\\emulators\\futurepinball', '/LOG=C:\\CyberPinball\\downloads\\f.log']);
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
  assert.ok((fp.installArguments as string[]).includes('/VERYSILENT'));
  assert.match(String(fp.license), /redistribution/i, 'la licence dit ce qu’on sait de la redistribution');
});
