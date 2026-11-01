// Ouverture au démarrage (intro.ts) : chaque écran joue son animation une fois et garde sa
// dernière image ; le premier bouton affiche la roue. Les animations de Cyber Pinball font
// partie de l'application et ne s'effacent jamais ; les fichiers de l'utilisateur (images,
// vidéos, musique de fond) se rangent dans <racine>\media, et revenir à l'animation de Cyber
// Pinball les garde. Le vrai rendu joue un fichier une fois, sans le relancer.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { applyOps } from '../fileops';
import {
  DEFAULT_INTRO_SETTINGS,
  INTRO_FALLBACKS,
  INTRO_SCREENS,
  INTRO_SKIP_FLAG,
  INTRO_SLOTS,
  INTRO_TIMELINE,
  IntroRun,
  introAtStartup,
  introDefaults,
  introFiles,
  introMediaView,
  introPlaceOps,
  introScreenOf,
  introSource,
  normalizeIntroSettings,
  withIntroChoice,
} from '../intro';
import { normalizeMenuMediaSettings } from '../mediaview';
import { MENU_PHASES, introSound, screensTable } from '../menumoments';
import type { TableEntry } from '../tables';
import { REPO_ROOT } from './i18n-scan';
import { menuRenderer } from './menu-renderer';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ouverture-'));
const touch = (dir: string, name: string, content = 'x') => (fs.writeFileSync(path.join(dir, name), content), path.join(dir, name));

