// Runtime Visual C++ de VPX (packages/core/src/vc-runtime.ts, app/src/vc-runtime.ts). Constat :
// freeimage64.dll et SDL364.dll, chargés au démarrage de VPX 10.8.1, et la plupart de ses
// plugins importent vcruntime140.dll, vcruntime140_1.dll et msvcp140.dll, que l'archive de VPX ne
// contient pas : sur un Windows neuf, VPX ne démarre pas (0xC0000135). Invariants : la version de VPX
// du manifeste déclare le runtime dont elle a besoin, l'installateur de Microsoft du manifeste est assez
// récent, et les fichiers d'un VPX installé ne demandent rien d'autre à Windows.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { resolveLocations } from '../locations';
import { compareVersions, diagnoseVpxFailure, isRedistributableDll, peFileVersion, peImports, peLinkerVersion, vcRuntimeStatus, VC_RUNTIME_DLLS, vpxMissingLibrary, vpxRuntimeNeeds, type PeFile } from '../index';

interface Entry {
  id: string;
  kind: string;
  version: string;
  installDir: string;
  url: string;
  sha256: string;
  signer?: string;
  requires?: string[];
  vcRuntime?: string;
  installArguments?: string[];
  executablePattern: string;
}
const manifest = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'installer', 'components.json'), 'utf8')) as { components: Entry[] }).components;

test('lecture d’un exécutable Windows : DLL importées, éditeur de liens, version du fichier', { skip: process.platform !== 'win32' && 'exécutable Windows seulement' }, () => {
  const node = fs.readFileSync(process.execPath);
  assert.ok(peImports(node).includes('kernel32.dll'));
  assert.match(peLinkerVersion(node)!, /^\d+\.\d{2}$/);
  // node.exe porte sa propre version (22.11.0 -> 22.11.0.0).
  assert.ok(peFileVersion(node)!.startsWith(process.versions.node.split('.').slice(0, 2).join('.')), peFileVersion(node));
  // Ce qui n'est pas un exécutable ne fait rien dire.
  assert.deepEqual(peImports(Buffer.from('pas un exécutable')), []);
  assert.equal(peFileVersion(Buffer.alloc(0)), undefined);
  assert.equal(peLinkerVersion(Buffer.alloc(512)), undefined);
});

test('runtime de Windows : absent, trop ancien ou suffisant', () => {
  const all = (v: string | undefined) => Object.fromEntries(VC_RUNTIME_DLLS.map((d) => [d, v]));
  assert.deepEqual(vcRuntimeStatus(all(undefined), '14.51'), { ok: false, required: '14.51', missing: [...VC_RUNTIME_DLLS], older: [] });
  // Un runtime de 2019 (14.29) ne suffit pas à un VPX compilé en 14.51.
  const old = vcRuntimeStatus(all('14.29.30139.0'), '14.51');
  assert.equal(old.ok, false);
  assert.deepEqual(old.older.map((o) => o.dll), [...VC_RUNTIME_DLLS]);
  assert.equal(vcRuntimeStatus(all('14.51.36247.0'), '14.51').ok, true);
  assert.equal(vcRuntimeStatus(all('14.52.37029.0'), '14.51').ok, true);
  // Une seule DLL manquante suffit à empêcher VPX de démarrer.
  assert.deepEqual(vcRuntimeStatus({ ...all('14.52.0.0'), 'vcruntime140_1.dll': undefined }, '14.51').missing, ['vcruntime140_1.dll']);
});

test('bibliothèques qu’un Windows neuf ne fournit pas', () => {
  for (const dll of ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll', 'msvcp140_atomic_wait.dll', 'msvcp140d.dll', 'msvcr120.dll', 'vcomp140.dll', 'mfc140u.dll', 'd3dx9_43.dll', 'd3dcompiler_43.dll', 'xinput1_3.dll', 'openal32.dll', 'ucrtbased.dll']) {
    assert.equal(isRedistributableDll(dll), true, dll);
  }
  for (const dll of ['kernel32.dll', 'hid.dll', 'ucrtbase.dll', 'd3dcompiler_47.dll', 'xinput1_4.dll', 'api-ms-win-crt-runtime-l1-1-0.dll', 'msvcrt.dll', 'opengl32.dll', 'd3d11.dll']) {
    assert.equal(isRedistributableDll(dll), false, dll);
  }
});

