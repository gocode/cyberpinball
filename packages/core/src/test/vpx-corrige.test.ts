// VPX corrigé (20/11/2026) : la 5436 présentait le backglass à chaque image du playfield, et un écran annexe à 50 ou
// 60 Hz calait toute la partie sur sa fréquence (rapports AE5_oja0iY et LLvRT2ian0). Cyber Pinball livre l'exécutable
// de la 5436 reconstruit avec le correctif de VPX (packages/vpx-corrige) et le pose avant chaque partie.
// Invariants : posé seulement sur la 5436, jamais sur un autre VPX ; pas recopié s'il est déjà là ; l'officiel gardé à
// côté et remis dès qu'une version ne livre plus le corrigé (retour arrière sans téléchargement) ; la vérification des
// fichiers de VPX ne le prend pas pour une modification, mais voit toujours un autre exécutable ; la fabrication le
// livre avec son correctif et son LISEZMOI (GPL) ; le correctif reste celui qui bride les fenêtres annexes.
// Série 3 (21/11/2026, The Matrix) : le plugin PuP corrigé est posé de même, et son correctif décode sans le verrou.
// Série 6 (23/11/2026, bornes à DudesCab) : la bibliothèque DOF (dof64.dll, libdof corrigée) est posée de même.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { techBlocks, type TechFacts } from '../index';
import { REPO_ROOT } from './i18n-scan';

const corrige = require(path.join(REPO_ROOT, 'app', 'dist', 'vpx-corrige.js')) as {
  VPX_CORRIGE_VERSION: string;
  installVpxCorrige(vpxDir: string, version: string | undefined, appDir: string): string;
  vpxCorrigeSizes(appDir: string, version: string | undefined): Record<string, number>;
};
const installer = require(path.join(REPO_ROOT, 'packages', 'installer', 'dist', 'index.js')) as {
  checkComponentFiles(dir: string, c: { files?: Record<string, number>; executable?: string; executablePattern: string }, accepted?: Record<string, number>): { changed: { file: string }[] } | undefined;
};

const PUP = path.join('plugins', 'pup', 'plugin-pup64.dll');

/**
 * Un dossier d'application avec son VPX corrigé (natif\vpx-corrige : exécutable, et plugin PuP sauf `exeOnly`, comme
 * une version de la série 1), et un dossier de VPX aux fichiers officiels.
 */
function setup(exeOnly = false): { root: string; app: string; vpx: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-corrige-'));
  const app = path.join(root, 'app');
  fs.mkdirSync(path.join(app, 'natif', 'vpx-corrige', 'plugins', 'pup'), { recursive: true });
  fs.writeFileSync(path.join(app, 'natif', 'vpx-corrige', 'VPinballX_BGFX64.exe'), Buffer.alloc(50, 2));
  if (!exeOnly) fs.writeFileSync(path.join(app, 'natif', 'vpx-corrige', PUP), Buffer.alloc(30, 4));
  const vpx = path.join(root, 'vpx');
  fs.mkdirSync(path.join(vpx, 'plugins', 'pup'), { recursive: true });
  fs.writeFileSync(path.join(vpx, 'VPinballX_BGFX64.exe'), Buffer.alloc(40, 1));
  fs.writeFileSync(path.join(vpx, PUP), Buffer.alloc(20, 5));
  return { root, app, vpx };
}

test('posé sur la 5436 une fois, jamais sur un autre VPX', () => {
  const { root, app, vpx } = setup();
  try {
    assert.equal(corrige.installVpxCorrige(vpx, '10.9.0-6948', app), 'other-version');
    assert.equal(corrige.installVpxCorrige(vpx, undefined, app), 'other-version');
    assert.equal(fs.statSync(path.join(vpx, 'VPinballX_BGFX64.exe')).size, 40, 'un autre VPX garde son exécutable');
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'installed');
    assert.deepEqual(fs.readFileSync(path.join(vpx, 'VPinballX_BGFX64.exe')), Buffer.alloc(50, 2));
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'up-to-date');
    assert.deepEqual(fs.readdirSync(vpx).sort(), ['VPinballX_BGFX64.exe', 'VPinballX_BGFX64.exe.officiel', 'plugins'], 'l’officiel gardé à côté, aucun fichier de passage laissé');
    assert.deepEqual(fs.readFileSync(path.join(vpx, 'VPinballX_BGFX64.exe.officiel')), Buffer.alloc(40, 1));
    // Le plugin PuP corrigé (série 3) : posé de même, l'officiel gardé à côté.
    assert.deepEqual(fs.readFileSync(path.join(vpx, PUP)), Buffer.alloc(30, 4));
    assert.deepEqual(fs.readdirSync(path.join(vpx, 'plugins', 'pup')).sort(), ['plugin-pup64.dll', 'plugin-pup64.dll.officiel']);
    // Retour arrière : une version de Cyber Pinball sans corrigé remet les officiels, sans téléchargement.
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, path.join(root, 'sans')), 'restored');
    assert.deepEqual(fs.readFileSync(path.join(vpx, 'VPinballX_BGFX64.exe')), Buffer.alloc(40, 1));
    assert.deepEqual(fs.readFileSync(path.join(vpx, PUP)), Buffer.alloc(20, 5));
    assert.deepEqual(fs.readdirSync(vpx).sort(), ['VPinballX_BGFX64.exe', 'plugins']);
    assert.deepEqual(fs.readdirSync(path.join(vpx, 'plugins', 'pup')), ['plugin-pup64.dll']);
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, path.join(root, 'sans')), 'missing', 'ensuite, plus rien à faire');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('une version qui ne livre plus le plugin PuP corrigé remet l’officiel, et garde l’exécutable corrigé', () => {
  const { root, app, vpx } = setup();
  try {
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'installed');
    fs.rmSync(path.join(app, 'natif', 'vpx-corrige', PUP));
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'restored');
    assert.deepEqual(fs.readFileSync(path.join(vpx, PUP)), Buffer.alloc(20, 5));
    assert.deepEqual(fs.readFileSync(path.join(vpx, 'VPinballX_BGFX64.exe')), Buffer.alloc(50, 2));
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'up-to-date');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // Corrigé de la série 1 (exécutable seul) : le plugin PuP officiel n'est pas touché.
  const old = setup(true);
  try {
    assert.equal(corrige.installVpxCorrige(old.vpx, corrige.VPX_CORRIGE_VERSION, old.app), 'installed');
    assert.deepEqual(fs.readdirSync(path.join(old.vpx, 'plugins', 'pup')), ['plugin-pup64.dll']);
  } finally {
    fs.rmSync(old.root, { recursive: true, force: true });
  }
});

