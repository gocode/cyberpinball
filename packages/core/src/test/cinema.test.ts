// Lancement en cinéma (cinema.ts) : la chorégraphie ne retarde jamais VPX. Le processus
// principal n'en garde qu'un état, sans attente ni minuteur ; play() (frontend.ts) lance VPX
// exactement comme sans elle, et le passage de relais (coup de bobine) vient du lanceur, quand
// la fenêtre de jeu de VPX tient le premier plan. Le DMD suit le même rythme que la feuille de
// style, et les fenêtres jouent leur part (départ du plateau, arrivée sur le fronton).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { CINEMA_TIMELINE, LaunchCinema } from '../cinema';
import { DMD_HEIGHT, DMD_LEVEL, DMD_WIDTH, dmdAnimation, sameDots } from '../livedmd';
import { REPO_ROOT } from './i18n-scan';
import { menuRenderer } from './menu-renderer';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const NEON = { title: 'Neon Galaxy', manufacturer: 'Williams', year: 1992, logo: 'cyber-media://fichier/wheel.png' };

/** Corps d'une fonction de frontend.ts, jusqu'à l'accolade qui la ferme en début de ligne. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, start + source.slice(start).search(/\n\}\n/));
}

test('état : aucune méthode ne rend de promesse, rien ne change avec le temps, le relais vient du lanceur', () => {
  let now = 1_000;
  const cinema = new LaunchCinema(() => now);
  assert.equal(cinema.view({ depart: true, arrivee: true }), undefined, 'rien avant le Start');
  assert.equal(cinema.start(7, NEON), undefined, 'start ne rend rien qu’on pourrait attendre');
  const view = cinema.view({ depart: true, arrivee: false });
  assert.deepEqual(view, { ...NEON, id: 7, startedAt: 1_000, depart: true, arrivee: false });
  // Une heure de chargement : la chorégraphie tient toujours, aucun minuteur ne l'a close.
  now += 3_600_000;
  assert.deepEqual(cinema.view({ depart: true, arrivee: false }), view);
  assert.equal(cinema.running, true);
  assert.equal(cinema.view({ depart: false, arrivee: false }), undefined, 'une fenêtre sans plateau ni fronton n’a pas de part');
  // VPX prend la main : le coup de bobine une fois, puis plus rien à montrer.
  assert.equal(cinema.handover(), true);
  assert.equal(cinema.handover(), false, 'une seule fois par lancement');
  assert.equal(cinema.view({ depart: true, arrivee: true }), undefined);
  assert.equal(cinema.subject, undefined);
  cinema.stop();
  assert.equal(cinema.handover(), false, 'sans chorégraphie, pas de coup de bobine');
  // Nouveau lancement : nouveau numéro, nouvelle heure de départ.
  cinema.start(8, { title: 'Rocket Rally' });
  assert.equal(cinema.view({ depart: false, arrivee: true })!.id, 8);
  assert.equal(cinema.view({ depart: false, arrivee: true })!.logo, undefined, 'sans logo : le médaillon au titre');
});

test('état : le module ne contient ni minuteur, ni promesse, ni attente', () => {
  const source = read('packages', 'core', 'src', 'cinema.ts')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .join('\n');
  assert.doesNotMatch(source, /setTimeout|setInterval|Promise|async |await /);
});

test('VPX n’attend jamais l’animation : play() lance VPX comme sans elle', () => {
  const main = read('app', 'src', 'frontend.ts');
  const play = body(main, 'async function play(');
  const start = play.indexOf('cinema.start(');
  const launch = play.indexOf('launchVpx(');
  assert.ok(start > 0 && launch > start, 'la chorégraphie part au Start, avant le lancement de VPX');
  assert.match(play.slice(0, start), /state = \{ \.\.\.state, phase: 'loading'/, 'au Start, avec l’écran de chargement');
  // Entre le Start et le lancement, les seules attentes sont celles d'avant le cinéma : l'écran de
  // chargement (délai réglé), sa capture pour les essais, l'habillage FullDMD. Aucune ne dépend de lui.
  const awaits = [...play.slice(start, launch).matchAll(/await ([^;]+);/g)].map((m) => m[1]!.replace(/\s+/g, ' ').slice(0, 40));
  assert.deepEqual(awaits, ['delay(Math.min(400, loadingMs))', "capture('chargement')", 'delay(Math.max(0, loadingMs - 400))', 'prepareDressing(table, { root: loc.root,']);
  assert.match(play, /const loadingMs = Number\(process\.env\.CYBERPINBALL_LOADING_MS \?\? 2500\);/, 'délai du chargement indépendant du cinéma');
  // Nulle part dans le menu on n'attend une animation (DMD, chorégraphie) : seule la partie s'attend.
  for (const m of main.matchAll(/await ([^;\n]+)/g)) assert.doesNotMatch(m[1]!, /cinema|Cinema|loadingDmd|liveDmd|playDmdAnimation|\.done\b(?<!game\.done)/, m[0]);
  assert.equal([...main.matchAll(/\.done\b/g)].length, 1, 'seul game.done est attendu');
  // Le relais : le lanceur le donne (partie réelle comme simulée), il fait sonner la bobine.
  assert.match(play, /const onForeground = \(\) => \{\n\s+if \(cinema\.handover\(\)\) playUiSound\('coil'\);\n\s+\};/);
  assert.match(play, /simulateVpx\(\{ onPlaying, onForeground \}\)/);
  assert.match(play, /launchVpx\(\{[^}]*onPlaying, onForeground \}\)/);
  // La chorégraphie s'arrête avec le lancement : écrans à revoir, ou partie finie.
  assert.ok(play.indexOf('cinema.stop()') > start && play.lastIndexOf('cinema.stop()') > play.indexOf('await game.done'));
});

test('relais : le lanceur ne le donne que quand Windows met la fenêtre de jeu de VPX au premier plan', () => {
  const launcher = read('app', 'src', 'launcher.ts');
  const calls = [...launcher.matchAll(/opts\.onForeground\?\.\(\)/g)];
  assert.equal(calls.length, 2, 'partie réelle et partie simulée');
  const real = launcher.slice(0, calls[0]!.index);
  assert.match(real.slice(-260), /if \(player && !foreground && !failure && foregroundWindow\(\)\?\.pid === child\.pid\) \{\n\s+foreground = true;\n\s+$/);
  // Partie simulée : juste après l'apparition de sa fenêtre de jeu.
  const simulated = launcher.slice(launcher.indexOf('export function simulateVpx('));
  assert.ok(simulated.indexOf('opts.onPlaying?.()') < simulated.indexOf('opts.onForeground?.()'));
});

test('relais : partie simulée, la fenêtre de jeu paraît puis prend la main, une fois', async () => {
  const { simulateVpx } = require(path.join(REPO_ROOT, 'app', 'dist', 'launcher.js')) as {
    simulateVpx(o: { onPlaying?: () => void; onForeground?: () => void; loadMs?: number }): { stop(): void; done: Promise<{ ok: boolean }> };
  };
  const events: string[] = [];
  const game = simulateVpx({ loadMs: 10, onPlaying: () => events.push('partie'), onForeground: () => events.push('relais') });
  await new Promise((r) => setTimeout(r, 40));
  game.stop();
  assert.equal((await game.done).ok, true);
  assert.deepEqual(events, ['partie', 'relais']);
});

test('DMD : le titre et la bille au lanceur, le disque lumineux au passage du logo, un éclat, puis la bille roule', () => {
  const anim = dmdAnimation('lancement', { label: 'Neon Galaxy' });
  const chargement = dmdAnimation('chargement', { label: 'Neon Galaxy' });
  const { arm, dmdPass, dmdPassLength, dmdFlash } = CINEMA_TIMELINE;
  assert.equal(anim.duration, undefined, 'tient jusqu’à ce que VPX prenne l’afficheur');
  const ballX = (dots: Uint8Array) => {
    for (let x = 0; x < DMD_WIDTH; x++) if (dots[24 * DMD_WIDTH + x] === DMD_LEVEL.accent) return x;
    return -1;
  };
  assert.equal(ballX(anim.dots(0)), 8, 'la bille au bout du rail');
  assert.ok(sameDots(anim.dots(0), anim.dots(arm - 10)), 'immobile jusqu’à l’armement');
  const shaken = new Set([0, 100, 200, 300].map((t) => ballX(anim.dots(arm + t + 10))));
  assert.deepEqual([...shaken].sort(), [7, 8, 9], 'elle tremble d’un point, avec des retours au centre');
  // Passage : le disque monte (allumé en bas au début, en haut à la fin) ; seule la bille est à 15.
  const lit = (dots: Uint8Array, rows: number[]) => rows.reduce((n, y) => n + dots.slice(y * DMD_WIDTH, (y + 1) * DMD_WIDTH).filter((v) => v >= 9).length, 0);
  const early = anim.dots(dmdPass + dmdPassLength * 0.2);
  const late = anim.dots(dmdPass + dmdPassLength * 0.85);
  assert.ok(lit(early, [DMD_HEIGHT - 3, DMD_HEIGHT - 2]) > lit(late, [DMD_HEIGHT - 3, DMD_HEIGHT - 2]));
  assert.ok(lit(late, [0, 1, 2]) > lit(early, [0, 1, 2]));
  for (const k of [0.1, 0.5, 0.9]) assert.equal(anim.dots(dmdPass + dmdPassLength * k).filter((v) => v === DMD_LEVEL.accent).length, 8, 'aucun point à 15 hors de la bille');
  // Éclat : quelques points à 15 en haut, au milieu ; aucun éclair plein écran.
  const flash = anim.dots(dmdPass + dmdPassLength + 5);
  const bright = [...flash.keys()].filter((i) => flash[i] === DMD_LEVEL.accent && Math.floor(i / DMD_WIDTH) < 3);
  assert.ok(bright.length > 0 && bright.length <= 8 && bright.every((i) => Math.abs((i % DMD_WIDTH) - 64) <= 2), `${bright.length} points`);
  // Ensuite, exactement le chargement, la bille partie du même bout.
  const rolling = dmdPass + dmdPassLength + dmdFlash;
  for (const t of [0, 300, 1700]) assert.ok(sameDots(anim.dots(rolling + t), chargement.dots(t)), `chargement à +${t} ms`);
});

/** Départ d'une animation de frontend.css (« calc((N - var(--ce)) * 1ms) ») pour un sélecteur. */
function cssStart(css: string, selector: string): number {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, selector);
  const block = css.slice(at, css.indexOf('}', at));
  const m = /animation-delay: calc\(\((\d+) - var\(--ce\)\) \* 1ms\)/.exec(block);
  assert.ok(m, `${selector} : départ compté depuis le Start`);
  return Number(m![1]);
}

