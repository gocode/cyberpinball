// Pré-réglages VPX : état par configuration, choix explicite, sauvegarde personnelle et apprentissage attribué.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test, type TestContext } from 'node:test';
import { IniDocument, initialQuality, QUALITY_AUTO, QUALITY_KEYS, qualitySettings, t, writeFileAtomic, type QualityChoice, type QualityLevel, type QualityState } from '../index';
import { REPO_ROOT } from './i18n-scan';

interface PresetsView {
  actions: { label: string; tone?: string; run(): void }[];
}
interface PresetsHost {
  library: { openCustom(build: () => PresetsView, at?: number): void; openSystem(): void };
  dataDir(): string;
  iniPath(): string;
}
const app = require(path.join(REPO_ROOT, 'app', 'dist', 'qualite-vpx.js')) as {
  prepareQuality(dataDir: string, iniPath: string, gameIniPath?: string): string | undefined;
  chooseQuality(dataDir: string, iniPath: string, choice: QualityChoice): QualityLevel | undefined;
  readQualityState(dataDir: string, iniPath?: string): QualityState | undefined;
  qualityAfterGame(dataDir: string, lines: readonly string[], iniPath?: string, tableFile?: string): string | undefined;
  createVpxPresetsMenu(host: PresetsHost): { item: { readonly detail?: string }; open(): void };
};
const facts = require(path.join(REPO_ROOT, 'app', 'dist', 'tech-facts.js')) as { saveTechFacts(dataDir: string, value: unknown): void };
const keyOf = (file: string) => path.resolve(file).toLowerCase();
const readIni = (file: string) => IniDocument.parse(fs.readFileSync(file, 'utf8'));
const end = (p95Ms = 20) => [`GPU frame end: frames=30000 mean=1.00ms p50=1.00ms p95=${p95Ms.toFixed(2)}ms max=30.00ms budget=8.34ms`];
const machine = { vramMb: 8 * 1024, width: 1920, height: 1080, hz: 60 };
const game = { at: '2026-01-01T12:00:00.000Z', level: 'equilibre', load: 0.3, frames: 30000 };

function fixture(ctx: TestContext, text = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-vpx-etat-'));
  ctx.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  const a = path.join(root, 'configuration-a.ini');
  const b = path.join(root, 'configuration-b.ini');
  const copy = path.join(root, 'copie.ini');
  const stateFile = path.join(dataDir, 'qualite-vpx.json');
  writeFileAtomic(a, text);
  writeFileAtomic(b, '');
  facts.saveTechFacts(dataDir, { at: new Date().toISOString(), pc: { gpus: [{ name: 'Carte de test', memory: 8 * 1024 ** 3 }] }, displays: [{ role: 'playfield', name: 'Écran de test', width: machine.width, height: machine.height, hz: machine.hz, rotation: 0, primary: true }] });
  const save = (value: unknown) => writeFileAtomic(stateFile, JSON.stringify(value));
  const stored = () => JSON.parse(fs.readFileSync(stateFile, 'utf8')) as { active?: string; configurations: Record<string, QualityState> };
  const seed = (value: unknown) => save({ active: keyOf(a), configurations: { [keyOf(a)]: value } });
  return { root, dataDir, a, b, copy, stateFile, save, stored, seed };
}

function menu(dataDir: string, iniPath: () => string) {
  let view: PresetsView | undefined;
  const presets = app.createVpxPresetsMenu({ dataDir: () => dataDir, iniPath, library: { openCustom: (build) => { view = build(); }, openSystem() {} } });
  return { presets, view: () => { presets.open(); assert.ok(view); return view; } };
}