test('fiche technique : « patched Cyber Pinball N » quand tout le corrigé est en place, en anglais dans toutes les langues', () => {
  const { root, app, vpx } = setup();
  try {
    const inPlace = (corrige as unknown as { vpxCorrigeInPlace(d: string, v: string | undefined, a: string): number | undefined }).vpxCorrigeInPlace;
    const patch = (corrige as unknown as { VPX_CORRIGE_PATCH: number }).VPX_CORRIGE_PATCH;
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), undefined, 'officiel en place');
    corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app);
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), patch);
    assert.equal(inPlace(vpx, '10.9.0-6948', app), undefined);
    fs.writeFileSync(path.join(vpx, PUP), Buffer.alloc(20, 5));
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), undefined, 'plugin PuP officiel remis : la série n’est pas en place');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const software = techBlocks({ software: { vpx: { version: '10.8.1-5436', known: '10.8.1-5436', patch: 1 } } } as TechFacts).find((b) => b.id === 'software')!;
  assert.ok(JSON.stringify(software).includes('10.8.1-5436 patched Cyber Pinball 1'));
  const official = techBlocks({ software: { vpx: { version: '10.8.1-5436', known: '10.8.1-5436' } } } as TechFacts).find((b) => b.id === 'software')!;
  assert.ok(!JSON.stringify(official).includes('patched'));
});

test('posé dès le démarrage, avant le premier relevé de la fiche ; fiche relevée de nouveau après une partie qui l’a posé', () => {
  // Rapport du 21/11/2026 : fiche relevée au démarrage (13:01), corrigé posé au premier lancement (13:02) ; la fiche du
  // rapport disait VPX officiel et gardait l'alerte du fronton.
  const { root, app, vpx } = setup();
  try {
    const atStartup = (corrige as unknown as { installVpxCorrigeAtStartup(v: { exe: string; version: string } | undefined, a: string): string | undefined }).installVpxCorrigeAtStartup;
    assert.equal(atStartup(undefined, app), undefined, 'VPX pas installé : rien');
    assert.equal(atStartup({ exe: path.join(vpx, 'VPinballX_BGFX64.exe'), version: corrige.VPX_CORRIGE_VERSION }, app), 'installed');
    assert.equal(atStartup({ exe: path.join(vpx, 'VPinballX_BGFX64.exe'), version: corrige.VPX_CORRIGE_VERSION }, app), 'up-to-date');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const startup = frontend.indexOf('installVpxCorrigeAtStartup(vpxInstall(loc)');
  assert.ok(startup > 0 && startup < frontend.indexOf('library.watchHealth('), 'posé avant le premier relevé (25 s après le démarrage)');
  assert.match(frontend, /if \(corrige === 'installed' \|\| corrige === 'restored'\) library\.techFactsChanged\(\);/);
  const sheet = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'tech-sheet.ts'), 'utf8');
  assert.match(sheet, /function stalled\(\)[\s\S]*?if \(isQuiet\(\)\) return;[\s\S]*?void refresh\(\);/, 'nouveau relevé dès la fin de la partie, jamais pendant');
});

