// Pré-réglages de qualité de VPX (22/11/2026) : Menu système > Ma borne > VPX > Pré-réglages, avec
// Auto (choisi d'après la machine, puis ajusté d'après le temps de rendu de la carte graphique relevé à chaque partie)
// et des modes prêts à l'emploi. Invariants : un réglage du joueur l'emporte toujours (Personnalisé, jamais écrasé) ;
// les modes n'écrivent que leurs clés, dans les bornes de VPX ; la VR garde son propre profil ; le mode Auto descend
// quand la carte graphique peine, monte seulement avec de la marge, et ne retente pas un mode qui n'a pas tenu.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  adaptQuality,
  currentQuality,
  IniDocument,
  initialQuality,
  QUALITY_AUTO,
  QUALITY_KEYS,
  QUALITY_LEVELS,
  qualitySettings,
  readGpuFrames,
  SYSTEM_GROUPS,
  systemPathOf,
  withoutQualityPreset,
  type GpuFrameStats,
  type QualityState,
} from '../index';
import { REPO_ROOT } from './i18n-scan';

const app = require(path.join(REPO_ROOT, 'app', 'dist', 'qualite-vpx.js')) as {
  prepareQuality(dataDir: string, ini: string): string | undefined;
  qualityAfterGame(dataDir: string, lines: string[]): string | undefined;
  chooseQuality(dataDir: string, ini: string, choice: string): string;
  readQualityState(dataDir: string): QualityState | undefined;
};
const facts = require(path.join(REPO_ROOT, 'app', 'dist', 'tech-facts.js')) as { saveTechFacts(dataDir: string, f: unknown): void };

const GB = 1024 * 1024 * 1024;

test('chaque mode règle les mêmes clés, connues de VPX 10.8.1-5436 et dans leurs bornes', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'installer', 'vpx-settings', '10.8.1-5436.json'), 'utf8')) as { settings: { section: string; key: string; min?: number; max?: number; values?: unknown[] }[] };
  for (const level of QUALITY_LEVELS) {
    const settings = qualitySettings(level);
    assert.deepEqual(settings.map((s) => s.key), [...QUALITY_KEYS], level);
    for (const s of settings) {
      const known = schema.settings.find((x) => x.section === s.section && x.key === s.key);
      assert.ok(known, `${level} : ${s.section}.${s.key} inconnu de la 5436`);
      const v = Number(s.value);
      if (known.min !== undefined) assert.ok(v >= known.min, `${level} : ${s.key} ${v} < ${known.min}`);
      if (known.max !== undefined) assert.ok(v <= known.max, `${level} : ${s.key} ${v} > ${known.max}`);
    }
  }
  const aa = (level: (typeof QUALITY_LEVELS)[number]) => Number(qualitySettings(level).find((s) => s.key === 'AAFactor')!.value);
  assert.ok(aa('ultra') > aa('qualite'), 'Ultra : suréchantillonnage');
  assert.ok(qualitySettings('performance').find((s) => s.key === 'FXAA')!.value !== '0', 'même Performance a un anticrénelage');
  // Les modes se distinguent : un INI à un mode se reconnaît comme tel.
  for (const level of QUALITY_LEVELS) {
    const doc = IniDocument.parse('');
    for (const s of qualitySettings(level)) doc.set(s.section, s.key, s.value);
    assert.equal(currentQuality((k) => doc.get('Player', k)), level);
  }
  assert.equal(currentQuality(() => undefined), undefined, 'défauts de VPX : aucun mode');
});

test('mode de départ : d’après la mémoire vidéo et les pixels à dessiner, jamais un nom de modèle', () => {
  const at = (vramGb: number | undefined, w?: number, h?: number, hz?: number) => initialQuality({ vramMb: vramGb && vramGb * 1024, width: w, height: h, hz }).level;
  assert.equal(at(11, 1920, 1080, 60), 'equilibre', 'la mémoire seule ne justifie pas Ultra');
  assert.equal(at(11, 3840, 2160, 60), 'equilibre');
  assert.equal(at(11, 3840, 2160, 120), 'equilibre', 'un playfield 4K à 120 Hz demande 8 fois plus qu’un 1080p à 60 Hz');
  assert.equal(at(8, 1920, 1080, 60), 'equilibre');
  assert.equal(at(4, 1920, 1080, 60), 'equilibre');
  assert.equal(at(2, 1920, 1080, 60), 'performance', 'carte intégrée');
  assert.equal(at(undefined, 1920, 1080, 60), 'performance', 'carte inconnue : prudent');
  assert.equal(at(24), 'equilibre', 'playfield inconnu : pas au-dessus d’Équilibré');
});

