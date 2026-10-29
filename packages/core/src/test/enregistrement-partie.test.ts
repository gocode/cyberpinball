import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  advanceRecording,
  ARMED_RECORDING,
  captureGeometry,
  DEFAULT_RECORDING_SETTINGS,
  fadeLevel,
  indicatorBounds,
  keptSeconds,
  listRecordings,
  loadRecordingSettings,
  MIN_RECORDING_SECONDS,
  normalizeRecordingSettings,
  recordedMediaType,
  recordingDir,
  recordingEndText,
  recordingFileName,
  recordingIndicator,
  recordingUsable,
  RECORDING_TAIL_MS,
  saveRecordingSettings,
  toggleRecordedRole,
  uprightRotation,
  type RecordingClock,
  type RecordingEvent,
  type RecordingInput,
} from '../gamerecording';
import { applyOps, trashDirFor } from '../fileops';
import { localMediaChoices } from '../mediachoices';
import { emptyMediaDraft, planMediaChanges } from '../mediaedit';
import { mediaFlipperEdge, mediaMemory, parseMediaFileName, playfieldMediaRotation } from '../medias';
import { infoFileFor, readInfo, scanTables } from '../tables';
import type { FlipperEdge, Rotation } from '../model';

const SETTINGS = { delay: 10, duration: 30 };

/** Rejoue une suite d'entrées ; renvoie l'état final et tous les événements émis. */
function run(inputs: RecordingInput[], settings = SETTINGS): { clock: RecordingClock; events: RecordingEvent[] } {
  let clock = ARMED_RECORDING;
  const events: RecordingEvent[] = [];
  for (const input of inputs) {
    const step = advanceRecording(clock, input, settings);
    clock = step.clock;
    events.push(...step.events);
  }
  return { clock, events };
}

const ticks = (from: number, to: number, every = 100): RecordingInput[] => Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => ({ type: 'tick', at: from + i * every }));

test('début : le délai part de l’apparition de la table, pas du lancement', () => {
  // Chargement de VPX : des battements sans table à l'écran ne font rien.
  const loading = run(ticks(0, 60_000));
  assert.equal(loading.clock.phase, 'armed');
  assert.deepEqual(loading.events, []);
  const { clock, events } = run([...ticks(0, 5000), { type: 'shown', at: 5000 }, ...ticks(5100, 14_900)]);
  assert.equal(clock.phase, 'waiting');
  assert.deepEqual(events, []);
  const started = run([{ type: 'shown', at: 5000 }, ...ticks(5100, 15_000)]);
  assert.equal(started.clock.phase, 'recording');
  assert.deepEqual(started.events, [{ type: 'recording-start', at: 15_000 }]);
});

test('délai nul : l’enregistrement commence dès que la table est à l’écran', () => {
  const { events } = run([{ type: 'shown', at: 2000 }], { delay: 0, duration: 15 });
  assert.deepEqual(events, [{ type: 'recording-start', at: 2000 }]);
});

test('fin à la durée : un seul événement de fin, à l’instant exact, même si le battement arrive en retard', () => {
  const { clock, events } = run([{ type: 'shown', at: 0 }, ...ticks(100, 10_000), { type: 'tick', at: 40_350 }, { type: 'tick', at: 40_450 }, { type: 'game-end', at: 60_000 }]);
  assert.deepEqual(events, [
    { type: 'recording-start', at: 10_000 },
    { type: 'recording-end', at: 40_000, reason: 'duration', seconds: 30 },
  ]);
  assert.equal(clock.reason, 'duration');
  assert.equal(keptSeconds(clock), 30);
  assert.ok(recordingUsable(clock));
});

test('fin à la sortie de la table : la fin retenue est jetée ; trop court, rien n’est gardé', () => {
  const quit = run([{ type: 'shown', at: 0 }, ...ticks(100, 10_000), { type: 'game-end', at: 22_000 }]);
  assert.deepEqual(quit.events.at(-1), { type: 'recording-end', at: 22_000, reason: 'game-end', seconds: 12 });
  assert.equal(keptSeconds(quit.clock), 12 - RECORDING_TAIL_MS / 1000);
  assert.ok(recordingUsable(quit.clock));

  const short = run([{ type: 'shown', at: 0 }, ...ticks(100, 10_000), { type: 'game-end', at: 10_000 + (MIN_RECORDING_SECONDS - 1) * 1000 }]);
  assert.equal(recordingUsable(short.clock), false);
  assert.match(recordingEndText(short.clock, SETTINGS), /trop court/);

  // Quittée pendant le délai : une fin sans début, rien de filmé.
  const before = run([{ type: 'shown', at: 0 }, { type: 'game-end', at: 3000 }]);
  assert.deepEqual(before.events, [{ type: 'recording-end', at: 3000, reason: 'game-end', seconds: 0 }]);
  assert.equal(recordingUsable(before.clock), false);
  assert.match(recordingEndText(before.clock, SETTINGS), /avant le début/);
});

