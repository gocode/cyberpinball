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
  // L'invite à timeline.hint, pas à la fin : la fin, plus tardive, ne la retient pas.
  intro: { id: 1, startedAt: Date.now(), timeline: { ...INTRO_TIMELINE, end: 300, hint: 30 }, rotation: 0 },
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

test('plateau : l’ouverture Soie de la maquette validée, en Canvas 2D à pleine résolution, la marque en texte qui se forme de 2,5 à 3,4 s', async () => {
  // Le vrai intro.js, dans un document linkedom, avec un faux contexte 2D qui compte les fils
  // tracés. Le plateau reprend le dessin de la maquette tel quel (aucun shader à réinventer) :
  // 46 fils (deux traits chacun), la marque « CYBER PINBALL » en texte à la taille du fuseau,
  // dans les unités d'un plateau de 1080 × 1920 ; la même taille de canevas avant et après la fin.
  const vm = await import('node:vm');
  const { window, document } = parseHTML('<html><body><div id="box"></div></body></html>');
  let strokes = 0;
  const gradient = () => ({ addColorStop() {} });
  const ctx2d = new Proxy({} as Record<string, unknown>, {
    get(t, k: string) {
      if (k in t) return t[k];
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return gradient;
      if (k === 'createPattern') return () => ({});
      if (k === 'createImageData') return (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'stroke') return () => (strokes += 1);
      return () => undefined;
    },
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  const Canvas = Object.getPrototypeOf(document.createElement('canvas'));
  const ownGetContext = Object.getOwnPropertyDescriptor(Canvas, 'getContext');
  Canvas.getContext = (kind: string) => (kind === '2d' ? ctx2d : null);
  const Html = Object.getPrototypeOf(Object.getPrototypeOf(document.createElement('div')));
  let size = [2160, 3840];
  Object.defineProperty(Html, 'clientWidth', { configurable: true, get: () => size[0] });
  Object.defineProperty(Html, 'clientHeight', { configurable: true, get: () => size[1] });
  const box = Object.assign(window as unknown as Record<string, unknown>, {
    window,
    document,
    devicePixelRatio: 1,
    performance: { now: () => 0 },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  const host = read('app', 'renderer', 'intro.js');
  vm.runInNewContext(host, box);
  type Node = { width: number; height: number; textContent: string; style: Record<string, string> };
  const intro = (box as { CyberIntro?: { playfield(c: unknown, g: unknown, o: unknown): { element: { querySelector(s: string): Node | null }; destroy(): void } } }).CyberIntro!;
  const at = (ms: number) => {
    strokes = 0;
    const s = intro.playfield(document.getElementById('box')!, {}, { intro: { at: ms, timeline: INTRO_TIMELINE } });
    const canvas = s.element.querySelector('canvas.cp-in-canvas')!;
    const title = s.element.querySelector('.cp-in-title')!;
    const out = { size: `${canvas.width}x${canvas.height}`, strokes, text: title.textContent, opacity: title.style.opacity, spacing: title.style.letterSpacing, blur: title.style.filter, font: title.style.fontSize };
    s.destroy();
    return out;
  };
  let black: ReturnType<typeof at>;
  let weaving: ReturnType<typeof at>;
  let forming: ReturnType<typeof at>;
  let formed: ReturnType<typeof at>;
  let looping: ReturnType<typeof at>;
  let desk: ReturnType<typeof at>;
  try {
    black = at(-1);
    weaving = at(2400);
    forming = at(2900);
    formed = at(INTRO_TIMELINE.end);
    looping = at(INTRO_TIMELINE.end + 7 * 24 * 3600 * 1000);
    size = [1920, 1080];
    desk = at(INTRO_TIMELINE.end);
  } finally {
    if (ownGetContext) Object.defineProperty(Canvas, 'getContext', ownGetContext);
    else delete Canvas.getContext;
    delete Html.clientWidth;
    delete Html.clientHeight;
  }
  assert.equal(black.strokes, 0, 'avant le départ, du noir');
  assert.equal(black.opacity, '0');
  assert.equal(weaving.strokes, 92, 'les 46 fils de la maquette, deux traits chacun');
  assert.equal(weaving.opacity, '0.000', 'la marque attend l’ignition (2,4 s)');
  assert.ok(Number(forming.opacity) > 0 && Number(forming.opacity) < 1, 'elle paraît de 2,5 à 3,4 s');
  assert.match(forming.blur ?? '', /^blur\(/,'floue tant qu’elle se forme');
  assert.equal(formed.text, 'CYBER PINBALL');
  assert.equal(formed.opacity, '1.000');
  assert.equal(formed.spacing, '0.400em', 'écartée comme dans la maquette');
  assert.equal(formed.blur, 'none');
  assert.equal(formed.size, '2160x3840', 'pleine résolution');
  assert.equal(looping.size, formed.size, 'la boucle garde la taille de l’animation : aucun saut de netteté');
  assert.equal(looping.strokes, 92, 'après une semaine, les fils tournent encore');
  assert.equal(formed.font, '112.00px', '56 unités d’un plateau de 1080 points de large');
  assert.equal(desk.font, '31.50px', 'au bureau, l’unité suit la hauteur (1080 / 1920)');
  // Aucun shader : le plateau est le dessin de la maquette, en Canvas 2D.
  assert.doesNotMatch(host, /webgl/i);
  assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'app', 'renderer', 'intro-shaders.js')));
  // Seul le plateau tourne en boucle, et il s'arrête quand sa couche ne se voit plus (voile de
  // nuit, fenêtre cachée), comme une vidéo.
  assert.equal((host.match(/\bloop: \(\) =>/g) ?? []).length, 1, 'une seule scène a une boucle : le plateau');
  assert.match(read('app', 'renderer', 'media.js'), /slot\.handle\?\.setActive\?\.\(active && !document\.hidden\)/);
});

test('rythme : l’ignition du plateau (2,4 s) allume le fronton et la marque du DMD ; l’invite paraît à 3,9 s, tout est posé à la fin', () => {
  const T = INTRO_TIMELINE;
  assert.equal(T.backglassPower, 2400);
  assert.equal(T.dmdBrand, 2400);
  assert.ok(T.dmdPass + T.dmdPassLength <= 2400, 'la bille traverse le DMD avant l’ignition, avec l’étincelle');
  assert.equal(T.hint, 3900, 'l’invite de la maquette');
  // La dernière lettre du fronton (12 lettres, 85 ms d'écart, 120 ms entre les mots, 260 ms d'allumage).
  assert.ok(T.backglassBrand + 11 * 85 + 120 + 260 <= T.end);
  for (const [from, length] of [
    [T.sheen, T.sheenLength],
    [T.topperSweep, T.topperSweepLength],
    [T.dmdBrand, T.dmdBrandLength],
    [T.dmdPress, 800],
  ] as const) assert.ok(from + length <= T.end, `${from} + ${length} avant la fin`);
});
