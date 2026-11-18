// Rapports de plantage du 17/11/2026. Borne A (Demolition Man deux fois, Diablo) : VPX s'arrêtait 0,2 s
// après chaque lancement, avant d'écrire son journal ; entre deux démarrages, la bibliothèque SDL de son
// dossier était passée de 3.4.14 à 3.2.18 (un autre VPX copié par-dessus le nôtre), et la fiche disait
// toujours « VPX 10.8.1-5436 ». Le vpinball.log joint était celui de la partie d'avant. Borne B (World Cup
// Soccer) : VPX planté en se fermant ; son crash.txt, qui nomme le module fautif, ne partait pas.
// Invariants : les fichiers de VPX se comparent à ceux de son archive et se remettent ; Cyber Pinball
// lance toujours son exécutable ; un arrêt avant le journal se nomme « en démarrant », toutes tables ;
// le rapport joint crash.txt et ne fait jamais passer le journal d'une autre partie pour celui du plantage.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnoseVpxFailure, techBlocks, vpxLines, type TechFacts } from '../index';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

type Component = { id: string; kind: string; distribution: string; version: string; name: string; url: string; sha256: string; size: number; executable?: string; executablePattern: string; files?: Record<string, number> };
const installer = require(path.join(REPO_ROOT, 'packages', 'installer', 'dist', 'index.js')) as {
  loadManifest(): Component[];
  checkComponentFiles(dir: string, c: Pick<Component, 'files' | 'executable' | 'executablePattern'>): { changed: { file: string; expected: number; actual?: number }[]; foreignExecutables: string[] } | undefined;
  restoreComponentFiles(dir: string, c: Component, files: readonly string[], downloads: string): Promise<void>;
};
const fsutil = require(path.join(REPO_ROOT, 'packages', 'installer', 'dist', 'fsutil.js')) as { findExecutable(dir: string, pattern: string, preferred?: string): string | undefined };
const evidence = require(path.join(REPO_ROOT, 'app', 'dist', 'launch-evidence.js')) as {
  rememberLaunch(r: { ok: boolean; logWritten?: boolean; crashReport?: string }, table: string, changed?: readonly string[]): void;
  lastFailedLaunch(): { logWritten?: boolean; crashReport?: string; changedFiles?: string[] } | undefined;
  launchAttachments(log: string): { name: string; text: string; kind: string }[];
};
const launcher = require(path.join(REPO_ROOT, 'app', 'dist', 'launcher.js')) as { logWrittenSince(dir: string, since: number): boolean };

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-fichiers-'));
}

function write(dir: string, rel: string, bytes: number): void {
  const file = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(bytes, 7));
}

const PATTERN = '^VPinballX.*64\\.exe$';
const FILES = { 'VPinballX_BGFX64.exe': 40, 'SDL364.dll': 30, 'plugins/dof/plugin-dof64.dll': 20 };

test('manifeste : chaque VPX installable décrit les fichiers de son archive, son exécutable compris', () => {
  const vpx = installer.loadManifest().filter((c) => c.id === 'vpx' && c.distribution === 'automatic');
  assert.ok(vpx.length);
  for (const c of vpx) {
    assert.ok(c.files && Object.keys(c.files).length > 10, `${c.version} : « files » à remplir par node scripts/composant-fichiers.mjs <archive>`);
    assert.ok(c.executable && c.files[c.executable], `${c.version} : l'exécutable ${c.executable} manque à « files »`);
    assert.ok(c.files['SDL364.dll'], `${c.version} : SDL364.dll, chargée par VPX au démarrage, est décrite`);
    for (const [f, n] of Object.entries(c.files)) assert.ok(/\.(exe|dll)$/i.test(f) && !f.includes('\\') && Number.isInteger(n) && n > 0, f);
  }
});