for (const text of ['', '[Player]\nBGSet = 1\n', '[Player]\nAAFactor = 1.25\nFXAA = 3\n']) {
  test(`sans choix explicite : Personnalisé, INI inchangé (${text.length} caractères)`, (ctx) => {
    const b = fixture(ctx, text);
    const ui = menu(b.dataDir, () => b.a);
    assert.equal(ui.presets.item.detail, t('Personnalisé'));
    assert.equal(ui.view().actions.find((a) => a.label === t('Personnalisé'))?.tone, 'ok');
    assert.equal(fs.existsSync(b.stateFile), false, 'ouvrir les pré-réglages ne persiste rien');
    app.prepareQuality(b.dataDir, b.a);
    assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'custom');
    assert.equal(fs.readFileSync(b.a, 'utf8'), text);
    app.qualityAfterGame(b.dataDir, end(), b.a);
    assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'custom');
    app.chooseQuality(b.dataDir, b.a, 'auto');
    assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'auto', 'Auto demande un choix explicite');
  });
}

test('A/B : choix, écritures et apprentissage isolés ; les anciens appels suivent le dernier actif', (ctx) => {
  const b = fixture(ctx);
  app.chooseQuality(b.dataDir, b.a, 'auto');
  writeFileAtomic(b.b, '[Player]\nFXAA = 3\n');
  app.prepareQuality(b.dataDir, b.b);
  assert.equal(app.readQualityState(b.dataDir, b.b)?.choice, 'custom');
  assert.equal(readIni(b.b).get('Player', 'FXAA'), '3');
  assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'auto');
  app.chooseQuality(b.dataDir, b.b, 'auto');
  const beforeB = app.readQualityState(b.dataDir, b.b);
  assert.equal(app.readQualityState(b.dataDir, b.a.toUpperCase())?.choice, 'auto');
  assert.deepEqual(app.readQualityState(b.dataDir), beforeB, 'une lecture de A ne change pas le dernier actif B');
  assert.equal(app.readQualityState(b.dataDir, b.copy), undefined, 'aucun repli vers une autre configuration');
  app.qualityAfterGame(b.dataDir, end(), b.a);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.level, 'performance');
  assert.deepEqual(app.readQualityState(b.dataDir, b.b), beforeB);
  app.prepareQuality(b.dataDir, b.a);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'auto', 'adaptation non confondue avec un changement manuel');
  app.prepareQuality(b.dataDir, b.b);
  assert.equal(app.readQualityState(b.dataDir, b.b)?.choice, 'auto', 'B ne compare pas ses valeurs à celles de A');
  app.qualityAfterGame(b.dataDir, end());
  assert.equal(app.readQualityState(b.dataDir, b.b)?.level, 'performance');
  assert.equal(b.stored().active, keyOf(b.b));
  assert.deepEqual(Object.keys(b.stored().configurations).sort(), [keyOf(b.a), keyOf(b.b)].sort());
  app.chooseQuality(b.dataDir, b.a, 'custom');
  assert.equal(app.readQualityState(b.dataDir, b.a)?.written, undefined);
  assert.ok(app.readQualityState(b.dataDir, b.b)?.written, 'la référence des réglages de B reste à B');
});

