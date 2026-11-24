// Mode débogage (23/11/2026) : le réglage, l'écran qui porte les mesures, la lecture des lignes du plugin de VPX, et
// ce que la fenêtre montre dans chaque état : compact, détaillé hors
// partie, lancement, partie fluide, à-coups, partie calée sur un écran lent. Le texte vient de t() : aucun « vous »
// (tutoiement, décision du 23/11/2026), aucune valeur colorée quand tout va bien.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  buildDebugView,
  cadenceBars,
  chooseDebugRole,
  debugDuration,
  debugLayout,
  debugReportJson,
  DebugRing,
  fpsTone,
  nextDebugMode,
  nextDebugScreen,
  normalizeDebugSettings,
  parseLiveCadence,
  parseStallLine,
  readDebugSettings,
  stallCause,
  writeDebugSettings,
  type DebugInput,
  type DebugSample,
  type DebugView,
} from '../debogage';
import { gameNoticeBounds } from '../gamenotice';
import { setLanguage } from '../i18n';
import type { RoleId, Rotation } from '../model';
import { REPO_ROOT } from './i18n-scan';
import { frontendSource } from './frontend-source';

setLanguage('fr');

function sample(at: number, over: Partial<DebugSample> = {}): DebugSample {
  return { at, phase: 'menu', cpu: 9, ramUsedMb: 7400, ramTotalMb: 16000, screens: {}, ...over };
}

const SCREENS: DebugInput['screens'] = [
  { role: 'playfield', width: 2160, height: 3840, hz: 60 },
  { role: 'backglass', width: 1920, height: 1080, hz: 60 },
  { role: 'dmd', width: 1280, height: 390, hz: 60 },
];

function menuSamples(over: (s: DebugSample) => void = () => undefined): DebugSample[] {
  const s = sample(1000, { screens: { playfield: { fps: 60, worstMs: 18, hz: 60, width: 2160, height: 3840 }, backglass: { fps: 60, worstMs: 17, hz: 60, width: 1920, height: 1080 }, dmd: { fps: 60, worstMs: 17, hz: 60, width: 1280, height: 390 } } });
  over(s);
  return [s];
}

function gameSamples(fps: (i: number) => number, stalls: (i: number) => number = () => 0, n = 60): DebugSample[] {
  return Array.from({ length: n }, (_, i) => sample(i * 1000, { phase: 'playing', vpx: { cpu: 22, memMb: 2100 }, game: { fps: fps(i), p50: 8, p99: 11, max: 14, stalls: stalls(i), memMb: 2100 } }));
}

function base(over: Partial<DebugInput>): DebugInput {
  return { mode: 'detailed', role: 'backglass', phase: 'menu', inGame: false, now: 60_000, since: 0, samples: menuSamples(), screens: SCREENS, ...over };
}

/** Tous les textes d'une vue, pour les contrôles de vocabulaire. */
function texts(view: DebugView): string[] {
  const out: string[] = [view.head.name, view.head.context, view.head.time];
  for (const p of view.parts) out.push(p.text, p.muted ?? '');
  for (const b of view.blocks) {
    out.push(b.title, 'sub' in b ? (b.sub ?? '') : '');
    if (b.kind === 'cadence') out.push(b.status, b.about, b.unit, ...b.stats.flatMap((s) => [s.label, s.value]), b.alert?.text ?? '');
    if (b.kind === 'screens') out.push(...b.cols, ...b.rows.flatMap((r) => [r.name, r.detail ?? '', ...r.cells.map((c) => c.text)]), b.alert?.text ?? '');
    if (b.kind === 'kv') out.push(...b.rows.flatMap((r) => [r.k, r.s ?? '', r.v]));
    if (b.kind === 'chrono') out.push(...b.rows.flatMap((r) => [r.k, r.small ?? '', r.v]), b.note ?? '');
  }
  return out;
}