test('temps de rendu de la carte graphique lu au journal de notre VPX (correctif 04)', () => {
  const lines = [
    '... INFO  [RenderThread] [x] GPU frame running: frames=7000 mean=4.10ms p50=4.00ms p95=6.25ms max=20.50ms budget=8.34ms',
    '... INFO  [RenderThread] [x] GPU frame end: frames=21000 mean=4.30ms p50=4.25ms p95=7.00ms max=31.00ms budget=8.34ms',
  ];
  assert.deepEqual(readGpuFrames(lines), { frames: 21000, meanMs: 4.3, p50Ms: 4.25, p95Ms: 7, maxMs: 31, budgetMs: 8.34 });
  assert.equal(readGpuFrames(lines.slice(0, 1))!.frames, 7000, 'sans fin de partie (VPX arrêté) : la dernière minute');
  assert.equal(readGpuFrames(['Cadence end: frames=1']), undefined, 'VPX officiel : rien');
  const patch = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'vpx-corrige', 'correctifs', '04-temps-gpu-au-journal.patch'), 'utf8');
  assert.match(patch, /GPU frame \{\}: frames=\{\} mean=\{:\.2f\}ms p50=\{:\.2f\}ms p95=\{:\.2f\}ms max=\{:\.2f\}ms budget=\{:\.2f\}ms/, 'le format lu est celui que le correctif écrit');
  assert.match(patch, /Modified by Cyber Pinball, \d{4}-\d{2}-\d{2}/);
});

const gpu = (load: number, frames = 20000): GpuFrameStats => ({ frames, meanMs: load * 8, p50Ms: load * 8, p95Ms: load * 8.34, maxMs: 30, budgetMs: 8.34 });

test('mode Auto : descend quand la carte graphique peine, monte avec de la marge, ne retente pas un mode qui n’a pas tenu', () => {
  let state: QualityState = { choice: 'auto', level: 'qualite' };
  // Une partie courte (chargement, abandon) ne compte pas.
  assert.equal(adaptQuality(state, gpu(2, QUALITY_AUTO.minFrames - 1)).change, undefined);
  // Une seule partie bien au-dessus : on descend tout de suite.
  const far = adaptQuality(state, gpu(QUALITY_AUTO.farOver + 0.1));
  assert.equal(far.change?.to, 'equilibre');
  // Un peu au-dessus : il en faut deux sur trois.
  state = { choice: 'auto', level: 'qualite', games: [] };
  let r = adaptQuality(state, gpu(0.95));
  assert.equal(r.change, undefined);
  r = adaptQuality(r.state, gpu(0.6));
  assert.equal(r.change, undefined);
  r = adaptQuality(r.state, gpu(0.95));
  assert.equal(r.change?.to, 'equilibre');
  // De la marge sur trois parties : on monte d'un mode.
  state = { choice: 'auto', level: 'equilibre', games: [] };
  for (let i = 0; i < QUALITY_AUTO.gamesToRaise - 1; i++) {
    r = adaptQuality(state, gpu(0.3));
    assert.equal(r.change, undefined, `partie ${i + 1}`);
    state = r.state;
  }
  r = adaptQuality(state, gpu(0.3));
  assert.equal(r.change?.to, 'qualite');
  // Le mode monté peine dès sa première partie : retour, et il devient le plafond.
  r = adaptQuality(r.state, gpu(1.0));
  assert.equal(r.change?.to, 'equilibre');
  assert.equal(r.state.ceiling, 'equilibre');
  state = r.state;
  for (let i = 0; i < QUALITY_AUTO.gamesToRaise + 2; i++) {
    r = adaptQuality(state, gpu(0.2));
    assert.equal(r.change, undefined, 'plus de montée au-dessus du plafond');
    state = r.state;
  }
  assert.ok((state.games ?? []).length <= QUALITY_AUTO.keep);
  // Bornes : rien sous Performance, rien au-dessus d'Ultra.
  assert.equal(adaptQuality({ choice: 'auto', level: 'performance' }, gpu(2)).change, undefined);
  // Un mode fixe ou Personnalisé ne bouge jamais.
  assert.equal(adaptQuality({ choice: 'qualite', level: 'qualite' }, gpu(2)).change, undefined);
  assert.equal(adaptQuality({ choice: 'custom' }, gpu(2)).change, undefined);
});