test('vérification des fichiers de VPX : le corrigé est admis, un autre exécutable reste signalé', () => {
  const { root, app, vpx } = setup();
  try {
    const component = { files: { 'VPinballX_BGFX64.exe': 40, 'plugins/pup/plugin-pup64.dll': 20 }, executable: 'VPinballX_BGFX64.exe', executablePattern: '^VPinballX.*64\\.exe$' };
    corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app);
    const accepted = corrige.vpxCorrigeSizes(app, corrige.VPX_CORRIGE_VERSION);
    assert.deepEqual(installer.checkComponentFiles(vpx, component, accepted)!.changed, []);
    assert.equal(installer.checkComponentFiles(vpx, component)!.changed.length, 2, 'sans lui, les tailles diffèrent');
    assert.deepEqual(corrige.vpxCorrigeSizes(app, '10.9.0-6948'), {}, 'rien d’admis pour une autre version');
    fs.writeFileSync(path.join(vpx, 'VPinballX_BGFX64.exe'), Buffer.alloc(33, 3));
    assert.equal(installer.checkComponentFiles(vpx, component, accepted)!.changed.length, 1, 'un exécutable étranger reste vu');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('le correctif livré bride bien chaque fenêtre annexe à son écran, et la fabrication le joint au binaire', () => {
  const diff = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs', '01-cadence-fenetres-annexes.patch'), 'utf8');
  assert.match(diff, /\+\s+if \(output\.GetMode\(\) == VPX::RenderOutput::OM_WINDOW\)/);
  assert.match(diff, /GetRefreshRate\(\)/);
  assert.match(diff, /m_ancillaryWndNextRenderTime/);
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  const fabriquer = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fabriquer.mjs'), 'utf8');
  assert.match(fabriquer, /natif', 'vpx-corrige'/);
  assert.match(fabriquer, /'LISEZMOI\.md', 'README\.md'/);
  assert.match(fabriquer, /correctifs/);
  assert.match(fabriquer, /'LICENSE'/, 'la licence de VPX voyage avec le binaire');
  // Sources complètes (licences de VPX) : la publication ne part pas sans elles, le LISEZMOI livré donne leur adresse.
  const publier = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'publier.mjs'), 'utf8');
  assert.match(publier, /ensureVpxCorrigeSources\(\{ repository, token \}\)\.catch\(\(error\) => fail\(/);
  const recette = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige.mjs'), 'utf8');
  const patch = /patch: (\d+) \}/.exec(recette)?.[1];
  assert.ok(patch, 'numéro de la série de correctifs lisible dans la recette');
  assert.equal(String((corrige as unknown as { VPX_CORRIGE_PATCH: number }).VPX_CORRIGE_PATCH), patch, 'l’application annonce la série de correctifs qu’elle livre');
  const lisezmoi = ['LISEZMOI.md', 'README.md'].map((f) => fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', f), 'utf8')).join('\n');
  assert.equal(lisezmoi.split(`releases/tag/sources-vpx-10.8.1-5436-patched-cyberpinball-${patch}`).length - 1, 2, 'le LISEZMOI (FR et EN) mène aux sources de cette série de correctifs');
  assert.equal(lisezmoi.split(`af26b2d93-patched-cyberpinball-${patch}`).length - 1, 2, 'le nom affiché par VPX, en anglais, dit dans les deux langues');
  assert.match(patch === undefined ? '' : fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs', '01-cadence-fenetres-annexes.patch'), 'utf8'), /Cyber Pinball, \d{4}-\d{2}-\d{2}/, 'le code modifié dit qui l’a modifié, et quand (GPL)');
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /installVpxCorrige\(path\.dirname\(install\.exe\), install\.version/, 'posé avant chaque partie, avec la version du VPX lancé');
});

test('correctif 07 (série 8), plugin PuP amont bdbccaf30 sur l’interface de la 5436, et la fabrication livre le plugin', () => {
  // Novembre 2026 : PuP-Packs aux vidéos qui ne finissent pas, file bloquée, musique absente, sons superposés. Le plugin
  // de la 5436 n'avançait les médias qu'au dessin de leur écran ; celui de VPX au commit bdbccaf30 les tient à jour seul.
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs');
  assert.ok(!fs.existsSync(path.join(dir, '03-pup-label-sans-verrou.patch')), 'le correctif 03 est dans le plugin amont');
  const diff = fs.readFileSync(path.join(dir, '07-pup-amont-bdbccaf30.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 8\)/, 'le code modifié dit qui l’a modifié, et quand (GPL)');
  // Les autres plugins viennent de l'archive officielle : les en-têtes de l'interface de la 5436 ne changent pas.
  const touched = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]!);
  assert.deepEqual(touched.filter((f) => f.startsWith('plugins/plugins/')), ['plugins/plugins/PluginStrings.h'], 'seul un en-tête nouveau s’ajoute');
  assert.ok(touched.every((f) => f.startsWith('plugins/pup/') || f.startsWith('plugins/plugins/') || f === 'make/CMakeLists_plugin_PUP.txt'), 'rien d’autre que le plugin PuP');
  for (const f of ['plugins/pup/PUPSound.cpp', 'plugins/pup/Compat5436.h']) assert.ok(touched.includes(f), f);
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  assert.match(added, /void PUPManager::Tick\(\)\n\+\{\n\+.*GetGameTime\(\).*\n\+.*m_screenMap\)\n\+\s+screen->Update\(gameTime\);\n\+\s+RunLater\(0\.05/, 'médias tenus à jour sur une horloge, même sur un écran jamais dessiné');
  assert.match(added, /std::async\(std::launch::async, \[this, type = m_type, path = m_szPath[^\n]*\n\+\s+return UpdateImageTexture/, 'label décodé sans garder son verrou (ancien correctif 03)');
  assert.doesNotMatch(added, /#include "(plugins\/PagedUIPlugin|DMDOverlay\/)/, 'pas d’interface absente de la 5436');
  const fabriquer = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fabriquer.mjs'), 'utf8');
  assert.match(fabriquer, /'plugins', 'pup', VPX_CORRIGE_PUP/, 'le plugin PuP corrigé part avec l’application');
  const recette = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige.mjs'), 'utf8');
  assert.match(recette, /'--target', 'vpinball', 'PUPPlugin'/);
  const sources = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige-sources.mjs'), 'utf8');
  for (const lib of ['SDL_image-', 'SDL_ttf-', 'FFmpeg-', 'libdmdutil-', 'libpupdmd-']) assert.ok(sources.includes(`'${lib}'`), `sources complètes : ${lib}`);
  assert.deepEqual((corrige as unknown as { VPX_CORRIGE_FILES: string[] }).VPX_CORRIGE_FILES.slice(0, 2), ['VPinballX_BGFX64.exe', 'plugins/pup/plugin-pup64.dll']);
});

test('correctif 08 (série 8) : playlistadd sur une playlist déjà déclarée la met à jour, comme PinUP Player', () => {
  // PinCab, 26/11/2026 : Stranger Things 4 déclare toutes ses playlists avec 30 s de repos et les remet à 0 par son
  // script ; le plugin ignorait l'appel (« Playlist already exists ») et sautait annonces et sons pendant 30 s.
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs');
  const diff = fs.readFileSync(path.join(dir, '08-pup-playlistadd-met-a-jour.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 8\)/);
  const touched = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]!);
  assert.ok(touched.every((f) => f.startsWith('plugins/pup/')), 'rien d’autre que le plugin PuP');
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
  assert.match(added, /pExisting->SetRandomize\(sort != 0\);\n\+\s+pExisting->SetRestSeconds\(restSeconds\);/, 'ordre et repos mis à jour');
  assert.doesNotMatch(added, /Playlist already exists/, 'l’appel n’est plus ignoré');
  // Appliqué après le 07, dont il modifie le code : l'ordre alphabétique des correctifs est celui de la recette.
  assert.ok(fs.readdirSync(dir).filter((f) => f.endsWith('.patch')).sort().indexOf('08-pup-playlistadd-met-a-jour.patch') > fs.readdirSync(dir).filter((f) => f.endsWith('.patch')).sort().indexOf('07-pup-amont-bdbccaf30.patch'));
});

test('correctif 09 (série 9) : une exception de libpupdmd sur PupCapture ne termine plus VPX', () => {
  // PinCab, 26/11/2026 : The Avengers Pro (avs_170) livre PupCapture/12341241234.bmp ; libpupdmd lit ce numéro avec
  // std::stoi, qui lève out_of_range sur un fil du plugin : VPX s'arrêtait en 0xC0000409 (plugin-pup64+0x7c4f5) à la
  // première image du DMD. Toute exception de la lecture est attrapée, et la lecture reprise sur les captures lisibles.
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs');
  const diff = fs.readFileSync(path.join(dir, '09-pup-pupcapture-sans-plantage.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 9\)/);
  const touched = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]!);
  assert.deepEqual(touched, ['plugins/pup/PUPManager.cpp'], 'rien d’autre que le plugin PuP');
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
  // Chaque appel de Load est dans un try, et toute exception (de la bibliothèque standard ou non) est attrapée.
  const loads = [...added.matchAll(/m_dmd->Load\(/g)].length;
  assert.equal(loads, 2, 'la lecture du pack, puis celle des captures lisibles');
  // Le code tel qu'il est après le correctif (contexte et ajouts) : une accolade peut être une ligne de contexte.
  const after = diff.split('\n').filter((l) => /^[ +]/.test(l) && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
  assert.match(after, /try\s*\{\s*m_dmd = newDmd\(\);\s*m_dmdTriggerDataLoaded = m_dmd->Load\([^;]*;\s*\}\s*catch \(const std::exception& e\)\s*\{[^}]*\}\s*catch \(\.\.\.\)/, 'la lecture du pack');
  assert.match(after, /try\s*\{[^}]*ReadableCaptureCopy\([^}]*m_dmd->Load\([^}]*\}\s*catch \(\.\.\.\)/, 'la lecture des captures lisibles');
  // Les captures gardées sont celles que libpupdmd sait lire : même motif, numéro dans un int, nom dans la page de code.
  assert.match(added, /std::regex pattern\(R"\(\(\\d\+\)\\\.bmp\)", std::regex_constants::icase\)/);
  assert.match(added, /digits\.size\(\) > 10 \|\| \(digits\.size\(\) == 10 && digits > "2147483647"\)/);
  assert.match(added, /entry\.path\(\)\.filename\(\)\.string\(\)/);
  assert.match(added, /temp_directory_path\(ec\)/, 'la copie va dans le dossier temporaire, jamais dans le pack du joueur');
  assert.doesNotMatch(added, /remove_all\(capture|remove\(entry/, 'aucune capture du pack n’est supprimée');
  const sorted = fs.readdirSync(dir).filter((f) => f.endsWith('.patch')).sort();
  assert.ok(sorted.indexOf('09-pup-pupcapture-sans-plantage.patch') > sorted.indexOf('07-pup-amont-bdbccaf30.patch'), 'appliqué après le 07, dont il modifie le code');
});

test('correctifs 10 et 11 (série 10) : le coût de chaque image va au journal, une ligne par seconde, sans rien changer au jeu', () => {
  // Fluidité en partie, 28/11/2026 : pour savoir pourquoi une partie descend sous la fréquence de l'écran, VPX écrit
  // chaque seconde ce que coûtent les vidéos PuP (« PuP live »), le fil logique (« Logic live ») et le fil de rendu
  // (« Render live »), y compris pour les seules images en retard. Diagnostic pur : aucun réglage ni rendu modifié.
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs');
  const attendus: Record<string, { files: string[]; lines: RegExp[] }> = {
    '10-pup-cout-au-journal.patch': { files: ['plugins/pup/PUPMediaPlayer.cpp'], lines: [/PuP live/] },
    '11-images-par-etape-au-journal.patch': {
      files: ['src/core/player.cpp', 'src/renderer/RenderDevice.cpp'],
      lines: [/"Logic live: frames=\{\} late=\{\}/, /"Render live: frames=\{\} late=\{\} gpu=/],
    },
  };
  for (const [name, { files, lines }] of Object.entries(attendus)) {
    const diff = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(diff, /\r/, `${name} : fins de ligne LF, comme les sources de VPX`);
    assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 10\)/, name);
    const touched = [...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]!);
    assert.deepEqual(touched, files, `${name} : rien d'autre que ces fichiers`);
    const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
    if (name.startsWith('11-')) assert.deepEqual(removed, [], `${name} : aucune ligne de VPX retirée, le correctif ne fait qu'ajouter des relevés`);
    for (const line of lines) assert.match(diff, line, name);
  }
  // Le 10 ne retire que les deux envois d'image au GPU, remplacés par un seul envoi chronométré, au même format.
  const pup = fs.readFileSync(path.join(dir, '10-pup-cout-au-journal.patch'), 'utf8');
  const pupRemoved = pup.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  assert.equal(pupRemoved.length, 2);
  for (const l of pupRemoved) assert.match(l, /^-\s+UpdateTexture\(.*VPXTEXFMT_sRGBA8, \w+(\.\w+)*->data\[0\]\);$/);
  assert.match(pup, /^\+\s+UpdateTexture\(texture, width, height, VPXTextureFormat::VPXTEXFMT_sRGBA8, image\);$/m, 'même envoi, même format : la vidéo n’est pas dégradée');
  // Une ligne par seconde au plus : le journal d'une longue partie reste lisible et l'écriture ne coûte rien.
  const logique = fs.readFileSync(path.join(dir, '11-images-par-etape-au-journal.patch'), 'utf8');
  assert.equal([...logique.matchAll(/< 1000000ull\)/g)].length, 2, 'le fil logique et le fil de rendu écrivent au plus une fois par seconde');
});

test('la série livrée est celle du correctif le plus récent', () => {
  // Le journal de VPX, ses rapports et l'adresse des sources publiées disent la série : un nouveau correctif la fait monter.
  // Tous les dossiers de correctifs comptent (VPX, libdof, bgfx) : la série 11 ne touche que bgfx.
  const root = path.join(REPO_ROOT, 'packages', 'vpx-corrige');
  const dirs = fs.readdirSync(root).filter((d) => /^correctifs(-|$)/.test(d)).map((d) => path.join(root, d));
  assert.ok(dirs.length >= 3, 'correctifs, correctifs-libdof, correctifs-bgfx');
  const series = dirs.flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.patch'))
    .flatMap((f) => [...fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/patched Cyber Pinball (\d+)\)/g)].map((m) => Number(m[1]))));
  assert.ok(series.length, 'les correctifs disent leur série');
  assert.equal(Math.max(...series), (corrige as unknown as { VPX_CORRIGE_PATCH: number }).VPX_CORRIGE_PATCH);
});

test('série 11, bgfx : au moins trois tampons pour les fenêtres annexes, rien d’autre ne change', () => {
  // Fluidité en partie, 28/11/2026 (Back to the Future et son PuP-Pack, playfield 120 Hz, écrans annexes 60 Hz) : avec
  // deux tampons, l'image d'une fenêtre annexe attendait que son écran plus lent libère le tampon affiché, et bloquait
  // toute la file de la carte graphique : 9 % d'images du playfield en retard, 1 % avec trois tampons.
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs-bgfx');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['01-fenetres-annexes-trois-tampons.patch']);
  const diff = fs.readFileSync(path.join(dir, '01-fenetres-annexes-trois-tampons.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de bgfx');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 11\)/, 'le code modifié dit qui l’a modifié, et quand');
  assert.deepEqual([...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]), ['src/renderer_d3d11.cpp']);
  const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  assert.deepEqual(removed, [], 'rien de bgfx retiré');
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++') && !/^\+\s*(\/\/.*)?$/.test(l));
  // Seulement le nombre de tampons, seulement en mode flip, jamais diminué : ni le format, ni la synchronisation, ni le
  // swapchain principal (dont le nombre de tampons vient de VPX) ne bougent.
  assert.deepEqual(added.map((l) => l.trim()), [
    '+\t\tif (DXGI_SWAP_EFFECT_FLIP_DISCARD == scd.swapEffect || DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL == scd.swapEffect)'.trim(),
    '+\t\t{'.trim(),
    '+\t\t\tscd.bufferCount = bx::max<uint32_t>(scd.bufferCount, 3);'.trim(),
    '+\t\t}'.trim(),
  ]);
  assert.match(diff, /^@@ .* @@ namespace bgfx \{ namespace d3d11\n \t\tscd\.ndt {8}= NULL;\n \t\tscd\.sampleDesc = s_msaa\[0\];$/m, 'dans FrameBufferD3D11::create (fenêtres annexes), après la copie de la description du swapchain principal');

  // La recette applique les correctifs au fork, avant la compilation, et le repère de bgfx porte leur empreinte.
  const recette = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige.mjs'), 'utf8');
  assert.match(recette, /dependency\('bgfx', `\$\{deps\.bgfxCmake\}-\$\{deps\.bgfx\}-\$\{bgfxPatches\.key\}`/);
  assert.match(recette, /for \(const p of bgfxPatches\.patches\) run\('git', \['apply'.*BGFX_PATCHES, p\)\], fork,/);
  assert.match(recette, /LIBDOF_PATCHES, BGFX_PATCHES,/, 'les correctifs de bgfx font partie des entrées du certificat');
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fabriquer.mjs'), 'utf8'), /'correctifs-bgfx'\]/);
  assert.match(fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8'), /^packages\/vpx-corrige\/correctifs-bgfx\/\*\.patch -text$/m);
  for (const doc of ['LISEZMOI.md', 'README.md'])
    assert.ok(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', doc), 'utf8').includes('`correctifs-bgfx/`'), `${doc} décrit le correctif`);
});

test('correctif 12 (série 12) : GetRoot répond avant le choix du jeu, avec le dossier pupvideos de la table', () => {
  // Darkest Dungeon (Original 2023), 28/11/2026 : son script lit PuPlayer.GetRoot & "DarkestDungeon\ScreenType.txt" en code global.
  // Vide, la lecture échouait et le script s'arrêtait avant ses objets (« Objet requis » en boucle). PinUP Player répond
  // avec sa racine PUPVideos, séparateur final compris : sans dossier global, c'est le pupvideos à côté de la table.
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs');
  const diff = fs.readFileSync(path.join(dir, '12-pup-getroot-avant-le-jeu.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 12\)/);
  assert.deepEqual([...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]), ['plugins/pup/PUPManager.cpp', 'plugins/pup/PUPManager.h', 'plugins/pup/PUPPinDisplay.cpp']);
  assert.match(diff, /GetTablePupRoot\(\)/);
  assert.match(diff, /root \/ ""sv/, 'le séparateur final est gardé');
});

test('série 6, bibliothèque DOF : posée à côté du plugin-dof64.dll officiel, qui n’est jamais touché', () => {
  // Rapports du 19/11 et du 23/11/2026 (bornes à DudesCab) : VPX plantait en se fermant, pendant le déchargement de DOF.
  const DOF = path.join('plugins', 'dof', 'dof64.dll');
  const PLUGIN = path.join('plugins', 'dof', 'plugin-dof64.dll');
  const { root, app, vpx } = setup();
  try {
    fs.mkdirSync(path.join(app, 'natif', 'vpx-corrige', 'plugins', 'dof'), { recursive: true });
    fs.writeFileSync(path.join(app, 'natif', 'vpx-corrige', DOF), Buffer.alloc(70, 6));
    fs.mkdirSync(path.join(vpx, 'plugins', 'dof'), { recursive: true });
    fs.writeFileSync(path.join(vpx, DOF), Buffer.alloc(60, 7));
    fs.writeFileSync(path.join(vpx, PLUGIN), Buffer.alloc(10, 8));
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'installed');
    assert.deepEqual(fs.readFileSync(path.join(vpx, DOF)), Buffer.alloc(70, 6));
    assert.deepEqual(fs.readdirSync(path.join(vpx, 'plugins', 'dof')).sort(), ['dof64.dll', 'dof64.dll.officiel', 'plugin-dof64.dll']);
    assert.deepEqual(fs.readFileSync(path.join(vpx, PLUGIN)), Buffer.alloc(10, 8), 'le plugin officiel charge la libdof corrigée telle quelle');
    const inPlace = (corrige as unknown as { vpxCorrigeInPlace(d: string, v: string | undefined, a: string): number | undefined }).vpxCorrigeInPlace;
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), (corrige as unknown as { VPX_CORRIGE_PATCH: number }).VPX_CORRIGE_PATCH);
    // « Remettre les fichiers d'origine » a remis l'officielle : la série n'est plus en place, et la partie suivante la repose.
    fs.writeFileSync(path.join(vpx, DOF), Buffer.alloc(60, 7));
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), undefined);
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app), 'installed');
    assert.deepEqual(fs.readFileSync(path.join(vpx, `${DOF}.officiel`)), Buffer.alloc(60, 7));
    assert.equal(corrige.vpxCorrigeSizes(app, corrige.VPX_CORRIGE_VERSION)['plugins/dof/dof64.dll'], 70, 'la vérification des fichiers de VPX l’accepte');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('série 6 : correctifs de libdof (amont 0383246 et c79bcff), recette, fabrication, sources et diagnostic accordés', () => {
  const dir = path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs-libdof');
  const patches = fs.readdirSync(dir).sort();
  assert.deepEqual(patches, ['01-dudescab-sans-second-arret.patch', '02-fils-de-sortie-attendus.patch']);
  const diffs = patches.map((p) => fs.readFileSync(path.join(dir, p), 'utf8'));
  for (const diff of diffs) {
    assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de libdof');
    assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 6\)/, 'le code modifié dit qui l’a modifié, et quand (GPL)');
    // Le plugin-dof64.dll officiel charge dof64.dll par l'interface de DOF.h : elle ne change pas.
    assert.doesNotMatch(diff, /^diff --git a\/include\//m, 'aucun en-tête public de libdof touché');
    assert.doesNotMatch(diff, /@[a-z0-9-]+\.(com|org|net)/i, 'pas d’adresse électronique recopiée de l’amont');
  }
  const added = (diff: string, marker: string) => diff.split('\n').filter((l) => l.startsWith(marker) && !l.startsWith(marker.repeat(3))).join('\n');
  assert.match(added(diffs[0]!, '-'), /DudesCab::~DudesCab\(\) \{ Finish\(\); \}/, 'le destructeur relançait Finish');
  assert.match(added(diffs[0]!, '+'), /DudesCab::~DudesCab\(\) \{ \}/);
  assert.match(added(diffs[0]!, '-'), /m_dev->AllOff\(\);/);
  assert.doesNotMatch(added(diffs[0]!, '+'), /AllOff/, 'plus d’AllOff après la vraie fermeture');
  assert.match(added(diffs[1]!, '-'), /m_updaterThread->detach\(\);/);
  assert.match(added(diffs[1]!, '+'), /m_updaterThread->join\(\);/);
  assert.doesNotMatch(added(diffs[1]!, '+'), /detach\(\)/);

  const recette = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige.mjs'), 'utf8');
  assert.match(recette, /'--target', 'dof_shared'/);
  assert.match(recette, /replacementGaps\(path\.join\(dofDir, VPX_CORRIGE_DOF\), built\)/, 'exportations et dépendances comparées à l’officielle');
  assert.match(recette, /LIBDOF_PATCHES,/, 'les correctifs de libdof font partie des entrées du certificat');
  assert.match(recette, /path\.join\(out, 'plugins', 'dof', VPX_CORRIGE_DOF\)/, 'la DLL fait partie des sorties du certificat');
  const fabriquer = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'fabriquer.mjs'), 'utf8');
  assert.match(fabriquer, /\[VPX_CORRIGE_DOF, 'LICENSE-libdof'\]/, 'la DLL et sa licence partent avec l’application');
  assert.match(fabriquer, /\['correctifs', 'correctifs-libdof'[,\]]/);
  const sources = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige-sources.mjs'), 'utf8');
  for (const lib of ['libdof-', 'libusb-', 'libserialport-', 'hidapi-', 'libftdi-']) assert.ok(sources.includes(`'${lib}'`), `sources complètes : ${lib}`);
  assert.ok(sources.includes('plugins/dof/dof64.dll'), 'la release des sources nomme la DLL');
  assert.match(fs.readFileSync(path.join(REPO_ROOT, '.gitattributes'), 'utf8'), /^packages\/vpx-corrige\/correctifs-libdof\/\*\.patch -text$/m);

  const files = (corrige as unknown as { VPX_CORRIGE_FILES: string[] }).VPX_CORRIGE_FILES;
  assert.ok(files.includes('plugins/dof/dof64.dll'));
  assert.ok(!files.includes('plugins/dof/plugin-dof64.dll'), 'le plugin DOF reste l’officiel');
  // L'écran d'échec annonce la correction à partir de la série qui la livre : jamais d'une série pas encore livrée.
  const { DOF_UNLOAD_FIXED_IN } = require(path.join(REPO_ROOT, 'packages', 'core', 'dist', 'vpxfailure.js')) as { DOF_UNLOAD_FIXED_IN: number };
  assert.ok(DOF_UNLOAD_FIXED_IN <= (corrige as unknown as { VPX_CORRIGE_PATCH: number }).VPX_CORRIGE_PATCH);
});