test('JSON incorrect : ignorer les états invalides sans toucher à la configuration valide voisine', (ctx) => {
  const b = fixture(ctx, '[Player]\nFXAA = 3\n');
  for (const text of ['{', 'null', '[]', 'false', '{"configurations":[]}']) {
    writeFileAtomic(b.stateFile, text);
    assert.equal(app.readQualityState(b.dataDir), undefined, text);
    assert.equal(app.readQualityState(b.dataDir, b.a), undefined, text);
    assert.doesNotThrow(() => app.qualityAfterGame(b.dataDir, end(), b.a));
  }
  const invalid: unknown[] = [
    null, [], { choice: 'invalide' }, { choice: 1 },
    { choice: 'auto', level: 'invalide' }, { choice: 'auto', ceiling: 'invalide' },
    { choice: 'auto', trial: 'true' }, { choice: 'auto', trial: true },
    { choice: 'auto', machine: [] }, { choice: 'auto', machine: '' },
    { choice: 'auto', games: {} }, { choice: 'auto', games: [null] },
    ...[
      { at: 'date invalide' }, { level: 'invalide' }, { load: -1 }, { load: null },
      { load: '0.2' }, { frames: 0 }, { frames: 1.5 }, { frames: Number.MAX_VALUE },
    ].map((change) => ({ choice: 'auto', level: 'equilibre', games: [{ ...game, ...change }] })),
    { choice: 'auto', written: [] }, { choice: 'auto', written: { FXAA: 6 } },
    { choice: 'auto', written: { FXAA: 'Infinity' } }, { choice: 'auto', written: { FXAA: '' } },
    { choice: 'auto', written: { FXAA: '99' } }, { choice: 'custom', customSettings: [] },
    { choice: 'custom', customSettings: { FXAA: false } },
    { choice: 'auto', level: 'ultra', ceiling: 'performance' },
  ];
  for (const state of invalid) {
    b.save({ active: keyOf(b.a), configurations: { [keyOf(b.a)]: state, [keyOf(b.b)]: { choice: 'performance' } } });
    assert.equal(app.readQualityState(b.dataDir, b.a), undefined, JSON.stringify(state));
    assert.equal(app.readQualityState(b.dataDir), undefined, 'actif invalide : pas de repli arbitraire');
    assert.equal(app.readQualityState(b.dataDir, b.b)?.choice, 'performance');
  }
  const before = fs.readFileSync(b.a, 'utf8');
  app.prepareQuality(b.dataDir, b.a);
  assert.equal(fs.readFileSync(b.a, 'utf8'), before);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'custom');
  assert.equal(app.readQualityState(b.dataDir, b.b)?.choice, 'performance');
});

test('JSON valide : retirer les champs inconnus et borner les parties conservées', (ctx) => {
  const b = fixture(ctx);
  b.seed({ choice: 'auto', level: 'equilibre', machine: 'machine', games: Array.from({ length: QUALITY_AUTO.keep + 3 }, () => game), written: { FXAA: '6.0', Etranger: '1' }, etranger: true });
  const state = app.readQualityState(b.dataDir, b.a);
  assert.equal(state?.games?.length, QUALITY_AUTO.keep);
  assert.deepEqual(state?.written, { FXAA: '6.0' });
  assert.equal(Object.hasOwn(state!, 'etranger'), false);
  b.save({ active: b.copy, configurations: { [keyOf(b.a)]: { choice: 'custom' } } });
  assert.equal(app.readQualityState(b.dataDir), undefined);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'custom');
});

for (const operation of ['prepare', 'choose'] as const) {
  test(`changement de machine : retirer trial, plafond et historique (${operation})`, (ctx) => {
    const b = fixture(ctx);
    app.chooseQuality(b.dataDir, b.a, 'auto');
    b.seed({ ...app.readQualityState(b.dataDir, b.a), machine: 'autre machine', level: 'qualite', ceiling: 'ultra', trial: true, games: [game] });
    if (operation === 'prepare') app.prepareQuality(b.dataDir, b.a);
    else app.chooseQuality(b.dataDir, b.a, 'auto');
    const state = app.readQualityState(b.dataDir, b.a);
    assert.equal(state?.level, initialQuality(machine).level);
    assert.equal(state?.trial, undefined);
    assert.equal(state?.ceiling, undefined);
    assert.deepEqual(state?.games, []);
  });
}