test('réglage : valeurs par défaut sûres, relues, écrites, illisible = désactivé', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debogage-'));
  try {
    assert.deepEqual(readDebugSettings(dir), { mode: 'off', screen: 'auto', inGame: true, attach: true }, 'rien d’écrit : éteint');
    writeDebugSettings(dir, { mode: 'detailed', screen: 'dmd', inGame: false, attach: false });
    assert.deepEqual(readDebugSettings(dir), { mode: 'detailed', screen: 'dmd', inGame: false, attach: false });
    fs.writeFileSync(path.join(dir, 'debogage.json'), '{ pas du json');
    assert.equal(readDebugSettings(dir).mode, 'off', 'fichier illisible : éteint');
    assert.deepEqual(normalizeDebugSettings({ mode: 'turbo', screen: 'plafond', inGame: 'oui', attach: 3 }), { mode: 'off', screen: 'auto', inGame: true, attach: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('les choix tournent : affichage et écran reviennent au début', () => {
  assert.deepEqual(['off', 'compact', 'detailed'].map((m) => nextDebugMode(m as 'off')), ['compact', 'detailed', 'off']);
  let s = nextDebugScreen('auto');
  const seen = [s];
  while (s !== 'auto') seen.push((s = nextDebugScreen(s)));
  assert.deepEqual(seen.slice(0, -1), ['backglass', 'dmd', 'topper', 'playfield'], 'automatique, puis chaque écran');
});

test('l’écran : automatique = backglass, sinon DMD, sinon playfield ; un écran choisi mais absent revient à l’automatique', () => {
  const all: RoleId[] = ['playfield', 'backglass', 'dmd', 'topper'];
  assert.equal(chooseDebugRole('auto', all), 'backglass');
  assert.equal(chooseDebugRole('auto', ['playfield', 'dmd']), 'dmd');
  assert.equal(chooseDebugRole('auto', ['playfield']), 'playfield');
  assert.equal(chooseDebugRole('topper', all), 'topper');
  assert.equal(chooseDebugRole('topper', ['playfield', 'backglass']), 'backglass', 'pas de topper : retour à l’automatique');
  assert.equal(chooseDebugRole('auto', []), undefined);
});

test('la forme : le DMD n’a que la bande, le détaillé du playfield en partie est réduit, éteint = rien', () => {
  assert.equal(debugLayout('off', 'backglass', false), undefined);
  assert.equal(debugLayout('detailed', 'dmd', false), 'bar');
  assert.equal(debugLayout('compact', 'dmd', true), 'bar');
  assert.equal(debugLayout('compact', 'playfield', true), 'compact');
  assert.equal(debugLayout('detailed', 'playfield', false), 'detailed', 'hors partie, le plateau a la place');
  assert.equal(debugLayout('detailed', 'playfield', true), 'reduced', 'en partie, le panneau ne cache pas la table');
  assert.equal(debugLayout('detailed', 'backglass', true), 'detailed');
});

test('lignes du plugin de VPX : cadence de la seconde et à-coup', () => {
  const live = parseLiveCadence('[2026-11-23 20:10:11.123] I: Cadence live: fps=119.3 p50=8ms p99=11ms max=14ms stalls=0 mem=2100MB');
  assert.deepEqual(live, { fps: 119.3, p50: 8, p99: 11, max: 14, stalls: 0, memMb: 2100 });
  assert.equal(parseLiveCadence('Cadence live: fps=60.0 p50=17ms p99=17ms max=17ms stalls=0 mem=-1MB')?.memMb, undefined, 'mémoire illisible : absente');
  assert.equal(parseLiveCadence('Cadence running: frames=3 duration=1.0s fps=60.0'), undefined, 'le bilan de la minute n’est pas la ligne live');
  assert.equal(parseLiveCadence('Cadence live: fps=60 p50=17ms'), undefined, 'ligne incomplète');
  const stall = parseStallLine('Cadence: stall of 850 ms at 123.4s; main thread in MPCLIENT.DLL 7 ; under ntdll 3');
  assert.deepEqual(stall, { ms: 850, atS: 123.4, module: 'MPCLIENT.DLL' });
  assert.equal(parseStallLine('Cadence: stall of 120 ms at 9.0s')?.module, undefined);
  assert.match(stallCause('MPCLIENT.DLL') ?? '', /antivirus/);
  assert.match(stallCause('avcodec-61.dll') ?? '', /vidéo/);
  assert.equal(stallCause('kernel32.dll'), undefined, 'rien d’assez sûr : pas de cause inventée');
  assert.equal(stallCause(undefined), undefined);
});

test('une cadence est jugée sur celle visée : 90 % bon, 60 % ralenti, en dessous bloquant', () => {
  assert.equal(fpsTone(119, 120), 'ok');
  assert.equal(fpsTone(100, 120), 'av');
  assert.equal(fpsTone(51, 120), 'ko');
  assert.equal(fpsTone(10, undefined), 'ok', 'sans cadence visée : rien à juger');
  assert.equal(debugDuration(140), '140 ms');
  assert.equal(debugDuration(1900), '1,9 s');
});

test('les échantillons : une minute à la fois, les plus anciens partent, le rapport ne garde que les mesures', () => {
  const ring = new DebugRing(5);
  for (let i = 0; i < 8; i++) ring.push(sample(i));
  assert.equal(ring.samples().length, 5);
  assert.equal(ring.samples()[0]!.at, 3);
  assert.equal(debugReportJson(new DebugRing(), { version: '0.2.4', at: 0 }), undefined, 'aucune mesure : pas de fichier');
  const json = JSON.parse(debugReportJson(ring, { version: '0.2.4', at: Date.UTC(2026, 10, 23) })!);
  assert.equal(json.format, 1);
  assert.equal(json.seconds, 5);
  assert.equal(json.at, '2026-11-23T00:00:00.000Z');
  // Rien de personnel : ni chemin, ni nom de PC dans le fichier.
  assert.ok(!/C:\\|Users|\\\\/.test(JSON.stringify(json)));
});

test('hors partie, compact : les trois cadences, le processeur, la mémoire ; pastille verte quand tout va bien', () => {
  const view = buildDebugView(base({ mode: 'compact' }))!;
  assert.equal(view.layout, 'compact');
  assert.equal(view.tone, 'ok');
  assert.equal(view.parts[0]!.text, 'PF 60 · BG 60 · DMD 60');
  assert.equal(view.parts[0]!.muted, 'i/s');
  assert.equal(view.parts[0]!.tone, undefined, 'rien de coloré quand tout va bien');
  assert.deepEqual(view.parts.slice(1).map((p) => p.text), ['CPU 9 %', 'RAM 46 %']);
  assert.equal(view.blocks.length, 0, 'le compact n’a aucun bloc');
});

test('hors partie, détaillé : chaque écran, le chargement des médias, le système ; un écran qui rame est coloré', () => {
  const samples = menuSamples((s) => {
    s.screens.backglass = { fps: 24, worstMs: 410, hz: 60, width: 1920, height: 1080 };
    s.screens.playfield = { fps: 47, worstMs: 96, hz: 60, width: 2160, height: 3840 };
    s.cpu = 75;
  });
  const view = buildDebugView(base({ samples, media: { table: 'Atlas Rising', rows: [{ role: 'playfield', kind: 'vidéo', ms: 160 }, { role: 'backglass', kind: 'vidéo', ms: 1900 }] }, gpu: { name: 'GTX 1050', vramMb: 2048 } }))!;
  assert.equal(view.layout, 'detailed');
  assert.equal(view.tone, 'ko');
  const screens = view.blocks.find((b) => b.kind === 'screens')!;
  assert.ok(screens.kind === 'screens');
  const row = (name: string) => screens.rows.find((r) => r.name === name)!;
  assert.equal(row('Backglass').cells[1]!.tone, 'ko', '24 i/s sur 60 Hz : bloquant');
  assert.equal(row('Playfield').cells[1]!.tone, 'av', '47 i/s sur 60 Hz : ralenti');
  assert.equal(row('DMD').cells[1]!.tone, undefined, 'le DMD va bien : clair');
  assert.equal(row('Topper').absent, true, 'un écran absent reste dit, grisé');
  assert.equal(row('Backglass').detail, '1920 × 1080');
  const kv = view.blocks.filter((b) => b.kind === 'kv');
  const loading = kv[0]!;
  assert.ok(loading.kind === 'kv');
  assert.equal(loading.sub, 'Atlas Rising');
  assert.equal(loading.rows.at(-1)!.v, '1,9 s', 'la table est à l’écran quand le plus lent est prêt');
  assert.equal(loading.rows.at(-1)!.tone, 'ko');
  const system = kv.at(-1)!;
  assert.ok(system.kind === 'kv');
  assert.equal(system.rows.find((r) => r.k === 'Processeur')!.tone, 'av', '75 % : chargé');
  assert.equal(system.rows.find((r) => r.k === 'Carte graphique')!.s, 'GTX 1050');
});

test('lancement : chaque étape avec son temps, celle qui attend en cours, les suivantes grisées', () => {
  const view = buildDebugView(base({ phase: 'loading', inGame: true, since: 55_000, table: 'Midnight Circuit', launch: { steps: [{ label: 'Préparation', detail: 'INI, ROM, DMD', ms: 300 }, { label: 'VPX charge la table', current: true, ms: 3400 }, { label: 'VPX finit de charger' }], previousMs: 7300 } }))!;
  assert.equal(view.head.context, 'Lancement · Midnight Circuit');
  assert.equal(view.head.time, '5,0 s');
  const chrono = view.blocks.find((b) => b.kind === 'chrono')!;
  assert.ok(chrono.kind === 'chrono');
  assert.deepEqual(chrono.rows.map((r) => [r.state, r.v]), [['ok', '300 ms'], ['current', '3,4 s'], ['wait', '–']]);
  assert.equal(chrono.note, 'Lancement précédent de cette table : 7,3 s.');
});

test('partie fluide : la cadence, la minute en barres, rien d’alarmant, rien de coloré', () => {
  const view = buildDebugView(base({ phase: 'playing', inGame: true, table: 'Atlas Rising', samples: gameSamples((i) => 117 + (i % 3)), target: 120 }))!;
  const cadence = view.blocks.find((b) => b.kind === 'cadence')!;
  assert.ok(cadence.kind === 'cadence');
  assert.equal(cadence.value, '119');
  assert.equal(cadence.status, 'Fluide');
  assert.equal(cadence.statusTone, undefined);
  assert.equal(cadence.bars.length, 60);
  assert.ok(cadence.bars.every((b) => b.tone === 'ok' && !b.stall));
  assert.equal(cadence.scale, 120);
  assert.equal(cadence.alert, undefined);
  assert.equal(cadence.about, 'Playfield à 120 Hz');
  assert.equal(view.parts[0]!.text, 'VPX 119');
  assert.equal(view.parts[0]!.muted, 'i/s · 120 Hz');
  assert.equal(view.parts[1]!.text, 'À-coups 0');
});

test('partie avec à-coups : les secondes marquées, le dernier décrit avec sa cause, sans nom de module', () => {
  const stalls = new Set([5, 14, 22, 29, 36, 41, 47]);
  const samples = gameSamples((i) => (stalls.has(i) ? 96 : 116), (i) => (stalls.has(i) ? 1 : 0));
  const view = buildDebugView(base({ phase: 'playing', inGame: true, table: 'Atlas Rising', samples, target: 120, now: 100_000, stall: { ms: 850, at: 88_000, cause: stallCause('MPCLIENT.DLL') } }))!;
  const cadence = view.blocks.find((b) => b.kind === 'cadence')!;
  assert.ok(cadence.kind === 'cadence');
  assert.equal(cadence.status, '7 à-coups en 1 min');
  assert.equal(cadence.statusTone, 'av');
  assert.equal(cadence.bars.filter((b) => b.stall).length, 7, 'un repère par seconde à-coup : la moyenne cacherait un gel bref');
  assert.equal(cadence.alert?.text, 'À-coup de 850 ms, il y a 12 s : l’antivirus de Windows analysait le script de la table.');
  assert.equal(cadence.alert?.tone, 'ko');
  assert.ok(!texts(view).some((x) => /MPCLIENT|\.dll/i.test(x)), 'le nom du module reste dans le rapport');
  assert.equal(view.parts[1]!.text, 'À-coups 7');
});

test('partie calée sur un écran lent : le cas d’Eric (backglass à 50 Hz) est dit en tête, en rouge', () => {
  const view = buildDebugView(base({ phase: 'playing', inGame: true, table: 'Batman', samples: gameSamples(() => 51), target: 120, cap: { name: 'Backglass', hz: 50 } }))!;
  const cadence = view.blocks.find((b) => b.kind === 'cadence')!;
  assert.ok(cadence.kind === 'cadence');
  assert.equal(cadence.status, 'Cadence basse');
  assert.equal(cadence.tone, 'ko');
  assert.equal(cadence.alert?.tone, 'ko');
  assert.match(cadence.alert!.text, /Calée sur Backglass \(50 Hz\)/);
  assert.equal(view.tone, 'ko');
});

test('le playfield en partie : le détaillé est réduit (la cadence, le diagnostic, le système), sans tableau des écrans', () => {
  const view = buildDebugView(base({ role: 'playfield', phase: 'playing', inGame: true, table: 'Batman', samples: gameSamples(() => 119), target: 120 }))!;
  assert.equal(view.layout, 'reduced');
  assert.deepEqual(view.blocks.map((b) => b.kind), ['cadence', 'kv']);
});

test('le DMD : une bande, jamais de bloc', () => {
  const view = buildDebugView(base({ role: 'dmd', phase: 'playing', inGame: true, samples: gameSamples(() => 119), target: 120 }))!;
  assert.equal(view.layout, 'bar');
  assert.equal(view.blocks.length, 0);
});

test('partie sans cadence encore dite (plugin plus ancien) : la ligne le dit, sans inventer de chiffre', () => {
  const samples = [sample(0, { phase: 'playing' })];
  const view = buildDebugView(base({ mode: 'compact', phase: 'playing', inGame: true, samples, target: 120 }))!;
  assert.equal(view.parts[0]!.text, 'VPX');
  assert.equal(view.parts[0]!.muted, 'en attente de la cadence');
  const detailed = buildDebugView(base({ phase: 'playing', inGame: true, samples, target: 120 }))!;
  const cadence = detailed.blocks.find((b) => b.kind === 'cadence')!;
  assert.ok(cadence.kind === 'cadence');
  assert.equal(cadence.value, '–');
  assert.equal(cadence.bars.length, 0);
});

test('les barres de la minute ne gardent que 60 secondes, la plus récente à droite', () => {
  const bars = cadenceBars(gameSamples((i) => i, () => 0, 90), 120);
  assert.equal(bars.length, 60);
  assert.equal(bars.at(-1)!.v, 89);
});

test('textes : tutoiement, aucun « vous », en français comme en anglais', () => {
  const inputs: DebugInput[] = [
    base({ cap: undefined }),
    base({ phase: 'playing', inGame: true, samples: gameSamples(() => 51), target: 120, cap: { name: 'Backglass', hz: 50 } }),
    base({ phase: 'loading', inGame: true, launch: { steps: [{ label: 'Préparation', ms: 1 }] } }),
  ];
  for (const lang of ['fr', 'en'] as const) {
    setLanguage(lang);
    for (const input of inputs) for (const text of texts(buildDebugView(input)!)) assert.ok(!/\b(vous|votre|vos)\b/i.test(text), `${lang} : « ${text} »`);
  }
  setLanguage('fr');
});

test('en anglais : la vue se traduit, les unités aussi', () => {
  setLanguage('en');
  try {
    const view = buildDebugView(base({ phase: 'playing', inGame: true, table: 'Atlas Rising', samples: gameSamples(() => 119), target: 120 }))!;
    assert.equal(view.head.name, 'DEBUG');
    assert.equal(view.head.context, 'Game · Atlas Rising');
    assert.equal(view.parts[0]!.muted, 'fps · 120 Hz');
    const cadence = view.blocks.find((b) => b.kind === 'cadence')!;
    assert.ok(cadence.kind === 'cadence');
    assert.equal(cadence.status, 'Smooth');
    assert.deepEqual(cadence.axis, ['−60 s', '−30 s', 'now']);
  } finally {
    setLanguage('fr');
  }
});

test('la fenêtre se pose dans le coin haut droit du joueur, dans l’écran, dans les quatre sens du plateau, jamais sur le coin des invitations', () => {
  const zone = { x: 100, y: 50, width: 2160, height: 3840 };
  const size = { width: 648, height: 880 };
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const right = gameNoticeBounds(zone, rotation, size, 24, 'top-right');
    const left = gameNoticeBounds(zone, rotation, { width: 560, height: 172 }, 24, 'top-left');
    assert.ok(right.x >= zone.x && right.y >= zone.y && right.x + right.width <= zone.x + zone.width && right.y + right.height <= zone.y + zone.height, `dans l’écran à ${rotation}°`);
    const hit = right.x < left.x + left.width && left.x < right.x + right.width && right.y < left.y + left.height && left.y < right.y + right.height;
    assert.ok(!hit, `à ${rotation}°, la fenêtre ne recouvre pas la carte d’invitation (coin haut gauche)`);
  }
  // Droit : tout en haut, à droite, sous la barre du joueur quand on la lui laisse.
  const up = gameNoticeBounds(zone, 0, size, 24, 'top-right', 100);
  assert.equal(up.x + up.width, zone.x + zone.width - 24);
  assert.equal(up.y, zone.y + 24 + 100);
});

test('sources : la fenêtre est celle des notifications de partie (sans focus, clics traversants), retirée avant closeTopmostWindows, jamais au premier plan par elle-même', () => {
  const own = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'debogage.ts'), 'utf8');
  assert.match(own, /overlay\(at\.bounds, key, \(\) => void 0, 'debogage\.html'\)/, 'la fenêtre vient de overlay() (game-notice.ts) : transparente, focusable: false, setIgnoreMouseEvents, setContentProtection');
  assert.ok(!/setAlwaysOnTop|alwaysOnTop|\.focus\(\)|showInactive\(\)\.focus/.test(own), 'aucun premier plan ni focus demandé ici');
  const notice = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'game-notice.ts'), 'utf8');
  assert.match(notice, /focusable: false/);
  assert.match(notice, /setIgnoreMouseEvents\(true\)/);
  const front = frontendSource();
  assert.ok(front.indexOf('  debug.releaseWindow();') > 0 && front.indexOf('  debug.releaseWindow();') < front.indexOf('  closeTopmostWindows();'), 'retirée juste avant closeTopmostWindows : pas de ligne « fermée, elle restait au premier plan » à chaque partie');
  // Éteint, rien ne tourne : pas de minuterie sans mode allumé.
  assert.match(own, /if \(enabled\(\)\) start\(\);/);
  assert.match(own, /if \(!enabled\(\)\) return stop\(\);/);
});