test('manifeste : VPX déclare son runtime, et l’installateur de Microsoft le couvre', () => {
  const redist = manifest.find((c) => c.id === 'vc-redist-x64');
  assert.ok(redist, 'composant vc-redist-x64 absent du manifeste');
  assert.equal(redist.kind, 'runtime');
  assert.match(redist.signer!, /^CN=Microsoft Corporation, O=Microsoft Corporation,/);
  assert.match(redist.url, /^https:\/\/download\.visualstudio\.microsoft\.com\/.+\/VC_redist\.x64\.exe$/);
  assert.match(redist.sha256, /^[0-9a-f]{64}$/);
  assert.ok(new RegExp(redist.executablePattern).test(path.basename(new URL(redist.url).pathname)));
  // Sans fenêtre et sans redémarrage imposé : l'installation se fait derrière le menu plein écran.
  for (const arg of ['/install', '/quiet', '/norestart']) assert.ok(redist.installArguments?.includes(arg), arg);
  for (const vpx of manifest.filter((c) => c.id === 'vpx')) {
    assert.ok(vpx.vcRuntime, `VPX ${vpx.version} : vcRuntime manque`);
    assert.ok(vpx.requires?.includes('vc-redist-x64'), `VPX ${vpx.version} : requires sans vc-redist-x64`);
    assert.ok(compareVersions(redist.version, vpx.vcRuntime) >= 0, `VPX ${vpx.version} demande ${vpx.vcRuntime}, l’installateur fournit ${redist.version}`);
  }
});

test('VPX arrêté faute d’une DLL : l’écran le nomme et dit où réparer', () => {
  assert.equal(vpxMissingLibrary(3221225781), true); // 0xC0000135, rendu non signé par Node
  assert.equal(vpxMissingLibrary(-1073741515), true); // le même, signé
  assert.equal(vpxMissingLibrary(0xc0000139), true);
  assert.equal(vpxMissingLibrary(0xc0000374), false);
  assert.equal(vpxMissingLibrary(null), false);
  const d = diagnoseVpxFailure([], 0xc0000135, 'Table.vpx')!;
  assert.match(d.title, /bibliothèque/);
  assert.ok(d.lines.some((l) => l.includes('0xC0000135')));
  assert.ok(d.lines.some((l) => l.includes('Santé de la borne') && l.includes('Visual C++')));
  // Jamais « rien ne manque pour jouer » : ici, justement, il manque quelque chose.
  assert.ok(!d.lines.some((l) => l.includes('Rien ne manque')));
});

/** Dossier de la version de VPX du manifeste, installée à la racine de Cyber Pinball (CYBERPINBALL_VPX_DIR sinon). */
function installedVpx(): { dir: string; entry: Entry } | undefined {
  const entry = manifest.find((c) => c.id === 'vpx')!;
  const dir = process.env.CYBERPINBALL_VPX_DIR ?? (resolveLocations(process.env).root ? path.join(resolveLocations(process.env).root!, ...entry.installDir.split('/'), entry.version) : undefined);
  return dir && fs.existsSync(dir) ? { dir, entry } : undefined;
}
const vpx = process.platform === 'win32' ? installedVpx() : undefined;

test('fichiers du VPX installé : seul le runtime Visual C++ manque à Windows, et le manifeste en note la bonne version', { skip: vpx ? false : 'aucun VPX de la version du manifeste sur ce poste' }, () => {
  const { dir, entry } = vpx!;
  const names = (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(dll|exe)$/i.test(f));
  function* files(): Generator<PeFile> {
    for (const name of names) yield { path: name, buf: fs.readFileSync(path.join(dir, name)) };
  }
  const needs = vpxRuntimeNeeds(files(), names);
  // Une autre bibliothèque de redistribuable (DirectX d'origine, OpenAL…) demanderait son propre installateur.
  assert.deepEqual(needs.unknown, []);
  // VPinballX lui-même n'en dépend pas, mais ce qu'il charge au démarrage, si.
  assert.ok(needs.importers.some((f) => /^(freeimage64|SDL364)\.dll$/i.test(f)), needs.importers.join(', '));
  assert.ok(needs.vcRuntime);
  assert.ok(compareVersions(entry.vcRuntime!, needs.vcRuntime) >= 0, `les fichiers de VPX ${entry.version} demandent le runtime ${needs.vcRuntime}, le manifeste note ${entry.vcRuntime}`);
});