/** Corps d'une fonction de frontend.ts, jusqu'à l'accolade qui la ferme en début de ligne. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, start + source.slice(start).search(/\n\}\n/));
}

test('réglages : jouée par défaut, chaque écran sur « auto », relus de medias.json sans rien inventer', () => {
  assert.deepEqual(normalizeIntroSettings(undefined), DEFAULT_INTRO_SETTINGS);
  assert.equal(DEFAULT_INTRO_SETTINGS.enabled, true);
  const read = normalizeIntroSettings({ enabled: false, screens: { topper: 'default', dmd: 'n’importe quoi' }, music: 'default' });
  assert.equal(read.enabled, false);
  assert.equal(read.screens.topper, 'default');
  assert.equal(read.screens.dmd, 'auto', 'valeur illisible : auto');
  assert.equal(read.music, 'default');
  assert.deepEqual(normalizeMenuMediaSettings({}).intro, DEFAULT_INTRO_SETTINGS, 'medias.json d’une version plus ancienne');
  assert.equal(normalizeMenuMediaSettings({ intro: { enabled: false } }).intro.enabled, false);
});

test('fichiers : <racine>\\media\\(IntroX).ext, la vidéo avant l’image, un format qui ne convient pas ignoré', () => {
  const dir = tmp();
  touch(dir, '(IntroPlayfield).png');
  touch(dir, '(IntroPlayfield).mp4');
  touch(dir, '(IntroBackglass) mon fronton.webp');
  touch(dir, '(IntroAudio).ogg');
  touch(dir, '(IntroAudio).png');
  touch(dir, '(IntroTopper).mov');
  touch(dir, '(Topper).png');
  const files = introFiles(dir);
  assert.deepEqual(files.playfield?.map((f) => path.basename(f)), ['(IntroPlayfield).mp4', '(IntroPlayfield).png']);
  assert.deepEqual(files.backglass?.map((f) => path.basename(f)), ['(IntroBackglass) mon fronton.webp']);
  assert.deepEqual(files.music?.map((f) => path.basename(f)), ['(IntroAudio).ogg'], 'une image n’est pas une musique');
  assert.equal(files.topper, undefined, 'mov ne se lit pas, et (Topper) est le défaut de la borne, pas l’ouverture');
  assert.deepEqual(introFiles(path.join(dir, 'absent')), {});
});

test('source : sans fichier, l’animation de Cyber Pinball ; « default » garde le fichier de l’utilisateur', () => {
  const dir = tmp();
  const video = touch(dir, '(IntroPlayfield).mp4');
  const files = introFiles(dir);
  assert.deepEqual(introSource(DEFAULT_INTRO_SETTINGS, files, 'backglass'), { source: 'default' });
  assert.deepEqual(introSource(DEFAULT_INTRO_SETTINGS, files, 'playfield'), { source: 'file', file: video, kind: 'video' });
  const back = withIntroChoice(DEFAULT_INTRO_SETTINGS, 'playfield', 'default');
  assert.deepEqual(introSource(back, files, 'playfield'), { source: 'default', kept: video });
  assert.ok(fs.existsSync(video), 'revenir à l’animation de Cyber Pinball n’efface rien');
  assert.deepEqual(introSource(withIntroChoice(back, 'playfield', 'auto'), files, 'playfield').source, 'file', 'le fichier gardé se reprend');
  // Tout revenir : chaque écran sur l'animation de Cyber Pinball, sans musique ; l'ouverture reste jouée.
  const all = introDefaults({ ...DEFAULT_INTRO_SETTINGS, enabled: true });
  assert.ok(INTRO_SCREENS.every((s) => all.screens[s] === 'default') && all.music === 'default' && all.enabled);
});

test('rangement : le fichier choisi est copié sous son nom, celui qu’il remplace part à la corbeille, jamais effacé', () => {
  const root = tmp();
  const media = path.join(root, 'media');
  fs.mkdirSync(media);
  const old = touch(media, '(IntroPlayfield).png', 'ancien');
  const from = touch(root, 'ma vidéo.MP4', 'nouveau');
  const ops = introPlaceOps(media, 'playfield', from, introFiles(media));
  assert.deepEqual(ops, [
    { op: 'trash', path: old },
    { op: 'copy', from, to: path.join(media, '(IntroPlayfield).mp4') },
  ]);
  const trashDir = path.join(root, 'trash', 'Ouverture');
  applyOps(ops, { trashDir });
  assert.deepEqual(fs.readdirSync(media), ['(IntroPlayfield).mp4']);
  assert.equal(fs.readFileSync(path.join(trashDir, '(IntroPlayfield).png'), 'utf8'), 'ancien', 'l’ancien est dans la corbeille');
  assert.ok(fs.existsSync(from), 'l’original reste où il était');
  assert.deepEqual(introPlaceOps(media, 'playfield', path.join(media, '(IntroPlayfield).mp4'), introFiles(media)), [], 'le même fichier : rien à faire');
});

test('les animations de Cyber Pinball ne sont pas des fichiers : rien à effacer, rien de livré à remplacer', () => {
  // Chaque écran a sa scène dessinée par le rendu, et la couche de média la connaît.
  const intro = read('app', 'renderer', 'intro.js');
  const media = read('app', 'renderer', 'media.js');
  for (const screen of INTRO_SCREENS) {
    const fallback = INTRO_FALLBACKS[screen];
    const kind = new RegExp(`'${fallback}': '(\\w+)'`).exec(media)?.[1];
    assert.ok(kind, `media.js connaît ${fallback}`);
    assert.match(intro, new RegExp(`\\n    ${kind},\\n`), `intro.js exporte ${kind}`);
  }
  // Aucun code ne retire autre chose que les fichiers de l'utilisateur, et seulement vers la corbeille.
  const menu = read('app', 'src', 'intro-menu.ts');
  assert.doesNotMatch(menu, /unlinkSync|rmSync|rmdirSync|op: 'delete'/);
  assert.doesNotMatch(read('packages', 'core', 'src', 'intro.ts'), /unlinkSync|rmSync|op: 'delete'/);
});

test('démarrage : seulement en arrivant sur la roue, ni à une relance du menu, ni sous l’autopilote', () => {
  const s = DEFAULT_INTRO_SETTINGS;
  const at = (over: Partial<Parameters<typeof introAtStartup>[0]>) => introAtStartup({ settings: s, landing: 'menu', argv: [], env: {}, ...over });
  assert.equal(at({}), true);
  assert.equal(at({ settings: { ...s, enabled: false } }), false, 'coupée');
  assert.equal(at({ landing: 'message' }), false, 'un message à traiter passe avant');
  assert.equal(at({ argv: ['app', INTRO_SKIP_FLAG] }), false, 'relance du menu par lui-même');
  assert.equal(at({ env: { CYBERPINBALL_AUTOPILOT: 'key:Enter' } }), false, 'les essais trouvent la roue tout de suite');
  assert.equal(at({ env: { CYBERPINBALL_AUTOPILOT: 'key:Enter', CYBERPINBALL_OUVERTURE: '1' } }), true, 'sauf demandée');
  assert.equal(at({ env: { CYBERPINBALL_OUVERTURE: '0' } }), false);
  // La relance du menu (langue, configuration) le dit ; le démarrage le décide une fois, avant l'autopilote.
  const main = read('app', 'src', 'frontend.ts');
  assert.match(body(main, 'function relaunchMenu'), /INTRO_SKIP_FLAG/);
  const start = body(main, 'export function startFrontend');
  assert.ok(start.indexOf('introAtStartup(') > 0 && start.indexOf('introAtStartup(') < start.indexOf('library.autopilot('));
});

test('déroulé : posée, partie quand toutes les fenêtres sont prêtes (une fois), finie au premier bouton', () => {
  let now = 1000;
  const run = new IntroRun(() => now);
  assert.equal(run.active, false);
  run.begin('menu');
  assert.deepEqual(run.current, { id: 1, startedAt: undefined }, 'du noir avant le départ');
  now = 1800;
  assert.equal(run.start(), true);
  assert.equal(run.start(), false, 'une seule fois');
  assert.equal(run.current!.startedAt, 1800);
  assert.equal(run.end(), 'menu');
  assert.equal(run.active, false);
  run.begin('library', true);
  assert.deepEqual(run.current, { id: 2, startedAt: 1800 }, '« Voir l’ouverture » : les fenêtres sont déjà prêtes');
  assert.equal(run.end(), 'library');
});

test('vues : l’animation de Cyber Pinball ou le fichier, joué une fois ; le plateau tourné d’après les flippers', () => {
  const run = { id: 3, startedAt: 5000 };
  const url = (f: string) => `cyber-media://fichier/${encodeURIComponent(f)}`;
  const base = { run, rotation: 90 as const, edge: 'left' as const, url };
  const def = introMediaView({ ...base, role: 'backglass', screen: 'backglass', source: { source: 'default' } });
  assert.equal(def.url, undefined);
  assert.equal(def.fallback, 'intro-backglass');
  assert.equal(def.fit, 'contain');
  assert.deepEqual(def.intro, { id: 3, startedAt: 5000, timeline: INTRO_TIMELINE, rotation: 0 });
  const pf = introMediaView({ ...base, role: 'playfield', screen: 'playfield', source: { source: 'file', file: 'C:\\m\\(IntroPlayfield).mp4', kind: 'video' } });
  assert.equal(pf.kind, 'video');
  assert.equal(pf.fit, 'cover');
  assert.deepEqual(pf.orient, { edge: 'left', halfTurn: false }, 'tourné comme le média du plateau');
  assert.equal(pf.fallback, 'intro-playfield', 'fichier illisible : l’animation de Cyber Pinball');
  const desk = introMediaView({ ...base, role: 'playfield', screen: 'backglass', source: { source: 'file', file: 'C:\\m\\(IntroBackglass).png', kind: 'image' }, desktop: true });
  assert.equal(desk.rotation, 90, 'au bureau, le fronton dressé pour le joueur');
  assert.equal(introScreenOf('dmd', 'FullDMD'), 'fulldmd');
  assert.equal(introScreenOf('dmd', 'DMD'), 'dmd');
  assert.equal(introScreenOf('topper', 'DMD'), 'topper');
  assert.equal(INTRO_SLOTS.length, 6);
});

test('écrans de la borne : l’ouverture ne parle d’aucune table ; son son est la musique de fond, sinon la vidéo du plateau', () => {
  assert.ok(MENU_PHASES.includes('intro'));
  const selected = { file: 'C:\\T\\a.vpx', title: 'Neon Galaxy' } as TableEntry;
  assert.equal(screensTable({ phase: 'intro', help: false, selected }), undefined, 'pas la table de la roue : la roue n’est pas encore là');
  assert.deepEqual(introSound({ musicVolume: 60, videoVolume: 40 }, 'cyber-media://m.ogg'), { music: { url: 'cyber-media://m.ogg', volume: 0.6 }, video: 0 });
  assert.deepEqual(introSound({ musicVolume: 60, videoVolume: 40 }, undefined), { video: 0.4 });
  assert.deepEqual(introSound({ musicVolume: 0, videoVolume: 40 }, 'cyber-media://m.ogg'), { video: 0 }, 'musique à zéro : rien, pas la vidéo');
});

test('boutons : pendant l’ouverture, n’importe quel bouton ou clic affiche la roue et rien d’autre', () => {
  const main = read('app', 'src', 'frontend.ts');
  const keys = body(main, 'function handleKey(');
  const leave = keys.indexOf("if (state.phase === 'intro') return leaveIntro();");
  assert.ok(leave > 0 && leave < keys.indexOf('CONFIG_KEY') && leave < keys.indexOf('switch (state.phase)'), 'avant Tab et avant tout autre bouton');
  assert.match(main, /if \(state\.phase === 'intro'\) return void leaveIntro\(\);/, 'un clic');
  // Le DMD vivant s'efface devant l'ouverture ; les constats brefs attendent la roue.
  assert.match(body(main, 'function liveDmdOn'), /state\.phase !== 'intro'/);
  assert.match(body(main, 'function showBanner'), /state\.phase === 'intro'/);
  assert.match(body(main, 'function leaveIntro'), /pendingBanners/);
});

/** La vraie page d'une fenêtre, avec des scènes d'ouverture factices qui disent quand elles sont montées. */
function page(role = 'playfield', zones: unknown[] = []) {
  const mounted: string[] = [];
  const scene = (name: string) => (box: { append(n: unknown): void }, _card: unknown, options: { intro: { id: number } }) => {
    mounted.push(`${name}:${options.intro.id}`);
    return { destroy() {} };
  };
  const CyberIntro = { playfield: scene('playfield'), backglass: scene('backglass'), topper: scene('topper'), dmd: scene('dmd'), fullDmd: scene('fullDmd'), scenes: () => [], repaint() {} };
  const p = menuRenderer({ CyberIntro, location: { search: `?role=${role}&zones=${encodeURIComponent(JSON.stringify(zones))}` } });
  const Media = Object.getPrototypeOf(p.document.createElement('video'));
  let plays = 0;
  Media.play = () => (plays++, Promise.resolve());
  Media.pause = () => {};
  return { ...p, mounted, plays: () => plays };
}