test('nombres équivalents : pas de personnalisation ni de réécriture de l’INI', (ctx) => {
  const b = fixture(ctx);
  app.chooseQuality(b.dataDir, b.a, 'performance');
  const doc = readIni(b.a);
  doc.set('Player', 'AAFactor', '1.000000');
  doc.set('Player', 'FXAA', '1.0');
  writeFileAtomic(b.a, doc.toString());
  const before = fs.readFileSync(b.a, 'utf8');
  app.prepareQuality(b.dataDir, b.a);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'performance');
  assert.equal(fs.readFileSync(b.a, 'utf8'), before);
  const ui = menu(b.dataDir, () => b.a);
  assert.equal(ui.presets.item.detail, t('Performance'));
  doc.remove('Player', 'MSAASamples');
  writeFileAtomic(b.a, doc.toString());
  app.prepareQuality(b.dataDir, b.a);
  const state = app.readQualityState(b.dataDir, b.a);
  assert.equal(state?.choice, 'custom', 'une absence diffère bien de zéro');
  assert.equal(state?.written, undefined);
  assert.equal(state?.customSettings?.MSAASamples, null);
});

test('Personnalisé : sauvegarder avant le premier mode, restaurer valeurs et absences, préserver les autres clés', (ctx) => {
  const original = '[Player]\nAAFactor = 1.25\nFXAA = 3\nSharpen = \nBGSet = 1\n[Audio]\nVolume = 75\n';
  const b = fixture(ctx, original);
  const personal = Object.fromEntries(QUALITY_KEYS.map((key) => [key, readIni(b.a).get('Player', key) ?? null]));
  app.chooseQuality(b.dataDir, b.a, 'qualite');
  assert.deepEqual(app.readQualityState(b.dataDir, b.a)?.customSettings, personal);
  app.chooseQuality(b.dataDir, b.a, 'ultra');
  assert.deepEqual(app.readQualityState(b.dataDir, b.a)?.customSettings, personal, 'un autre mode ne remplace pas la sauvegarde');
  const doc = readIni(b.a);
  doc.set('Audio', 'Volume', '60');
  writeFileAtomic(b.a, doc.toString());
  assert.equal(app.chooseQuality(b.dataDir, b.a, 'custom'), undefined);
  for (const key of QUALITY_KEYS) assert.equal(readIni(b.a).get('Player', key) ?? null, personal[key], key);
  assert.equal(readIni(b.a).get('Player', 'BGSet'), '1');
  assert.equal(readIni(b.a).get('Audio', 'Volume'), '60');
  assert.equal(app.readQualityState(b.dataDir, b.a)?.written, undefined, 'les valeurs personnelles restent disponibles pour la VR');
  const restored = fs.readFileSync(b.a, 'utf8');
  app.prepareQuality(b.dataDir, b.a);
  app.qualityAfterGame(b.dataDir, end(), b.a);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'custom');
  assert.equal(fs.readFileSync(b.a, 'utf8'), restored);
  const changed = readIni(b.a);
  changed.set('Player', 'AAFactor', '1.75');
  writeFileAtomic(b.a, changed.toString());
  app.chooseQuality(b.dataDir, b.a, 'performance');
  app.chooseQuality(b.dataDir, b.a, 'custom');
  assert.equal(readIni(b.a).get('Player', 'AAFactor'), '1.75', 'quitter Personnalisé reprend les réglages actuels');
});

test('changement manuel : affichage immédiat, sauvegarde actuelle et retrait de written', (ctx) => {
  const b = fixture(ctx);
  app.chooseQuality(b.dataDir, b.a, 'auto');
  const doc = readIni(b.a);
  doc.set('Player', 'FXAA', '3');
  writeFileAtomic(b.a, doc.toString());
  const before = fs.readFileSync(b.a, 'utf8');
  const ui = menu(b.dataDir, () => b.a);
  assert.equal(ui.presets.item.detail, t('Personnalisé'));
  assert.equal(ui.view().actions.find((a) => a.label === t('Personnalisé'))?.tone, 'ok');
  app.prepareQuality(b.dataDir, b.a);
  assert.equal(fs.readFileSync(b.a, 'utf8'), before);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.customSettings?.FXAA, '3');
  assert.equal(app.readQualityState(b.dataDir, b.a)?.written, undefined);
  app.chooseQuality(b.dataDir, b.a, 'ultra');
  app.chooseQuality(b.dataDir, b.a, 'custom');
  assert.equal(readIni(b.a).get('Player', 'FXAA'), '3');
  // Même si aucun départ de partie ne détecte le changement, le choix suivant doit le sauvegarder.
  app.chooseQuality(b.dataDir, b.a, 'performance');
  const later = readIni(b.a);
  later.set('Player', 'FXAA', '2');
  writeFileAtomic(b.a, later.toString());
  app.chooseQuality(b.dataDir, b.a, 'ultra');
  app.chooseQuality(b.dataDir, b.a, 'custom');
  assert.equal(readIni(b.a).get('Player', 'FXAA'), '2');
});