test('règle : un fichier de VPX remplacé ou absent se voit, un exécutable étranger aussi', () => {
  const dir = tempDir();
  try {
    const component = { files: FILES, executable: 'VPinballX_BGFX64.exe', executablePattern: PATTERN };
    for (const [f, n] of Object.entries(FILES)) write(dir, f, n);
    assert.deepEqual(installer.checkComponentFiles(dir, component), { changed: [], foreignExecutables: [] });
    // Un autre VPX copié par-dessus : sa SDL (autre taille), son exécutable à lui ; un plugin retiré.
    write(dir, 'SDL364.dll', 31);
    write(dir, 'VPinballX64.exe', 50);
    fs.rmSync(path.join(dir, 'plugins', 'dof', 'plugin-dof64.dll'));
    assert.deepEqual(installer.checkComponentFiles(dir, component), {
      changed: [
        { file: 'SDL364.dll', expected: 30, actual: 31 },
        { file: 'plugins/dof/plugin-dof64.dll', expected: 20 },
      ],
      foreignExecutables: ['VPinballX64.exe'],
    });
    // Rien d'affirmé pour une version que le manifeste ne décrit pas.
    assert.equal(installer.checkComponentFiles(dir, { executablePattern: PATTERN }), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('règle : Cyber Pinball lance l’exécutable du manifeste, jamais un autre VPX posé à côté', () => {
  const dir = tempDir();
  try {
    write(dir, 'VPinballX_BGFX64.exe', 1);
    write(dir, 'VPinballX64.exe', 1); // passe devant dans l'ordre alphabétique (« 6 » avant « _ »)
    assert.equal(path.basename(fsutil.findExecutable(dir, PATTERN, 'VPinballX_BGFX64.exe')!), 'VPinballX_BGFX64.exe');
    // Sans nom préféré, ou nom absent : le premier qui répond au motif, comme avant.
    assert.equal(path.basename(fsutil.findExecutable(dir, PATTERN, 'VPinballX_GL64.exe')!), 'VPinballX64.exe');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('remise : seuls les fichiers changés sont tirés de l’archive vérifiée, le reste du dossier est gardé', async () => {
  const root = tempDir();
  try {
    const source = path.join(root, 'source');
    for (const [f, n] of Object.entries(FILES)) write(source, f, n);
    const downloads = path.join(root, 'downloads');
    fs.mkdirSync(downloads);
    const archive = path.join(downloads, 'vpx-essai.zip');
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(tar, ['-a', '-cf', archive, '-C', source, ...Object.keys(FILES)], { stdio: 'ignore', windowsHide: true });
    const bytes = fs.readFileSync(archive);
    const component: Component = { id: 'vpx', kind: 'emulator', distribution: 'automatic', name: 'VPX', version: '0.0.0-essai', url: 'https://example.com/vpx-essai.zip', sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, executable: 'VPinballX_BGFX64.exe', executablePattern: PATTERN, files: FILES };
    const installed = path.join(root, 'vpx');
    for (const [f, n] of Object.entries(FILES)) write(installed, f, n);
    write(installed, 'SDL364.dll', 99);
    write(installed, 'User/VPReg.stg', 5);
    await installer.restoreComponentFiles(installed, component, ['SDL364.dll', 'inconnu.dll'], downloads);
    assert.deepEqual(installer.checkComponentFiles(installed, component)!.changed, []);
    assert.ok(fs.existsSync(path.join(installed, 'User', 'VPReg.stg')), 'les fichiers du joueur restent');
    assert.ok(!fs.existsSync(`${installed}.remise`), 'le dossier de travail est retiré');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('règle : VPX arrêté avant d’écrire son journal s’est arrêté en démarrant ; la panne est celle de VPX', () => {
  const access = 0xc0000005;
  const early = diagnoseVpxFailure([], access, 'Diablo Pinball v4.3.vbs', undefined, { logWritten: false, changedFiles: ['SDL364.dll 3.2.18.0'] })!;
  assert.equal(early.startup, true);
  assert.equal(early.title, 'VPX s’est arrêté en démarrant');
  assert.match(early.lines.join('\n'), /SDL364\.dll 3\.2\.18\.0.*Start : remettre/s);
  assert.match(early.journal, /avant son journal.*fichiers de VPX modifiés : SDL364\.dll/);
  // Sans fichier modifié, il renvoie à la Santé de la borne.
  assert.match(diagnoseVpxFailure([], access, 'x.vpx', undefined, { logWritten: false })!.lines.join('\n'), /Santé de la borne/);
  // Journal écrit, ou inconnu (partie simulée) : jamais « en démarrant ».
  assert.notEqual(diagnoseVpxFailure([], access, 'x.vpx', undefined, { logWritten: true })!.startup, true);
  assert.notEqual(diagnoseVpxFailure([], access, 'x.vpx')!.startup, true);
  // Une bibliothèque manquante garde son propre écran (runtime Visual C++).
  assert.equal(diagnoseVpxFailure([], 0xc0000135, 'x.vpx', undefined, { logWritten: false })!.title, 'Il manque une bibliothèque à VPX');
});

test('lanceur : un journal plus ancien que le lancement n’est pas le sien', () => {
  const dir = tempDir();
  try {
    const log = path.join(dir, 'vpinball.log');
    assert.equal(launcher.logWrittenSince(dir, Date.now()), false, 'pas de journal du tout');
    fs.writeFileSync(log, 'partie précédente\n');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(log, old, old);
    assert.equal(launcher.logWrittenSince(dir, Date.now()), false);
    fs.writeFileSync(log, 'ce lancement\n');
    assert.equal(launcher.logWrittenSince(dir, Date.now() - 5000), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rapport : le crash.txt de VPX part, et le journal d’une autre partie est nommé comme tel', () => {
  evidence.rememberLaunch({ ok: false, logWritten: false, crashReport: 'Reason: access violation\nplugin-dof64.dll' }, 'World Cup Soccer', ['SDL364.dll 3.2.18.0']);
  assert.deepEqual(evidence.launchAttachments('2026-11-17 17:58 …').map((a) => [a.name, a.kind]), [
    ['crash.txt', 'crash'],
    ['vpinball-partie-precedente.log', 'previous-log'],
  ]);
  assert.deepEqual(evidence.lastFailedLaunch()!.changedFiles, ['SDL364.dll 3.2.18.0']);
  // Journal écrit pendant le lancement : il garde son nom.
  evidence.rememberLaunch({ ok: false, logWritten: true }, 'World Cup Soccer');
  assert.deepEqual(evidence.launchAttachments('…').map((a) => a.name), ['vpinball.log']);
  // Une partie réussie efface les pièces de l'échec.
  evidence.rememberLaunch({ ok: false, logWritten: true, crashReport: 'x' }, 'A');
  evidence.rememberLaunch({ ok: true }, 'B');
  assert.equal(evidence.lastFailedLaunch(), undefined);
  assert.deepEqual(evidence.launchAttachments('…').map((a) => a.name), ['vpinball.log']);
});

test('Santé et fiche technique : des fichiers de VPX modifiés se disent, avec la remise des originaux', () => {
  const lines = vpxLines({ installed: '10.8.1-5436', known: '10.8.1-5436', runtime: { ok: true }, changedFiles: ['SDL364.dll 3.2.18.0', 'VPinballX_BGFX64.exe 10.8.0.2051'] });
  assert.deepEqual(lines.map((l) => [l.state, l.target.kind, l.go]), [['check', 'install-vpx', 'Remettre les fichiers d’origine']]);
  assert.match(lines[0]!.detail!, /SDL364\.dll 3\.2\.18\.0/);
  const facts = { at: new Date().toISOString(), software: { vpx: { version: '10.8.1-5436', known: '10.8.1-5436', changedFiles: ['SDL364.dll 3.2.18.0'] }, plugins: [] } } as unknown as TechFacts;
  const software = techBlocks(facts).find((b) => b.id === 'software')!;
  assert.ok(software.notes.some((n) => /modifiés hors de Cyber Pinball/.test(n.title)));
});

test('branchements : l’écran d’échec reçoit les fichiers modifiés, Start les remet, le rapport joint crash.txt', () => {
  const frontend = frontendSource();
  assert.match(frontend, /result\.logWritten === false \? vpxChangedFiles\(loc\)/);
  assert.match(frontend, /rememberLaunch\(result, table\.title, changedFiles\)/);
  assert.match(frontend, /vpxFilesStatus\(loc\)\?\.changed\.length\) \{[\s\S]{0,200}restoreVpxFiles\(/);
  assert.match(frontend, /startup \? 'demarrage' : table\.id/);
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.match(library, /launchAttachments\(logText/);
});