function introState(role: string, intro: Record<string, unknown>) {
  return { role, phase: 'intro', help: false, count: 3, position: 1, neighbors: [], medias: {}, preload: [], footer: [], menuKeys: [], gameKeys: [], loadingKeys: { title: '', rows: [] }, nav: {}, intro };
}

const view = (role: string, screen: keyof typeof INTRO_FALLBACKS, extra: Record<string, unknown> = {}) => ({
  role,
  screen,
  type: 'Playfield',
  source: 'fallback',
  fit: 'cover',
  rotation: 0,
  fallback: INTRO_FALLBACKS[screen],
  card: { title: '' },
  brand: true,
  intro: { id: 1, startedAt: Date.now(), timeline: { ...INTRO_TIMELINE, end: 30 }, rotation: 0 },
  ...extra,
});

test('rendu : du noir avant le départ, puis chaque couche monte la scène de son rôle ; l’invite paraît à la fin', async () => {
  const p = page();
  const pf = view('playfield', 'playfield');
  p.send(introState('playfield', { id: 1, startedAt: undefined, screens: { playfield: pf }, desktop: view('playfield', 'backglass'), hint: 'Appuyez sur un bouton pour choisir une table' }));
  assert.deepEqual(p.mounted, [], 'rien avant que toutes les fenêtres soient prêtes');
  assert.ok(p.document.documentElement.classList.contains('intro-phase'));
  p.send(introState('playfield', { id: 1, startedAt: Date.now(), screens: { playfield: pf }, desktop: view('playfield', 'backglass'), hint: 'Appuyez sur un bouton pour choisir une table' }));
  assert.deepEqual(p.mounted, ['playfield:1']);
  assert.equal(p.document.querySelector('.intro-hint'), null, 'pas d’invite pendant l’animation');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(p.document.querySelector('.intro-hint')?.textContent, 'Appuyez sur un bouton pour choisir une table');
  // Le même état renvoyé ne remonte pas la scène.
  p.send(introState('playfield', { id: 1, startedAt: Date.now(), screens: { playfield: pf }, hint: 'x' }));
  assert.deepEqual(p.mounted, ['playfield:1']);
});