test('la VR ne reçoit pas les valeurs d’un mode, mais garde celles choisies par le joueur', () => {
  const ini = '[Player]\nFXAA = 6\nAAFactor = 1.5\nPFReflection = 4\nBGSet = 1\n';
  const stripped = IniDocument.parse(withoutQualityPreset(ini, { FXAA: '6', AAFactor: '1.5', PFReflection: '5' }));
  assert.equal(stripped.get('Player', 'FXAA'), undefined);
  assert.equal(stripped.get('Player', 'AAFactor'), undefined);
  assert.equal(stripped.get('Player', 'PFReflection'), '4', 'changé par le joueur : gardé');
  assert.equal(stripped.get('Player', 'BGSet'), '1', 'hors des pré-réglages : gardé');
  assert.equal(withoutQualityPreset(ini, undefined), ini);
  const vr = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'vr.ts'), 'utf8');
  assert.match(vr, /planVrIni\(withoutQualityPreset\(base, readQualityState\(opts\.dataDir, opts\.qualityIni \?\? opts\.baseIni\)\?\.written\)/);
});

function borne(vramGb: number, w: number, h: number, hz: number, ini = ''): { dataDir: string; iniPath: string; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-prereglages-'));
  const dataDir = path.join(root, 'data');
  facts.saveTechFacts(dataDir, { at: new Date().toISOString(), pc: { gpus: [{ name: 'Carte intégrée', memory: 0.5 * GB }, { name: 'Carte de test', memory: vramGb * GB }] }, displays: [{ role: 'playfield', name: 'Écran de test', width: w, height: h, hz, rotation: 0, primary: true }] });
  const iniPath = path.join(root, 'VPinballX.ini');
  fs.writeFileSync(iniPath, ini);
  return { dataDir, iniPath, root };
}

const iniValue = (file: string, key: string) => IniDocument.parse(fs.readFileSync(file, 'utf8')).get('Player', key);

test('après choix explicite, Auto écrit dans l’INI ; un réglage changé à la main passe en Personnalisé', () => {
  const b = borne(11, 1920, 1080, 60, '[Player]\nBGSet = 1\n');
  try {
    assert.equal(app.prepareQuality(b.dataDir, b.iniPath), undefined);
    assert.equal(app.readQualityState(b.dataDir)?.choice, 'custom', 'mise à jour : aucun préréglage imposé');
    app.chooseQuality(b.dataDir, b.iniPath, 'auto');
    app.prepareQuality(b.dataDir, b.iniPath);
    assert.equal(app.readQualityState(b.dataDir)?.choice, 'auto');
    assert.equal(iniValue(b.iniPath, 'AAFactor'), '1');
    assert.equal(iniValue(b.iniPath, 'BGSet'), '1', 'les autres réglages restent');
    // Le joueur change un réglage dans Réglages de VPX : Personnalisé, plus rien n'est réécrit.
    fs.writeFileSync(b.iniPath, fs.readFileSync(b.iniPath, 'utf8').replace(/FXAA = 2/, 'FXAA = 3'));
    assert.match(app.prepareQuality(b.dataDir, b.iniPath) ?? '', /FXAA changé à la main/);
    assert.equal(app.readQualityState(b.dataDir)?.choice, 'custom');
    app.prepareQuality(b.dataDir, b.iniPath);
    assert.equal(iniValue(b.iniPath, 'FXAA'), '3');
    // Choisir un mode dans le menu le réécrit tout de suite.
    assert.equal(app.chooseQuality(b.dataDir, b.iniPath, 'performance'), 'performance');
    assert.equal(iniValue(b.iniPath, 'FXAA'), '1');
    assert.equal(app.readQualityState(b.dataDir)?.choice, 'performance');
  } finally {
    fs.rmSync(b.root, { recursive: true, force: true });
  }
});