test('échec de la capture : fin immédiate, jamais proposé, et plus rien ne bouge ensuite', () => {
  const { clock, events } = run([{ type: 'shown', at: 0 }, ...ticks(100, 12_000), { type: 'failed', at: 12_000, error: 'écran introuvable' }, ...ticks(12_100, 50_000), { type: 'game-end', at: 60_000 }]);
  assert.equal(events.filter((e) => e.type === 'recording-end').length, 1);
  assert.equal(clock.reason, 'failed');
  assert.equal(recordingUsable(clock), false);
  assert.match(recordingEndText(clock, SETTINGS), /écran introuvable/);
});

test('témoin : compte à rebours, puis REC avec le temps, puis le bilan', () => {
  const waiting = run([{ type: 'shown', at: 0 }, { type: 'tick', at: 3000 }]).clock;
  assert.deepEqual(recordingIndicator(waiting, 3000, SETTINGS), { state: 'waiting', label: 'Enregistrement dans 7 s', progress: 0.3 });
  const rec = run([{ type: 'shown', at: 0 }, { type: 'tick', at: 10_000 }]).clock;
  assert.deepEqual(recordingIndicator(rec, 22_500, SETTINGS), { state: 'recording', label: 'REC', time: '0:12 / 0:30', progress: 12.5 / 30 });
  const done = run([{ type: 'shown', at: 0 }, { type: 'tick', at: 10_000 }, { type: 'tick', at: 40_000 }]).clock;
  assert.equal(recordingIndicator(done, 41_000, SETTINGS)?.state, 'done');
  assert.equal(recordingIndicator(ARMED_RECORDING, 0, SETTINGS), undefined);
});

test('fondu : entrée toujours, sortie seulement quand la fin est connue', () => {
  assert.equal(fadeLevel(0, 30_000), 0);
  assert.equal(fadeLevel(200, 30_000), 0.5);
  assert.equal(fadeLevel(15_000, 30_000), 1);
  assert.equal(fadeLevel(29_800, 30_000), 0.5);
  assert.equal(fadeLevel(30_000, 30_000), 0);
  assert.equal(fadeLevel(29_800, undefined), 1);
});