test('rendu : un écran annexe joue l’ouverture de chacune de ses zones (fronton, DMD)', () => {
  const p = page('backglass', [
    { role: 'backglass', zone: { x: 0, y: 0, width: 1, height: 0.75 } },
    { role: 'dmd', zone: { x: 0, y: 0.75, width: 1, height: 0.25 } },
  ]);
  p.send(introState('backglass', { id: 1, startedAt: Date.now(), screens: { backglass: view('backglass', 'backglass'), dmd: view('dmd', 'fulldmd') } }));
  assert.deepEqual(p.mounted.sort(), ['backglass:1', 'fullDmd:1']);
  assert.equal(p.document.getElementById('root')!.children.length, 0);
});

test('rendu : le fichier de l’utilisateur se joue une fois, garde sa dernière image, et un nouvel état ne le relance pas', async () => {
  const p = page();
  const file = view('playfield', 'playfield', { source: 'default', url: 'cyber-media://fichier/intro.mp4', kind: 'video' });
  const state = introState('playfield', { id: 1, startedAt: Date.now(), screens: { playfield: file }, hint: 'Appuyez' });
  p.send(state);
  const video = p.document.querySelector('#media-bg video') as unknown as { loop: boolean; ended: boolean; dispatchEvent(e: unknown): void; readyState: number };
  assert.ok(video, 'la vidéo de l’utilisateur');
  assert.equal(video.loop, false, 'jouée une fois');
  Object.defineProperty(video, 'ended', { configurable: true, value: true });
  video.dispatchEvent(new (parseHTML('<html></html>').window.Event)('ended'));
  const before = p.plays();
  p.send(state);
  assert.equal(p.plays(), before, 'finie, elle n’est pas relancée');
  assert.ok(p.document.querySelector('.intro-hint'), 'l’invite paraît à la fin de la vidéo');
  assert.deepEqual(p.mounted, [], 'pas d’animation de Cyber Pinball par-dessus');
});