test('correctif 05 : import POV sans éditeur et champs anciens vides protégés, banc natif avec conservation des réglages', () => {
  const diff = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs', '05-pov-sans-editeur.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'les correctifs natifs gardent les fins de ligne LF');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2}/);
  assert.match(diff, /\+   if \(m_vpinball\)\n\+      m_vpinball->SetPropSel/, 'le lancement direct n’a aucun éditeur');
  assert.match(diff, /\+.*Importing POV settings:/, 'le prochain rapport identifie le fichier importé');
  const bench = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'banc-vpx-pov.mjs'), 'utf8');
  for (const scenario of ['without-pov', 'named-pov', 'automatic-pov', 'empty-legacy-fields', 'invalid-legacy-fields', 'valid-legacy-fields']) assert.ok(bench.includes(scenario));
  assert.match(bench, /assert\.equal\(number\(key\), expected/, 'le banc natif vérifie aussi les réglages numériques valides');
});

test('correctif 06 : NVIDIA 3D Vision en mode direct, Direct3D 11 et plein écran exclusif, repli côte à côte', () => {
  const diff = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs', '06-nvidia-3d-vision.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  assert.match(diff, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2} \(patched Cyber Pinball 7\)/, 'le code modifié dit qui l’a modifié, et quand (GPL)');
  assert.match(diff, /\+PropBool\(Player, Stereo3DNvidiaDirect,[^\n]*, false\);/, 'désactivé par défaut : sans la clé, VPX rend comme la 5436');
  assert.match(diff, /NvAPI_Stereo_SetDriverMode/, 'mode direct demandé avant la création du device');
  assert.match(diff, /NvAPI_Stereo_SetActiveEye/, 'chaque œil présenté au pilote');
  assert.match(diff, /falling back to plain side by side rendering/, 'un échec garde une partie jouable');
  // Le front-end lit le bilan de la partie dans ces lignes (nvidia3dVisionOutcome).
  for (const line of ['direct mode requested', 'direct mode ready', 'stereo " << (activated ? "activated" : "not activated', 'stereo is disabled in the NVIDIA control panel']) assert.ok(diff.includes(line), line);
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'installer', 'vpx-settings', '10.8.1-5436.json'), 'utf8')) as { settings: { section: string; key: string }[] };
  assert.ok(schema.settings.some((s) => s.section === 'Player' && s.key === 'Stereo3DNvidiaDirect'), 'le schéma de la 5436 connaît le réglage');
});