test('rythme : la feuille de style suit CINEMA_TIMELINE, que suit aussi le DMD', () => {
  const css = read('app', 'renderer', 'frontend.css');
  const T = CINEMA_TIMELINE;
  assert.equal(cssStart(css, '.cinema-depart .cine-logo'), T.ignite);
  assert.equal(cssStart(css, '.cinema-depart .cine-arm'), T.arm);
  assert.equal(cssStart(css, '.cinema-depart .cine-flight'), T.launch);
  assert.equal(cssStart(css, '.cine-scrim'), T.dim);
  assert.equal(cssStart(css, '.cinema-arrivee .cine-flight'), T.arrive);
  assert.equal(cssStart(css, '.cinema-arrivee .cine-ring'), T.impact);
  assert.equal(cssStart(css, '.cinema-arrivee .cine-logo::before'), T.hold);
  assert.match(css, new RegExp(`\\.cinema\\.cine-fin \\{\\n\\s+animation: cine-fin ${T.fadeOut}ms`));
  // Le passage sur le DMD tombe entre la sortie du plateau et l'entrée sur le fronton.
  assert.ok(T.dmdPass > T.launch && T.dmdPass < T.arrive + 100);
  // Le renderer retire la couche quand son fondu est fini.
  assert.match(read('app', 'renderer', 'frontend.js'), new RegExp(`CINEMA_FADE_MS = ${T.fadeOut}`));
});

