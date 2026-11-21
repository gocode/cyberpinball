// VPX corrigé (20/11/2026) : la 5436 présentait le backglass à chaque image du playfield, et un écran annexe à 50 ou
// 60 Hz calait toute la partie sur sa fréquence (rapports AE5_oja0iY et LLvRT2ian0). Cyber Pinball livre l'exécutable
// de la 5436 reconstruit avec le correctif de VPX (packages/vpx-corrige) et le pose avant chaque partie.
// Invariants : posé seulement sur la 5436, jamais sur un autre VPX ; pas recopié s'il est déjà là ; l'officiel gardé à
// côté et remis dès qu'une version ne livre plus le corrigé (retour arrière sans téléchargement) ; la vérification des
// fichiers de VPX ne le prend pas pour une modification, mais voit toujours un autre exécutable ; la fabrication le
// livre avec son correctif et son LISEZMOI (GPL) ; le correctif reste celui qui bride les fenêtres annexes.

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

/** Un dossier d'application avec son VPX corrigé (natif\vpx-corrige), et un dossier de VPX à l'exécutable officiel. */
function setup(): { root: string; app: string; vpx: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-corrige-'));
  const app = path.join(root, 'app');
  fs.mkdirSync(path.join(app, 'natif', 'vpx-corrige'), { recursive: true });
  fs.writeFileSync(path.join(app, 'natif', 'vpx-corrige', 'VPinballX_BGFX64.exe'), Buffer.alloc(50, 2));
  const vpx = path.join(root, 'vpx');
  fs.mkdirSync(vpx);
  fs.writeFileSync(path.join(vpx, 'VPinballX_BGFX64.exe'), Buffer.alloc(40, 1));
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
    assert.deepEqual(fs.readdirSync(vpx).sort(), ['VPinballX_BGFX64.exe', 'VPinballX_BGFX64.exe.officiel'], 'l’officiel gardé à côté, aucun fichier de passage laissé');
    assert.deepEqual(fs.readFileSync(path.join(vpx, 'VPinballX_BGFX64.exe.officiel')), Buffer.alloc(40, 1));
    // Retour arrière : une version de Cyber Pinball sans corrigé remet l'officiel, sans téléchargement.
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, path.join(root, 'sans')), 'restored');
    assert.deepEqual(fs.readFileSync(path.join(vpx, 'VPinballX_BGFX64.exe')), Buffer.alloc(40, 1));
    assert.deepEqual(fs.readdirSync(vpx), ['VPinballX_BGFX64.exe']);
    assert.equal(corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, path.join(root, 'sans')), 'missing', 'ensuite, plus rien à faire');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fiche technique : « patched Cyber Pinball 1 » quand le corrigé est en place, en anglais dans toutes les langues', () => {
  const { root, app, vpx } = setup();
  try {
    const inPlace = (corrige as unknown as { vpxCorrigeInPlace(d: string, v: string | undefined, a: string): number | undefined }).vpxCorrigeInPlace;
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), undefined, 'officiel en place');
    corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app);
    assert.equal(inPlace(vpx, corrige.VPX_CORRIGE_VERSION, app), (corrige as unknown as { VPX_CORRIGE_PATCH: number }).VPX_CORRIGE_PATCH);
    assert.equal(inPlace(vpx, '10.9.0-6948', app), undefined);
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
    const component = { files: { 'VPinballX_BGFX64.exe': 40 }, executable: 'VPinballX_BGFX64.exe', executablePattern: '^VPinballX.*64\\.exe$' };
    corrige.installVpxCorrige(vpx, corrige.VPX_CORRIGE_VERSION, app);
    const accepted = corrige.vpxCorrigeSizes(app, corrige.VPX_CORRIGE_VERSION);
    assert.deepEqual(installer.checkComponentFiles(vpx, component, accepted)!.changed, []);
    assert.equal(installer.checkComponentFiles(vpx, component)!.changed.length, 1, 'sans lui, la taille diffère');
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