test('plateau : le shader dessine la même image sur toutes les cartes graphiques, sans table lente', async () => {
  // fract(sin(x)) varie d'une carte à l'autre (précision du sinus) : la borne dessinerait d'autres
  // fils que ceux validés. Les fils viennent de valeurs figées, fournies en tableaux uniformes ;
  // une table constante lue avec l'indice d'une boucle est recopiée à chaque pixel par ANGLE sous
  // Direct3D (trois fois plus lente).
  const vm = await import('node:vm');
  const box: { window: { CyberIntroShaders?: { playfield: string; playfieldUniforms: Record<string, number[]> } } } = { window: {} };
  vm.runInNewContext(read('app', 'renderer', 'intro-shaders.js'), box);
  const shaders = box.window.CyberIntroShaders;
  assert.ok(shaders, 'intro-shaders.js déclare window.CyberIntroShaders');
  assert.match(shaders.playfield, /^#version 300 es\n/);
  // Le code seul : les commentaires peuvent nommer ce qu'il ne faut pas faire.
  const frag = shaders.playfield.replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(frag, /fract\s*\(\s*sin\s*\(/, 'aucun hachage fract(sin()) : il dépend de la carte graphique');
  assert.doesNotMatch(frag, /\bconst\s+\w+\s+\w+\s*\[/, 'aucune table constante : en tableau uniforme');
  for (const [name, values] of Object.entries(shaders.playfieldUniforms)) {
    const declared = new RegExp(`uniform vec4 ${name}\\[(\\d+)\\];`).exec(frag);
    assert.ok(declared, `${name} est déclaré dans le shader`);
    assert.equal(values.length, Number(declared[1]) * 4, `${name} : quatre valeurs par fil`);
    assert.ok(values.every(Number.isFinite), `${name} : des nombres`);
  }
  for (const [, id = ''] of frag.matchAll(/uniform vec4 (\w+)\[/g)) {
    assert.ok(id in shaders.playfieldUniforms, `${id} est fourni par l'application`);
  }
  // Chargé avant intro.js, qui le lit au montage du plateau.
  const html = read('app', 'renderer', 'frontend.html');
  assert.ok(html.indexOf('intro-shaders.js') > 0 && html.indexOf('intro-shaders.js') < html.indexOf('intro.js"'), 'intro-shaders.js avant intro.js');
});