test('rythme : aucune animation ne se montre avant son départ', () => {
  // Une animation remplie vers l'arrière (both, backwards) montre sa première image pendant tout son
  // délai : l'onde de la pose se voyait à demi dès l'arrivée du logo, 360 ms trop tôt (planche à
  // 1 000 ms de docs\demo-cinema.ps1). Sa première image doit donc être invisible, ou l'animation ne
  // garder que sa fin (forwards).
  const css = read('app', 'renderer', 'frontend.css');
  const section = css.slice(css.indexOf('/* ---------- Lancement en cinéma'), css.indexOf('/* ---------- Mode attente'));
  const uses = [...section.matchAll(/animation: (cine-[\w-]+) [^;]*\b(both|backwards)\b[^;]*;/g)];
  assert.ok(uses.length >= 4, 'les animations remplies vers l’arrière sont relevées');
  for (const [, name, fill] of uses) {
    const at = section.indexOf(`@keyframes ${name} {`);
    assert.ok(at >= 0, `@keyframes ${name}`);
    const first = /\n\s+(from|0%)[^{]*\{([^}]*)\}/.exec(section.slice(at, section.indexOf('\n}', at)));
    const opacity = /opacity: ([\d.]+)/.exec(first?.[2] ?? '');
    if (opacity) assert.equal(Number(opacity[1]), 0, `${name} (${fill}) : visible avant son départ`);
  }
});

// ---------------------------------------------------------------------------
// Fenêtres (app/renderer/frontend.js, syncCinema) : le vrai rendu dans linkedom.