test('bouton Personnalisé toujours présent et sélectionnable, selon la configuration affichée', (ctx) => {
  const b = fixture(ctx);
  let current = b.a;
  const ui = menu(b.dataDir, () => current);
  for (const choice of ['auto', 'performance', 'equilibre', 'qualite', 'ultra', 'custom'] as const) {
    app.chooseQuality(b.dataDir, b.a, choice);
    const actions = ui.view().actions.filter((a) => a.label === t('Personnalisé'));
    assert.equal(actions.length, 1);
    assert.equal(actions[0]!.tone, choice === 'custom' ? 'ok' : undefined);
    actions[0]!.run();
    assert.equal(app.readQualityState(b.dataDir, b.a)?.choice, 'custom');
  }
  app.chooseQuality(b.dataDir, b.a, 'ultra');
  app.prepareQuality(b.dataDir, b.b);
  assert.equal(ui.presets.item.detail, t('Ultra'), 'le dernier actif B ne masque pas A');
  current = b.b;
  assert.equal(ui.presets.item.detail, t('Personnalisé'));
});

test('double : le niveau adapté rejoint la copie, sans état propre ni modification des autres clés', (ctx) => {
  const b = fixture(ctx, '[Player]\nBGSet = 1\n[Audio]\nVolume = 70\n');
  app.chooseQuality(b.dataDir, b.a, 'auto');
  writeFileAtomic(b.copy, `${fs.readFileSync(b.a, 'utf8')}[Inspector]\nPort = 12345\n`);
  app.qualityAfterGame(b.dataDir, end(), b.a);
  app.prepareQuality(b.dataDir, b.a, b.copy);
  for (const setting of qualitySettings('performance')) {
    assert.equal(readIni(b.a).get(setting.section, setting.key), setting.value);
    assert.equal(readIni(b.copy).get(setting.section, setting.key), setting.value);
  }
  for (const file of [b.a, b.copy]) {
    assert.equal(readIni(file).get('Player', 'BGSet'), '1');
    assert.equal(readIni(file).get('Audio', 'Volume'), '70');
  }
  assert.equal(readIni(b.a).get('Inspector', 'Port'), undefined);
  assert.equal(readIni(b.copy).get('Inspector', 'Port'), '12345');
  assert.equal(app.readQualityState(b.dataDir, b.copy), undefined);
  assert.equal(b.stored().active, keyOf(b.a));
  assert.deepEqual(Object.keys(b.stored().configurations), [keyOf(b.a)]);
});

test('surcharge graphique par table : aucun apprentissage global et fichier de table intact', (ctx) => {
  const b = fixture(ctx);
  app.chooseQuality(b.dataDir, b.a, 'auto');
  const tableFile = path.join(b.root, 'Table de test.vpx');
  const tableIni = path.join(b.root, 'Table de test.ini');
  const text = '[Player]\nFXAA = 1\nBGSet = 1\n';
  writeFileAtomic(tableIni, text);
  const before = fs.readFileSync(b.stateFile, 'utf8');
  assert.equal(app.qualityAfterGame(b.dataDir, end(), b.a, tableFile), undefined);
  assert.equal(fs.readFileSync(b.stateFile, 'utf8'), before);
  assert.equal(fs.readFileSync(tableIni, 'utf8'), text);
  // Une clé vide et une clé homonyme hors de Player ne masquent pas le mode global.
  writeFileAtomic(tableIni, '[Player]\nFXAA = \nBGSet = 1\n[Autre]\nAAFactor = 2\n');
  app.qualityAfterGame(b.dataDir, end(), b.a, tableFile);
  assert.equal(app.readQualityState(b.dataDir, b.a)?.level, 'performance');
});