// Incident du PinCab (24/11/2026) : le mode débogage, allumé, faisait sa première mesure dans createDebug, c'est-à-dire
// pendant l'initialisation de frontend.ts, avant `vrFront` (déclaré plus bas ; `undefined` dans l'application assemblée) :
// « A JavaScript error occurred in the main process », et la borne restait sur cette boîte d'erreur au démarrage.
// Invariant : rien n'est lu de l'hôte pendant createDebug, et une mesure en échec est dite au journal, jamais lancée.
test('mode débogage : première mesure après l’initialisation de l’appelant, mesure en échec sans erreur lancée', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debogage-init-'));
  writeDebugSettings(dir, { ...readDebugSettings(dir), mode: 'compact' });
  const Module = require('node:module') as { _load: (request: string, ...rest: unknown[]) => unknown };
  const realLoad = Module._load;
  const electron = { app: { getAppMetrics: () => [] }, ipcMain: { on: () => undefined }, BrowserWindow: class {} };
  Module._load = function (this: unknown, request: string, ...rest: unknown[]) {
    return request === 'electron' ? electron : realLoad.call(this, request, ...rest);
  };
  // Le module de l'application (app/dist), pas celui du cœur : il appelle Electron, ici remplacé par une doublure.
  const id = path.join(REPO_ROOT, 'app', 'dist', 'debogage.js');
  const cached = require.cache[id];
  delete require.cache[id];
  let debug: { close(): void } | undefined;
  try {
    const { createDebug } = require(id) as { createDebug(host: Record<string, unknown>): { close(): void } };
    const lines: string[] = [];
    let hostCalls = 0;
    debug = createDebug({
      dataDir: dir,
      version: '0.0.0',
      place: () => undefined,
      displays: () => [],
      phase: () => {
        hostCalls++;
        return 'menu';
      },
      // Comme `vrFront.vrGameStop` avant que `vrFront` existe.
      vr: () => {
        hostCalls++;
        throw new TypeError("Cannot read properties of undefined (reading 'vrGameStop')");
      },
      windows: () => new Map(),
      table: () => undefined,
      gpu: () => undefined,
      log: (line: string) => lines.push(line),
    });
    assert.equal(hostCalls, 0, 'createDebug ne lit rien de l’hôte : la première mesure attend la fin de l’initialisation');
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(hostCalls > 0, 'la première mesure suit, au tour d’après');
    assert.ok(lines.some((l) => l.includes('mesure en échec') && l.includes('vrGameStop')), `l’échec est dit au journal : ${JSON.stringify(lines)}`);
  } finally {
    debug?.close();
    Module._load = realLoad;
    delete require.cache[id];
    if (cached) require.cache[id] = cached;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});