test('une borne déjà réglée à la main garde ses réglages (Personnalisé dès le départ)', () => {
  const b = borne(11, 1920, 1080, 60, '[Player]\nAAFactor = 1.25\n');
  try {
    assert.equal(app.prepareQuality(b.dataDir, b.iniPath), undefined);
    assert.equal(app.readQualityState(b.dataDir)?.choice, 'custom');
    assert.equal(iniValue(b.iniPath, 'AAFactor'), '1.25');
    assert.equal(iniValue(b.iniPath, 'FXAA'), undefined);
  } finally {
    fs.rmSync(b.root, { recursive: true, force: true });
  }
});

test('après une partie, le mode Auto s’ajuste ; une autre carte graphique ou un autre playfield le fait repartir', () => {
  const b = borne(11, 3840, 2160, 120);
  try {
    app.chooseQuality(b.dataDir, b.iniPath, 'auto');
    app.prepareQuality(b.dataDir, b.iniPath);
    assert.equal(app.readQualityState(b.dataDir)?.level, 'equilibre');
    const end = (load: number) => [`GPU frame end: frames=30000 mean=1.00ms p50=1.00ms p95=${(load * 8.34).toFixed(2)}ms max=9.00ms budget=8.34ms`];
    assert.match(app.qualityAfterGame(b.dataDir, end(1.5)) ?? '', /equilibre → performance/);
    app.prepareQuality(b.dataDir, b.iniPath);
    assert.equal(iniValue(b.iniPath, 'FXAA'), '1', 'Performance écrit à la partie suivante');
    // La borne change de playfield : le départ est recalculé.
    facts.saveTechFacts(b.dataDir, { at: new Date().toISOString(), pc: { gpus: [{ name: 'Carte de test', memory: 11 * GB }] }, displays: [{ role: 'playfield', name: 'Écran', width: 1920, height: 1080, hz: 60, rotation: 0, primary: true }] });
    assert.match(app.prepareQuality(b.dataDir, b.iniPath) ?? '', /equilibre au départ/);
  } finally {
    fs.rmSync(b.root, { recursive: true, force: true });
  }
});

test('Menu système > Ma borne > VPX > Pré-réglages, en tête ; branché avant et après chaque partie', () => {
  assert.equal((SYSTEM_GROUPS.vpx.entries as readonly string[])[0], 'vpx-presets');
  assert.ok(systemPathOf('vpx-presets'));
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /library\.provideSystemItem\('vpx-presets', createVpxPresetsMenu\(/);
  assert.match(frontend, /if \(!vrGame && !displayMode\) \{\s*try \{\s*const quality = prepareQuality\(loc\.dataDir, activeVpxIni\(loc\), double\?\.ini\)/, 'pas dans le casque');
  assert.match(frontend, /if \(qualityPrepared && !playedVr && !vrGame && !anaglyphGame\) \{\s*const quality = qualityAfterGame\(loc\.dataDir, gameLines, activeVpxIni\(loc\), played\.file\)/);
});

// Une remontée ne réutilise pas les anciennes parties d'un niveau quitté entre-temps.
test('Auto exige de nouvelles parties après un changement de niveau et ignore les mesures invalides', () => {
  const games = [0.2, 0.2, 0.2].map((load) => ({ at: '', level: 'equilibre' as const, load, frames: 20000 }));
  const r = adaptQuality({ choice: 'auto', level: 'equilibre', games: [...games, { at: '', level: 'qualite', load: 1.3, frames: 20000 }] }, gpu(0.2));
  assert.equal(r.change, undefined);
  assert.equal(readGpuFrames(['GPU frame end: frames=20000 mean=1.00ms p50=1.00ms p95=0.00ms max=9.00ms budget=8.34ms']), undefined);
  assert.equal(readGpuFrames(['GPU frame end: frames=20000 mean=1.00ms p50=1.00ms p95=4.00ms max=9.00ms budget=0.00ms']), undefined);
});