test('construction : un dossier de sources par série de correctifs, une construction à la fois', () => {
  // 21/11/2026 : une publication groupée (série 1) et une branche (série 2) construisaient dans le même dossier de
  // sources ; chacune effaçait les sources de l'autre au milieu de sa compilation.
  const recette = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'vpx-corrige.mjs'), 'utf8');
  assert.match(recette, /path\.join\(work, `src-\$\{VPX_BASE\.patch\}`\)/);
  assert.match(recette, /path\.join\(work, `vpx-build-\$\{VPX_BASE\.patch\}`\)/);
  assert.doesNotMatch(recette, /path\.join\(work, 'src'\)|path\.join\(work, 'vpx-build'\)/, 'plus de dossier de sources commun à toutes les séries');
  assert.match(recette, /return withBuildLock\(\(\) => buildLocked\(/, 'toute construction passe par le verrou');
  assert.match(recette, /flag: 'wx'/, 'verrou pris de façon exclusive');
});

test('correctif 02 : « Fit Table » garde le haut de la table, réglages connus du schéma de la 5436 seulement', () => {
  // 21/11/2026 : sur un 16:9, « Fit Table » pouvait couper le fond du plateau (Attack from Mars : la soucoupe ; ViewSetup::SetWindowAutofit).
  const diff = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs', '02-cadrage-garde-le-haut.patch'), 'utf8');
  assert.doesNotMatch(diff, /\r/, 'fins de ligne LF, comme les sources de VPX');
  assert.match(diff, /Cyber Pinball, \d{4}-\d{2}-\d{2}/, 'le code modifié dit qui l’a modifié, et quand (GPL)');
  assert.match(diff, /\+PropBool\(Player, CabinetAutofitKeepTop,[^\n]*, false\);/, 'désactivé par défaut : sans la clé, VPX cadre comme la 5436');
  assert.match(diff, /\+PropFloat\(Player, CabinetAutofitMaxStretch,[^\n]*0\.f, 0\.5f, 0\.f\);/);
  assert.match(diff, /\+\s+if \(const float fillScale = mSceneScaleX; settings\.GetPlayer_CabinetAutofitKeepTop\(\) && fillScale > 1\.f\)/, 'seulement dans « Fit Table » (sans étirement)');
  assert.match(diff, /mSceneScaleX = clamp\(fillScale, zoom, zoom \* \(1\.f \+ maxStretch\)\)/, 'étirement plafonné, jamais une table rétrécie en largeur');
  assert.match(diff, /placeVertically\(true\);/, 'les règles de VPX (pas de vide en haut, 5 % en bas au plus) gardent le dernier mot');
  assert.doesNotMatch(diff, /mViewportRotation =/, 'la rotation reste celle du cadrage automatique : le sens des tables est inchangé');
  // Le schéma de la 5436 (celle que remplace le VPX corrigé) connaît ces réglages ; celui de la 10.9 non.
  const schema = (v: string) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'installer', 'vpx-settings', `${v}.json`), 'utf8')) as { settings: { section: string; key: string }[] };
  const has = (v: string, key: string) => schema(v).settings.some((s) => s.section === 'Player' && s.key === key);
  assert.ok(has('10.8.1-5436', 'CabinetAutofitKeepTop') && has('10.8.1-5436', 'CabinetAutofitMaxStretch'));
  assert.ok(!has('10.9.0-6948', 'CabinetAutofitKeepTop'));
  const own = require(path.join(REPO_ROOT, 'packages', 'installer', 'dist', 'vpx-own-plugins.js')) as { patchedSettingsSource(dir: string): string };
  assert.match(own.patchedSettingsSource(path.join(REPO_ROOT, 'packages')), /^PropBool\(Player, CabinetAutofitKeepTop/m, 'le schéma lit les réglages dans les correctifs eux-mêmes');
});