test('réglages : valeurs hors des choix remplacées, plateau toujours filmé, relus tels qu’écrits', () => {
  assert.deepEqual(normalizeRecordingSettings({ roles: ['dmd'], delay: 7, duration: 30, sound: false }), { roles: ['playfield', 'dmd'], delay: 10, duration: 30, sound: false });
  assert.deepEqual(normalizeRecordingSettings('n’importe quoi'), DEFAULT_RECORDING_SETTINGS);
  assert.deepEqual(toggleRecordedRole(DEFAULT_RECORDING_SETTINGS, 'playfield').roles, ['playfield']);
  assert.deepEqual(toggleRecordedRole(toggleRecordedRole(DEFAULT_RECORDING_SETTINGS, 'dmd'), 'backglass').roles, ['playfield', 'backglass', 'dmd']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rec-'));
  try {
    assert.deepEqual(loadRecordingSettings(dir), DEFAULT_RECORDING_SETTINGS);
    const mine = { roles: ['playfield', 'backglass'] as const, delay: 5, duration: 60, sound: false };
    saveRecordingSettings(dir, { ...mine, roles: [...mine.roles] });
    assert.deepEqual(loadRecordingSettings(dir), { ...mine, roles: [...mine.roles] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('plateau : la roue montre l’enregistrement comme le joueur voyait la table, dans tous les sens d’écran', () => {
  const edges: FlipperEdge[] = ['bottom', 'left', 'top', 'right'];
  for (const edge of edges) {
    // Écran couché en paysage (flippers à gauche ou à droite), ou debout (en bas, en haut).
    const screen = edge === 'left' || edge === 'right' ? { width: 3840, height: 2160 } : { width: 2160, height: 3840 };
    const g = captureGeometry({ x: 0, y: 0, ...screen }, screen, screen, uprightRotation(edge), { maxLong: 1920, portrait: true });
    // Toujours un portrait : la roue y voit des flippers en bas (mediaFlipperEdge).
    assert.ok(g.height > g.width, `${edge} : portrait attendu`);
    assert.equal(mediaFlipperEdge(g), 'bottom');
    // Ce que l'enregistreur tourne, la roue le retourne : la table revient dans le sens de l'écran.
    const shown = playfieldMediaRotation(g, edge);
    assert.equal((g.rotation + shown) % 360, 0, `${edge} : ${g.rotation}° puis ${shown}°`);
    assert.deepEqual([g.width, g.height], [1080, 1920]);
  }
});

test('plateau d’un poste de bureau (paysage, flippers en bas) : recadré au centre en 9:16', () => {
  const g = captureGeometry({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 0, { maxLong: 1920, portrait: true });
  assert.deepEqual(g.crop, { x: 656, y: 0, width: 608, height: 1080 });
  assert.deepEqual([g.width, g.height], [608, 1080]);
  // Un écran couché tourné d'un quart : le recadrage se fait dans l'image d'origine, sur sa hauteur.
  const turned = captureGeometry({ x: 0, y: 0, width: 1080, height: 1920 }, { width: 1080, height: 1920 }, { width: 1080, height: 1920 }, 90, { maxLong: 1920, portrait: true });
  assert.deepEqual(turned.crop, { x: 0, y: 656, width: 1080, height: 608 });
  assert.deepEqual([turned.width, turned.height], [608, 1080]);
});

test('zones partagées : fronton et DMD pris chacun dans sa zone, ramenés à la taille de la capture', () => {
  // Écran du fronton 2560 × 1440 capturé à moitié de sa taille ; DMD en bande sous le fronton.
  const screen = { width: 2560, height: 1440 };
  const source = { width: 1280, height: 720 };
  const backglass = captureGeometry({ x: 0, y: 0, width: 2560, height: 1080 }, screen, source, 0, { maxLong: 1280 });
  const dmd = captureGeometry({ x: 0, y: 1080, width: 2560, height: 360 }, screen, source, 0, { maxLong: 1280 });
  assert.deepEqual(backglass.crop, { x: 0, y: 0, width: 1280, height: 540 });
  assert.deepEqual(dmd.crop, { x: 0, y: 540, width: 1280, height: 180 });
  assert.deepEqual([dmd.width, dmd.height], [1280, 180]);
  // Tailles paires pour H.264, même d'une zone impaire.
  const odd = captureGeometry({ x: 3, y: 5, width: 1001, height: 333 }, { width: 1920, height: 1080 }, { width: 1920, height: 1080 }, 0, { maxLong: 1280 });
  assert.equal(odd.width % 2, 0);
  assert.equal(odd.height % 2, 0);
});

test('témoin : en haut à droite pour le joueur, dans le plateau, quel que soit le sens', () => {
  const zone = { x: 100, y: 0, width: 3840, height: 2160 };
  const size = { width: 360, height: 64 };
  const cases: Record<Rotation, { x: number; y: number; width: number; height: number }> = {
    0: { x: 100 + 3840 - 24 - 360, y: 24, width: 360, height: 64 },
    90: { x: 100 + 3840 - 24 - 64, y: 2160 - 24 - 360, width: 64, height: 360 },
    180: { x: 100 + 24, y: 2160 - 24 - 64, width: 360, height: 64 },
    270: { x: 100 + 24, y: 24, width: 64, height: 360 },
  };
  for (const [rotation, want] of Object.entries(cases)) {
    const r = indicatorBounds(zone, Number(rotation) as Rotation, size, 24);
    assert.deepEqual(r, want, `rotation ${rotation}`);
    assert.ok(r.x >= zone.x && r.y >= zone.y && r.x + r.width <= zone.x + zone.width && r.y + r.height <= zone.y + zone.height);
  }
});

test('médias produits : plateau, fronton, et le DMD de l’écran de la borne', () => {
  assert.equal(recordedMediaType('playfield'), 'Playfield');
  assert.equal(recordedMediaType('backglass'), 'Backglass');
  assert.equal(recordedMediaType('dmd'), 'DMD');
});

test('fichiers : rangés hors de medias\\, relus du plus récent au plus ancien, jamais un fichier vide', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rec-'));
  try {
    const table = { file: path.join(dir, 'tables', 'Neon Galaxy (Williams 1992).vpx') };
    const where = recordingDir(dir, table);
    assert.equal(where, path.join(dir, 'enregistrements', 'Neon Galaxy (Williams 1992)'));
    fs.mkdirSync(where, { recursive: true });
    const older = recordingFileName('Playfield', new Date(2026, 9, 29, 21, 4, 3), 'mp4');
    const newer = recordingFileName('Backglass', new Date(2026, 9, 29, 21, 14, 3), '.MP4');
    assert.equal(older, '(Playfield) 2026-10-29 21-04-03.mp4');
    assert.equal(newer, '(Backglass) 2026-10-29 21-14-03.mp4');
    fs.writeFileSync(path.join(where, older), 'x');
    fs.writeFileSync(path.join(where, newer), 'xy');
    fs.writeFileSync(path.join(where, '(Playfield) 2026-10-29 22-00-00.mp4'), '');
    fs.writeFileSync(path.join(where, 'notes.txt'), 'x');
    const found = listRecordings(dir, table);
    assert.deepEqual(found.map((r) => [r.type, path.basename(r.file), r.bytes]), [
      ['Backglass', newer, 2],
      ['Playfield', older, 1],
    ]);
    // Le nom ne peut pas passer pour un média de la table : ce n'est pas « (Type) <nom du jeu> ».
    assert.equal(parseMediaFileName(older)?.stem, '2026-10-29 21-04-03');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('roue : la vidéo enregistrée remplace l’ancienne après le plan, demi-tour retiré, et reste proposée quand elle est gardée de côté', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-rec-roue-'));
  try {
    const folder = path.join(root, 'tables', 'Neon Galaxy (Williams 1992)');
    const medias = path.join(folder, 'medias');
    fs.mkdirSync(medias, { recursive: true });
    fs.writeFileSync(path.join(folder, 'Neon Galaxy (Williams 1992).vpx'), '');
    const infoFile = path.join(folder, 'Neon Galaxy (Williams 1992).info');
    fs.writeFileSync(infoFile, JSON.stringify({ Info: { Title: 'Neon Galaxy' }, CyberPinball: { medias: { halfTurn: { Playfield: true } } } }, null, 2));
    const old = path.join(medias, '(Playfield) Neon Galaxy (Williams 1992).webm');
    fs.writeFileSync(old, 'ancienne');
    const table = scanTables(path.join(root, 'tables'))[0]!;
    const dataDir = path.join(root, 'data');
    const dir = recordingDir(dataDir, table);
    fs.mkdirSync(dir, { recursive: true });
    const recorded = path.join(dir, recordingFileName('Playfield', new Date(2026, 9, 29, 21, 14, 3), 'mp4'));
    fs.writeFileSync(recorded, 'nouvelle');

    // Gardée de côté : en tête des propositions du plateau, rien d'autre ne bouge.
    const choices = localMediaChoices(table, { recordings: listRecordings(dataDir, table) });
    assert.equal(choices.Playfield?.[0]?.source, 'recording');
    assert.equal(choices.Playfield?.[0]?.file, recorded);
    assert.match(choices.Playfield![0]!.label, /^Enregistré en partie : /);

    // Utilisée pour la roue : le plan dit d'où elle vient, l'ancienne part à la corbeille, le demi-tour ne vaut plus.
    const draft = emptyMediaDraft();
    draft.pages.Playfield = [{ from: recorded, mode: 'move', recorded: true }];
    const plan = planMediaChanges(table, draft, { infoFile: infoFileFor(table, path.join(root, 'tables')), root });
    assert.deepEqual(plan.problems, []);
    assert.deepEqual(plan.steps.map((s) => [s.kind, s.detail]), [
      ['trash', 'montré aujourd’hui'],
      ['add', 'enregistré en partie'],
    ]);
    applyOps(plan.ops, { trashDir: trashDirFor(path.join(root, 'corbeille'), 'essai') });
    assert.ok(fs.existsSync(path.join(medias, '(Playfield) Neon Galaxy (Williams 1992).mp4')));
    assert.ok(!fs.existsSync(old));
    assert.ok(!fs.existsSync(recorded), 'déplacée, pas copiée : plus rien de côté');
    assert.equal(mediaMemory(readInfo(infoFile)).halfTurn, undefined);
    assert.deepEqual(listRecordings(dataDir, table), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
