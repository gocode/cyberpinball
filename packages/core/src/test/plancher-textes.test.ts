// Plancher de 20 px pour tout texte, tel qu'on le voit (revue de Codex du 29/10/2026) : sur la roue
// du menu des tables, les noms des petits médaillons, réduits par scale(--s), passaient à 13,6 px
// sans que rien ne le dise. Le garde-fou de mise en page ne mesurait que les icônes, et le test des
// feuilles (sortie-de-liste.test.ts) ne lit que les corps en cqmin. Trois maillons :
// - la roue (frontend.js, frontend.css) : à chaque place, ce que montre un médaillon sans logo (le
//   nom au centre, l'initiale ailleurs) reste au-dessus de 20 px, glissement compris ;
// - les feuilles : aucun corps écrit sous 20 px, dans les unités du menu (--u, --w, --b) aussi ;
// - le garde-fou (layout-check.ts), dans un vrai Chromium hors écran : un texte réduit par un
//   transform, ou par une pulsation en boucle, est signalé ; un texte éteint ou un dernier recours
//   déclaré ne l'est pas ; ce qu'un clip-path laisse voir ne sort pas de la fenêtre.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { APP, menuRenderer, menuState } from './menu-renderer';

const RENDERER = path.join(APP, 'renderer');
const REPO = path.join(APP, '..');
const read = (file: string) => fs.readFileSync(path.join(RENDERER, file), 'utf8').replace(/\r\n/g, '\n');
const css = (file: string) => read(file).replace(/\/\*[\s\S]*?\*\//g, '');

/** Corps d'un bloc de frontend.css (sélecteur exact), en unités de la règle. */
function rule(sheet: string, selector: string): string {
  // Le sélecteur entier : « .wheel-initial { » ne doit pas trouver la fin du bloc commun « .wheel-name,\n.wheel-initial {».
  const text = `\n${sheet}`;
  let at = text.indexOf(`\n${selector} {`);
  while (at > 0 && text[at - 1] === ',') at = text.indexOf(`\n${selector} {`, at + 1);
  assert.ok(at >= 0, `règle « ${selector} » introuvable`);
  return sheet.slice(at, sheet.indexOf('}', at));
}

function number(body: string, pattern: RegExp, what: string): number {
  const m = pattern.exec(body);
  assert.ok(m, `${what} introuvable`);
  return Number(m[1]);
}

/** Courbe de Bézier cubique de CSS : progression à la part x du temps. */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

test('roue sans logo : à chaque place, le nom (au centre) ou l’initiale (ailleurs) ne passe jamais sous 20 px, glissement compris', () => {
  const source = read('frontend.js');
  const literal = /const WHEELS = (\{[\s\S]*?\n\});/.exec(source);
  assert.ok(literal, 'WHEELS introuvable dans frontend.js');
  const wheels = vm.runInNewContext(`(${literal[1]})`) as Record<string, { face: number[]; box: number[][]; opacity: number[] }>;
  const sheet = css('frontend.css');
  // Corps dans le repère du bandeau (--w), avec un plancher en multiples de 20 px (--floor-text) :
  // max(calc(N * var(--w)), calc(var(--floor-text) * F)). En borne --w vaut --u ; au bureau, plus
  // étroit que 16:9, le bandeau rétrécit (--w jusqu'à 0,57 --u en 5:4) et seul le plancher tient.
  // Le pire cas est donc le plus petit des deux corps : N en borne, 20 × F au bureau étroit.
  const size = (selector: string, what: string) => {
    const body = rule(sheet, selector);
    const n = number(body, /font-size:\s*max\(calc\(([\d.]+) \* var\(--w\)\)/, what);
    const floor = number(body, /font-size:\s*max\(calc\([\d.]+ \* var\(--w\)\), calc\(var\(--floor-text\) \* ([\d.]+)\)\)/, `plancher du ${what}`);
    return Math.min(n, 20 * floor);
  };
  const name = size('.menu-band .wheel-name', 'corps du nom');
  const initial = size('.wheel-initial', 'corps de l’initiale');
  // Fondu : le nom s'éteint en `out` ms ; ce qui s'allume attend `delay` ms, puis prend `fadeIn` ms.
  const out = number(rule(sheet, '.wheel-name,\n.wheel-initial'), /transition:\s*opacity (\d+)ms linear;/, 'extinction du nom');
  const shown = rule(sheet, '.wheel-item.center .wheel-name,\n.wheel-item:not(.center) .wheel-initial');
  const fadeIn = number(shown, /transition:\s*opacity (\d+)ms linear \d+ms/, 'allumage');
  const delay = number(shown, /transition:\s*opacity \d+ms linear (\d+)ms/, 'attente de l’allumage');
  assert.ok(delay >= out, 'le nom et l’initiale ne se voient jamais ensemble : l’un s’allume quand l’autre est éteint');
  const stage = rule(sheet, '.wheel-stage.roue-medaillons,\n.wheel-stage.roue-bandeau,\n.wheel-stage.roue-minimal,\n.wheel-stage.roue-arche');
  const glide = number(stage, /--wheel-time:\s*(\d+)ms/, 'durée du glissement');
  const ease = /--wheel-ease:\s*cubic-bezier\(([^)]+)\)/.exec(stage)![1]!.split(',').map(Number) as [number, number, number, number];
  const progress = bezier(...ease);
  const problems: string[] = [];
  for (const [style, g] of Object.entries(wheels)) {
    const last = (g.box.length - 1) / 2;
    // Échelle d'un médaillon (carré, comme le disque d'un logo absent) à la place i (wheelPose).
    const scale = (i: number) => Math.min(...g.box[i]!) / Math.min(...g.face);
    // Toutes les places : celles du bord, invisibles au repos, se voient pendant qu'un médaillon entre ou sort.
    g.box.forEach((_, i) => {
      if (i !== last && initial * scale(i) < 20) problems.push(`${style} place ${i - last} : initiale à ${(initial * scale(i)).toFixed(1)} px`);
    });
    const center = scale(last);
    if (name * center < 20) problems.push(`${style} centre : nom à ${(name * center).toFixed(1)} px`);
    // Le nom qui quitte le centre (vers ±1), tant qu'il se voit (opacité d'au moins 5 %), et celui qui y arrive, dès qu'il se voit.
    const side = scale(last + 1);
    const leaving = center + (side - center) * progress(Math.min(1, (0.95 * out) / glide));
    if (name * leaving < 20) problems.push(`${style} : le nom qui quitte le centre se voit encore à ${(name * leaving).toFixed(1)} px`);
    const arriving = side + (center - side) * progress(Math.min(1, (delay + 0.05 * fadeIn) / glide));
    if (name * arriving < 20) problems.push(`${style} : le nom qui arrive au centre se voit déjà à ${(name * arriving).toFixed(1)} px`);
  }
  assert.deepEqual(problems, []);
});

test('roue sans logo : le médaillon porte le nom et l’initiale, la place du centre seule est marquée', () => {
  const { document, send } = menuRenderer();
  const state = menuState({ 'a.vpx': undefined, 'b.vpx': undefined, 'c.vpx': undefined }, { 'a.vpx': 'Éclair', 'b.vpx': 'l’Atlantide', 'c.vpx': '1941' });
  send(state);
  const items = [...document.querySelectorAll('.wheel-item')];
  assert.equal(items.length, 3);
  const initials = items.map((n) => n.querySelector('.wheel-initial')?.textContent);
  assert.deepEqual(initials, ['É', 'L', '1'], 'première lettre ou premier chiffre du titre, comme la case de logo de la liste');
  assert.deepEqual(items.map((n) => n.querySelector('.wheel-name')?.textContent), ['Éclair', 'l’Atlantide', '1941']);
  assert.deepEqual(items.map((n) => n.classList.contains('center')), [false, true, false]);
  // Un flipper : la table suivante passe au centre, la marque la suit.
  send({ ...state, position: 3, table: { title: '1941', subtitle: '' }, neighbors: state.neighbors.map((n) => ({ ...n, offset: n.offset - 1 })) });
  assert.deepEqual(items.map((n) => n.classList.contains('center')), [false, false, true]);
});

/** Planche du développeur (fallback-demo.html), jamais montrée sur un écran de la borne. */
const DEVELOPER_SHEETS = new Set(['fallback-demo.css']);

// Un corps en px fixes ne suit pas l'écran : 16 px restent 16 px en 4K (8 px de référence). Le
// bandeau de « Récupérer » (acquire.css), plus ancien que le design system, gardait ainsi des
// textes de 12 à 16 px dans un bandeau de 96 px, à toutes les tailles d'écran (29/10/2026).
test('feuilles : aucun corps de texte en px fixes (ils ne suivent pas la taille de l’écran)', () => {
  const offenders: string[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css') && !DEVELOPER_SHEETS.has(f))) {
    for (const [, selector, body] of css(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const [, value] of body!.matchAll(/(?:^|;)\s*font(?:-size)?:\s*([^;]+?)\s*(?:;|$)/gm)) {
        if (/(?:^|[\s(])[0-9.]+px\b/.test(value!)) offenders.push(`${file} ${selector!.trim().replace(/\s+/g, ' ')} : ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('feuilles : aucun corps de texte écrit sous 20 px (cqmin, vmin, et les unités du menu --u, --w, --b)', () => {
  const offenders: string[] = [];
  for (const file of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.css'))) {
    for (const [, selector, body] of css(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const [, value] of body!.matchAll(/(?:^|;)\s*font-size:\s*([^;]+?)\s*(?:;|$)/gm)) {
        // 20 px à la référence 1080 : 1,852cqmin (ou vmin), ou calc(20 * var(--u)) et ses pareils.
        const unit = /^([0-9.]+)(?:cqmin|vmin)$/.exec(value!);
        const menu = /^calc\(([0-9.]+) \* var\(--[uwb]\)\)$/.exec(value!);
        const px = unit ? (Number(unit[1]) * 1080) / 100 : menu ? Number(menu[1]) : undefined;
        if (px !== undefined && px < 20 - 1e-6) offenders.push(`${file} ${selector!.trim().replace(/\s+/g, ' ')} : ${value} (${px.toFixed(1)} px)`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

const electron = process.platform === 'win32' ? electronPath() : undefined;

/** Pages d'essai du garde-fou, dans une fenêtre de 1920 × 1080 (1 px = 1 px de référence). */
const CASES: Record<string, string> = {
  lisible: '<p style="font-size:30px">Texte lisible</p>',
  petit: '<p style="font-size:18px">Trop petit</p>',
  reduit: '<div style="transform:scale(0.5);transform-origin:0 0"><p style="font-size:30px">Médaillon réduit</p></div>',
  'pivote-reduit': '<div style="position:absolute;left:400px;top:200px;transform:rotate(90deg) scale(0.5)"><p style="font-size:30px;white-space:nowrap">Couché et réduit</p></div>',
  pivote: '<div style="position:absolute;left:400px;top:200px;transform:rotate(90deg)"><p style="font-size:30px;white-space:nowrap">Couché</p></div>',
  pulsation: '<style>@keyframes p { from { transform: scale(1) } to { transform: scale(0.5) } }</style><p style="font-size:32px;animation:p 2s infinite alternate">Pulsation trop forte</p>',
  'pulsation-lisible': '<style>@keyframes p { from { transform: scale(1) } to { transform: scale(0.6) } }</style><p style="font-size:40px;animation:p 2s infinite alternate">Pulsation lisible</p>',
  eteint: '<div style="opacity:0;transform:scale(0.3)"><p style="font-size:30px">Éteint</p></div>',
  'dernier-recours': '<div data-below-floor><p style="font-size:16px">Dernier recours</p></div>',
  repli: '<div class="cp-fb cp-fb-loading"><p style="font-size:14px">Média dessiné</p></div>',
  clip: '<div style="position:absolute;left:0;top:100px;width:1000px;height:200px;clip-path:inset(0 10% 0 10%)"><p style="position:absolute;left:-80px;margin:0;font-size:30px;white-space:nowrap">Entre par le bord</p></div>',
};

const BENCH = String.raw`
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const { checkLayout } = require(process.env.CP_LAYOUT_CHECK);
const cases = JSON.parse(fs.readFileSync(process.env.CP_CASES, 'utf8'));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  // Jamais montrée : rendu hors écran.
  const win = new BrowserWindow({ show: false, frame: false, skipTaskbar: true, focusable: false, width: 1920, height: 1080, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  // Plus grande que la zone de travail de l'écran du poste : Windows la ramènerait dedans.
  win.setBounds({ x: 0, y: 0, width: 1920, height: 1080 });
  const out = {};
  for (const [name, body] of Object.entries(cases)) {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><body style="margin:0">' + body));
    await new Promise((r) => setTimeout(r, 300));
    out[name] = await checkLayout(win.webContents);
  }
  out.window = await win.webContents.executeJavaScript('[innerWidth, innerHeight]');
  fs.writeFileSync(process.env.CP_OUT, JSON.stringify(out));
  app.exit(0);
});
`;

test('garde-fou : un texte réduit par un transform ou une pulsation est signalé sous 20 px, pas un texte éteint ni un dernier recours déclaré', { skip: electron ? false : 'Electron sous Windows requis', timeout: 180_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-plancher-'));
  try {
    const script = path.join(dir, 'banc.cjs');
    fs.writeFileSync(script, BENCH);
    fs.writeFileSync(path.join(dir, 'cas.json'), JSON.stringify(CASES));
    const env: NodeJS.ProcessEnv = { ...process.env, CP_LAYOUT_CHECK: path.join(APP, 'dist', 'layout-check.js'), CP_CASES: path.join(dir, 'cas.json'), CP_OUT: path.join(dir, 'out.json') };
    delete env.ELECTRON_RUN_AS_NODE;
    const run = spawnSync(electron!, [script, `--user-data-dir=${path.join(dir, 'chromium')}`], { env, encoding: 'utf8', timeout: 170_000, windowsHide: true });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const found = JSON.parse(fs.readFileSync(path.join(dir, 'out.json'), 'utf8')) as Record<string, string[]>;
    assert.deepEqual(found.window, [1920, 1080]);
    const small = (name: string) => found[name]!.filter((p) => p.startsWith('texte plus petit que 20 px'));
    assert.deepEqual(found.lisible, []);
    assert.match(small('petit').join('\n'), /\(18\.0 px\)/);
    assert.match(small('reduit').join('\n'), /\(15\.0 px\) : p « Médaillon réduit »/, 'réduit par le transform d’un ancêtre');
    assert.match(small('pivote-reduit').join('\n'), /\(15\.0 px\)/, 'couché d’un quart de tour et réduit');
    assert.deepEqual(found.pivote, [], 'couché sans être réduit : lisible');
    assert.match(small('pulsation').join('\n'), /\(16\.0 px\)/, 'pulsation en boucle : comptée à son pas le plus petit, quel que soit l’instant du relevé');
    assert.deepEqual(found['pulsation-lisible'], []);
    assert.deepEqual(found.eteint, [], 'un texte éteint ne se voit pas');
    assert.deepEqual(found['dernier-recours'], [], 'dernier recours déclaré (data-below-floor)');
    assert.deepEqual(found.repli, [], 'repli d’un média (.cp-fb) : un média dessiné, à la taille de sa zone');
    assert.deepEqual(found.clip, [], 'ce que coupe un clip-path: inset() ne sort pas de la fenêtre');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('garde-fou : la règle du plancher des textes est branchée sur le rendu réel', () => {
  const guard = fs.readFileSync(path.join(APP, 'src', 'layout-check.ts'), 'utf8');
  assert.match(guard, /texte plus petit que 20 px/);
  assert.match(guard, /glyphScale\(el\)/, 'corps multiplié par l’échelle des transform');
  assert.match(guard, /iterations !== Infinity/, 'animation en boucle : son pas le plus petit');
  // Le banc des noms de la roue relève aussi en plein glissement, et échoue si la mesure voit ce que le garde-fou tait.
  const bench = fs.readFileSync(path.join(REPO, 'docs', 'demo-noms-roue.cjs'), 'utf8');
  assert.match(bench, /'glissement', 1, 90/);
  assert.match(bench, /que le garde-fou ne signale pas/);
});