/** État du chargement d'une fenêtre, avec sa part du cinéma. */
function loading(role: string, cinema: Record<string, unknown> | undefined) {
  return {
    role,
    phase: 'loading',
    help: false,
    count: 3,
    position: 2,
    table: { title: 'Neon Galaxy', manufacturer: 'Williams', year: '1992', subtitle: 'Williams · 1992' },
    neighbors: [],
    menuLayout: 'medaillons',
    medias: {},
    preload: [],
    loading: { role: 'playfield', type: 'Loading', source: 'file', url: 'cyber-media://fichier/loading.webm', kind: 'video', fit: 'cover', rotation: 0, card: {} },
    cinema,
    footer: [],
    menuKeys: [],
    gameKeys: [],
    loadingKeys: { title: '', rows: [] },
    nav: {},
  };
}

const view = (extra: Record<string, unknown> = {}) => ({ ...NEON, id: 1, startedAt: Date.now() - 500, depart: true, arrivee: false, ...extra });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** La vraie page d'une fenêtre : `role`, et ses zones (fractions de l'écran). */
function page(role = 'playfield', zones: unknown[] = []) {
  const p = menuRenderer({ location: { search: `?role=${role}&zones=${encodeURIComponent(JSON.stringify(zones))}` } });
  const Media = Object.getPrototypeOf(p.document.createElement('video'));
  Media.play = () => Promise.resolve();
  Media.pause = () => {};
  return p;
}

test('fenêtre du plateau : le logo part de la couche #cinema, à l’heure du Start ; rien dans la racine', () => {
  const { send, document } = page();
  document.documentElement.classList.add('menu-cab');
  send(loading('playfield', view()));
  const stage = document.querySelector('#cinema > .cinema.cinema-depart') as unknown as { style: { getPropertyValue(name: string): string }; querySelector(s: string): unknown };
  assert.ok(stage, 'scène du départ');
  assert.ok(stage.querySelector('.cine-flight > .cine-arm > .cine-logo > img.cine-img'), 'le logo du jeu');
  const elapsed = Number(stage.style.getPropertyValue('--cine-elapsed'));
  assert.ok(elapsed >= 500 && elapsed < 2000, `à l’heure du Start (${elapsed} ms)`);
  assert.equal(document.getElementById('root')!.children.length, 0, 'le chargement en borne reste le média seul');
  assert.equal(document.querySelector('.cinema-arrivee'), null, 'pas de fronton dans cette fenêtre');
  // Le même lancement renvoyé (son, réglages) : la scène reste, ses animations ne repartent pas.
  send(loading('playfield', view({ startedAt: Date.now() - 900 })));
  assert.equal(document.querySelector('#cinema > .cinema'), stage);
});

test('repli sans logo : le médaillon au titre de la table', () => {
  const { send, document } = page();
  send(loading('playfield', view({ logo: undefined })));
  assert.equal(document.querySelector('.cinema .cine-disc .cine-disc-title')!.textContent, 'Neon Galaxy');
  assert.equal(document.querySelector('.cinema img'), null);
});

test('fenêtre du fronton : le logo s’y pose, sur un voile ; la couche du plateau reste vide', () => {
  const { send, document } = page('backglass', [{ role: 'backglass', zone: { x: 0, y: 0, width: 1, height: 1 } }]);
  send(loading('backglass', view({ depart: false, arrivee: true })));
  const stage = document.querySelector('.zone-backglass > .cinema.cinema-arrivee')!;
  assert.ok(stage, 'scène de l’arrivée dans la zone du fronton');
  assert.ok(stage.querySelector('.cine-scrim') && stage.querySelector('.cine-flight > .cine-logo > img'));
  assert.equal(document.getElementById('cinema')!.children.length, 0);
});

test('relais : VPX paraît, la scène s’efface puis part, et ne se rejoue pas ; un échec la retire aussitôt', async () => {
  const { send, document } = page();
  send(loading('playfield', view()));
  const game = { ...loading('playfield', undefined), phase: 'playing', game: { role: 'playfield', table: { title: 'Neon Galaxy' }, mode: 'still', medias: {}, play: {} } };
  send(game);
  const stage = document.querySelector('#cinema > .cinema')!;
  assert.ok(stage.classList.contains('cine-fin'), 'fondu');
  await wait(CINEMA_TIMELINE.fadeOut + 60);
  assert.equal(document.querySelector('.cinema'), null, 'retirée après le fondu');
  // Un état tardif du même lancement ne la repose pas.
  send(loading('playfield', view()));
  assert.equal(document.querySelector('.cinema'), null);
  // Lancement suivant, qui échoue avant VPX : retirée sans fondu.
  send(loading('playfield', view({ id: 2 })));
  assert.ok(document.querySelector('#cinema > .cinema'));
  send({ ...loading('playfield', undefined), phase: 'message', message: { title: 'La partie n’a pas pu se dérouler', lines: [] } });
  assert.equal(document.querySelector('.cinema'), null);
});