test('GPU libre : monter seulement si la cadence tient la cible et si les retards restent faibles', (ctx) => {
  const target = 'Synchronization mode: 3 with maximum FPS: 120, display FPS: 120';
  const cadence = (fps: number, late: number) => `Cadence end: frames=30000 duration=250.0s fps=${fps} p50=8ms p95=8ms p99=9ms max=20ms late=${late}% stalls=0 worst10s=${fps}fps`;
  const scenarios = [
    { name: '50 sur 120, limitation hors GPU', lines: [target, cadence(50, 1)], raises: false },
    { name: '120 sur 120 mais trop de retards', lines: [target, cadence(120, 6)], raises: false },
    { name: 'bilan cadence absent', lines: [target], raises: false },
    { name: '120 sur 120', lines: [target, cadence(120, 1)], raises: true },
    { name: 'cible absente : budget GPU', lines: [cadence(120, 1)], raises: true },
    { name: 'limite choisie à 60 sur écran 120', lines: ['Synchronization mode: 1 with maximum FPS: 60, display FPS: 120', cadence(60, 1)], raises: true },
  ];
  for (const scenario of scenarios) {
    const b = fixture(ctx);
    app.chooseQuality(b.dataDir, b.a, 'auto');
    assert.equal(app.readQualityState(b.dataDir, b.a)?.level, 'equilibre');
    for (let i = 0; i < QUALITY_AUTO.gamesToRaise; i++) {
      app.qualityAfterGame(b.dataDir, [...end(2), ...scenario.lines], b.a);
      assert.equal(app.readQualityState(b.dataDir, b.a)?.level, scenario.raises && i === QUALITY_AUTO.gamesToRaise - 1 ? 'qualite' : 'equilibre', `${scenario.name}, partie ${i + 1}`);
    }
  }
});

for (const playState of [['Pausing Game'], ['Pausing Game', 'Unpausing Game', 'Pausing Game']]) {
  test(`Auto ignore une mesure en pause : ${playState.join(', ')}`, (ctx) => {
    const b = fixture(ctx);
    app.chooseQuality(b.dataDir, b.a, 'auto');
    const before = fs.readFileSync(b.stateFile, 'utf8');
    app.qualityAfterGame(b.dataDir, [...playState, ...end(25)], b.a);
    assert.equal(fs.readFileSync(b.stateFile, 'utf8'), before);
  });
}

test('VR dans un double : les valeurs du pré-réglage viennent de la configuration source, jamais du dernier actif', (ctx) => {
  const b = fixture(ctx);
  app.chooseQuality(b.dataDir, b.a, 'ultra');
  fs.copyFileSync(b.a, b.copy);
  const before = fs.readFileSync(b.a, 'utf8');
  app.chooseQuality(b.dataDir, b.b, 'performance');
  const vr = require(path.join(REPO_ROOT, 'app', 'dist', 'vr.js')) as { prepareVrGame(opts: { dataDir: string; baseIni: string; qualityIni: string; tableFile: string; inPlace: boolean }): { ini: string } };
  vr.prepareVrGame({ dataDir: b.dataDir, baseIni: b.copy, qualityIni: b.a, tableFile: path.join(b.root, 'table-absente.vpx'), inPlace: true });
  assert.equal(readIni(b.copy).get('Player', 'AAFactor'), undefined, 'Ultra retiré de la copie VR');
  assert.equal(fs.readFileSync(b.a, 'utf8'), before, 'configuration écran intacte');
  assert.equal(app.readQualityState(b.dataDir, b.copy), undefined, 'aucun état associé au double');
});
