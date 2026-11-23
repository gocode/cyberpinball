// Volume de la ROM (décision du 17/11/2026) : un joueur trouvait Monster Bash presque muet. Le
// volume des WPC et d'une partie des Stern SAM vit dans la mémoire de la ROM, pas dans VPX ; sans
// mémoire, la ROM joue son volume d'usine (12 sur 31 en WPC), et le seul moyen de le monter était
// la porte du monnayeur en partie. Cyber Pinball le lit, le dit, le règle, et monte de lui-même un
// volume d'usine bas ; un volume choisi par le joueur (ici ou à la porte) est gardé.
//
// Mesures du banc libpinmame du 17/11/2026, sur lesquelles reposent ces essais (memoires-rom) :
// - sans mémoire, la ROM pose son volume d'usine, somme juste : 12 (mb_106b, taf_l7), 40 (st_161h,
//   twd_160h) ; Back to the Future (Data East) n'a pas de volume dans sa carte ;
// - un volume écrit avec sa somme juste est celui de la ROM au démarrage suivant (Monster Bash : la
//   carte son reçoit 0x55 0xAA puis 8 × volume + 7, soit 207 pour 25), et elle le réécrit tel quel ;
// - avec une somme fausse, elle revient à son volume d'usine (12, ou 40) ;
// - un cran vaut 1,3 dB en WPC (Monster Bash, même son : −41 dBFS à 12, −26,5 à 23, −16 à 31).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, romVolumeFinding, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import { HEALTH_CHECK_FINDINGS, tablesFacts } from '../health';
import { setLanguage } from '../i18n';
import { readRomVolume, romChecksums, romMasterVolume, writeRomVolume } from '../romscores';
import {
  isFactoryRomVolume,
  isLowRomVolume,
  readRomVolumeChoices,
  romFactoryVolume,
  romVolumeAdvice,
  romVolumeChangedInGame,
  romVolumeChoice,
  romVolumeGesture,
  romVolumeLine,
  romVolumeStatus,
  romVolumeTarget,
  saveRomVolumeChoice,
  setRomVolume,
  tablePinmameDir,
  WPC_FACTORY_VOLUME,
  type RomVolumeStatus,
} from '../romvolume';
import { scanTables, type TableEntry } from '../tables';
import { DEFAULT_BUTTONS } from '../buttons';
import { cacheRealMaps, realMemory, realNv } from './memoires-rom';
import { REPO_ROOT } from './i18n-scan';

setLanguage('fr');

const MB = realMemory('mb_106');
const TAF = realMemory('taf_l7');
const ST = realMemory('st_161h');
const TWD = realMemory('twd_160h');
const BTTF = realMemory('bttf_a27');

/** Les octets du bloc du volume (l'octet et sa somme) : WPC 3 octets, SAM 2. */
const block = (nv: Buffer, at: number, length: number) => [...nv.subarray(at, at + length)];

test('mémoires réelles : la carte situe le volume des WPC et des SAM, la ROM pose son volume d’usine, somme juste', () => {
  for (const [memory, nv, max, factory] of [
    [MB, realNv('mb_106b-usine'), 31, 12],
    [TAF, realNv('taf_l7-usine'), 31, 12],
    [ST, realNv('st_161h-usine'), 63, 40],
    [TWD, realNv('twd_160h-usine'), 63, 40],
  ] as const) {
    const spot = romMasterVolume(memory)!;
    assert.equal(spot.max, max);
    assert.equal(spot.min, 0);
    assert.equal(romFactoryVolume(memory, spot), factory, 'volume d’usine : celui de la carte (SAM), sinon celui mesuré des WPC');
    assert.deepEqual(readRomVolume(memory, nv), { value: factory }, 'relevé dans la mémoire que la ROM a écrite');
  }
  assert.equal(WPC_FACTORY_VOLUME, 12);
});

test('écrire le volume : le bloc est celui que la ROM réécrit elle-même après l’avoir accepté', () => {
  // The Addams Family : 25 posé dans la mémoire d'usine, la ROM a démarré dessus et réécrit le même bloc.
  const taf = writeRomVolume(TAF, realNv('taf_l7-usine'), 25);
  assert.ok(taf.ok);
  assert.deepEqual(block(taf.data, 0x1c9c, 3), block(realNv('taf_l7-25'), 0x1c9c, 3));
  assert.deepEqual(block(taf.data, 0x1c9c, 3), [0x19, 0xff, 0xe6]);
  // Stern SAM : 55, même chose (octet et somme 8 bits complémentée).
  for (const [memory, rom, at] of [
    [ST, 'st_161h', 0x10250],
    [TWD, 'twd_160h', 0x10204],
  ] as const) {
    const out = writeRomVolume(memory, realNv(`${rom}-usine`), 55);
    assert.ok(out.ok, rom);
    assert.deepEqual(block(out.data, at, 2), block(realNv(`${rom}-55`), at, 2), rom);
    assert.deepEqual(block(out.data, at, 2), [55, ~55 & 0xff]);
  }
  // Monster Bash : 25 → 19 FF E6 (la ROM l'a pris : 207 envoyé à la carte son au démarrage).
  const mb = writeRomVolume(MB, realNv('mb_106b-usine'), 25);
  assert.ok(mb.ok);
  assert.deepEqual(block(mb.data, 0x1ccf, 3), [0x19, 0xff, 0xe6]);
});

test('invariant : seul le bloc du volume change, toutes les sommes restent justes, la relecture rend la valeur', () => {
  for (const [memory, name] of [
    [MB, 'mb_106b-usine'],
    [TAF, 'taf_l7-usine'],
    [ST, 'st_161h-usine'],
    [TWD, 'twd_160h-usine'],
  ] as const) {
    const nv = realNv(name);
    const spot = romMasterVolume(memory)!;
    const sumsBefore = romChecksums(memory, nv);
    for (let value = spot.min; value <= spot.max; value++) {
      const out = writeRomVolume(memory, nv, value);
      assert.ok(out.ok, `${name} ${value}`);
      assert.deepEqual(readRomVolume(memory, out.data), { value });
      // Une somme juste avant le reste ; aucune nouvelle somme fausse.
      assert.deepEqual(romChecksums(memory, out.data), sumsBefore, `${name} ${value}`);
      const changed = [...out.data.keys()].filter((i) => out.data[i] !== nv[i]);
      assert.ok(changed.length <= 3, `${name} ${value} : ${changed.length} octets changés`);
      assert.equal(out.data.length, nv.length, 'même taille de mémoire');
    }
  }
});

test('somme fausse ou bloc vierge : la ROM remettra son volume d’usine, et l’écriture le refait juste', () => {
  const nv = realNv('mb_106b-usine');
  // Octet changé sans sa somme (mesuré : la ROM revient à 12).
  const bad = Buffer.from(nv);
  bad[0x1ccf] = 25;
  assert.deepEqual(readRomVolume(MB, bad), { blank: true });
  // Bloc vierge, comme PinMAME le laisse avant que la ROM l'écrive.
  const blank = Buffer.from(nv);
  blank.fill(0xff, 0x1ccf, 0x1cd2);
  assert.deepEqual(readRomVolume(MB, blank), { blank: true });
  const fixed = writeRomVolume(MB, blank, 23);
  assert.ok(fixed.ok);
  assert.deepEqual(readRomVolume(MB, fixed.data), { value: 23 });
  // SAM : même chose.
  const sam = realNv('st_161h-usine');
  sam[0x10250] = 55;
  assert.deepEqual(readRomVolume(ST, sam), { blank: true });
});

test('refus propres : machine sans volume dans sa mémoire, valeur hors plage, mémoire trop courte, bloc partagé déjà faux', () => {
  // Back to the Future (Data East) : la carte ne situe pas le volume.
  assert.equal(romMasterVolume(BTTF), undefined);
  assert.deepEqual(readRomVolume(BTTF, realNv('bttf_a27-usine')), undefined);
  assert.deepEqual(writeRomVolume(BTTF, realNv('bttf_a27-usine'), 20), { ok: false, reason: 'la carte de cette ROM ne situe pas son volume' });
  const nv = realNv('mb_106b-usine');
  assert.deepEqual(writeRomVolume(MB, nv, 32), { ok: false, reason: '32 est hors de la plage de la ROM (0 à 31)' });
  assert.equal(writeRomVolume(MB, nv, 2.5).ok, false);
  assert.deepEqual(writeRomVolume(MB, nv.subarray(0, 0x1000), 20), { ok: false, reason: 'mémoire de la ROM trop courte' });
  // Une carte qui mettrait le volume dans le bloc des réglages : une somme déjà fausse n'est jamais refaite.
  const shared = { ...MB, map: { ...MB.map, _metadata: { ...MB.map._metadata, validation: { checksum: [{ label: 'Adjustments', start: '0x1B1D', end: '0x1CD1', bits: 16, complement: true }] } } } } as typeof MB;
  const broken = Buffer.from(nv);
  broken[0x1b30] = broken[0x1b30]! ^ 1;
  assert.deepEqual(writeRomVolume(shared, broken, 20), { ok: false, reason: 'somme de contrôle déjà fausse dans « Adjustments » : la ROM remettrait ces réglages' });
});

test('volume conseillé et volume bas : d’après la plage de la ROM, jamais d’après une borne', () => {
  assert.deepEqual(romVolumeAdvice({ min: 0, max: 31 }), { recommended: 23, lowBelow: 16 });
  assert.deepEqual(romVolumeAdvice({ min: 0, max: 63 }), { recommended: 47, lowBelow: 32 });
  // Le volume d'usine des WPC est bas, celui des SAM ne l'est pas.
  const wpc = statusOf(MB, 'mb_106b', realNv('mb_106b-usine'));
  assert.ok(isLowRomVolume(wpc) && isFactoryRomVolume(wpc));
  const sam = statusOf(ST, 'st_161h', realNv('st_161h-usine'));
  assert.ok(!isLowRomVolume(sam) && isFactoryRomVolume(sam));
  assert.equal(romVolumeTarget(sam, undefined), undefined);
});

/** Une table à ROM, sa mémoire dans <table>\pinmame\nvram. */
function cabinet(rom: string, nv?: Buffer): { root: string; folder: string; dir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-rom-'));
  const folder = path.join(root, 'tables', 'Monster Bash (Williams 1998)');
  fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'pinmame', 'nvram'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Monster Bash (Williams 1998).vpx'), 'table');
  fs.writeFileSync(path.join(folder, 'pinmame', 'roms', `${rom}.zip`), 'rom');
  if (nv) fs.writeFileSync(path.join(folder, 'pinmame', 'nvram', `${rom}.nv`), nv);
  return { root, folder, dir: path.join(folder, 'pinmame') };
}

function statusOf(memory: typeof MB, rom: string, nv?: Buffer): RomVolumeStatus {
  const c = cabinet(rom, nv);
  return romVolumeStatus({ roms: [rom], pinmameDir: c.dir, memory: () => memory });
}

test('automatique : un volume d’usine bas est monté au volume conseillé ; un volume choisi est remis ; sans mémoire, rien', () => {
  const c = cabinet('mb_106b', realNv('mb_106b-usine'));
  const status = () => romVolumeStatus({ roms: ['MB_106B'], pinmameDir: tablePinmameDir(c.folder, undefined), memory: () => MB });
  const s = status();
  assert.equal(s.kind, 'set');
  assert.equal(romVolumeTarget(s, undefined), 23);
  assert.deepEqual(romVolumeLine(s, undefined), { detail: '12 sur 31, d’usine, faible : monté à 23 avant la partie', tone: 'ok', low: false });
  assert.deepEqual(setRomVolume(s, 23), { ok: true });
  assert.deepEqual(readRomVolume(MB, fs.readFileSync(path.join(c.dir, 'nvram', 'mb_106b.nv'))), { value: 23 });
  assert.equal(romVolumeTarget(status(), undefined), undefined, 'déjà posé : rien à refaire');
  assert.deepEqual(romVolumeLine(status(), undefined), { detail: '23 sur 31', tone: 'ok', low: false });
  // Le joueur a choisi 8 (bas, voulu) : remis s'il a changé, jamais « corrigé ».
  assert.equal(romVolumeTarget(status(), 8), 8);
  setRomVolume(status(), 8);
  assert.equal(romVolumeTarget(status(), 8), undefined);
  assert.deepEqual(romVolumeLine(status(), 8), { detail: '8 sur 31 (ton réglage)', tone: 'ok', low: false });
  // Choix hors plage (mémoire d'une autre ROM) : ignoré.
  assert.equal(romVolumeTarget(status(), 99), undefined);
  // Sans mémoire : la ROM la crée à sa première partie, au volume d'usine ; la fiche dit la suite.
  const absent = statusOf(MB, 'mb_106b');
  assert.equal(absent.kind, 'absent');
  assert.equal(romVolumeTarget(absent, undefined), undefined);
  assert.deepEqual(romVolumeLine(absent, undefined), { detail: 'd’usine, 12 sur 31 (faible) : monté à 23 dès la fin de la première partie', tone: 'quiet', low: false });
  assert.deepEqual(setRomVolume(absent, 20), { ok: false, reason: 'pas encore de mémoire : la ROM la crée à sa première partie' });
});

test('volume bas réglé ailleurs (ancien front-end) : signalé au médecin et à la santé, réparé d’un geste, jamais imposé', () => {
  const nv = writeRomVolume(MB, realNv('mb_106b-usine'), 6);
  assert.ok(nv.ok);
  const c = cabinet('mb_106b', nv.data);
  const status = () => romVolumeStatus({ roms: ['mb_106b'], pinmameDir: c.dir, memory: () => MB });
  assert.equal(romVolumeTarget(status(), undefined), undefined, 'pas d’usine : peut-être voulu, pas posé d’office');
  assert.deepEqual(romVolumeLine(status(), undefined), { detail: '6 sur 31 : bas', tone: 'warning', low: true });
  const tablesDir = path.join(c.root, 'tables');
  const entry = scanTables(tablesDir)[0]!;
  const ctx = (choice?: number) => ({ tablesDir, script: scriptFacts('Const cGameName="mb_106b"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\n'), romVolume: { status: status(), ...(choice !== undefined ? { choice } : {}) } });
  const finding = diagnose(entry, ctx()).find((f) => f.code === 'lowRomVolume')!;
  assert.equal(finding.title, 'Volume de la ROM bas');
  assert.equal(finding.severity, 'warning');
  assert.match(finding.detail, /mb_106b garde son volume dans sa mémoire : 6 sur 31/);
  assert.equal(finding.fix!.label, 'Monter le volume de la ROM à 23 sur 31');
  // La santé de la borne le compte parmi les tables à vérifier.
  assert.ok((HEALTH_CHECK_FINDINGS as readonly string[]).includes('lowRomVolume'));
  assert.deepEqual(tablesFacts([{ file: entry.file, title: entry.title, findings: [finding] }]).flagged, [{ file: entry.file, title: entry.title, reason: 'Volume de la ROM bas', blocking: false }]);
  // Réparé : la mémoire est relue au moment d'écrire (un record écrit depuis le constat est gardé).
  const nvFile = path.join(c.dir, 'nvram', 'mb_106b.nv');
  const later = fs.readFileSync(nvFile);
  later[0x1c94] = later[0x1c94]! ^ 0x10; // un octet des records, changé après le constat
  fs.writeFileSync(nvFile, later);
  const trashDir = path.join(c.root, 'corbeille');
  applyOps(finding.fix!.ops, { trashDir });
  const after = fs.readFileSync(nvFile);
  assert.deepEqual(readRomVolume(MB, after), { value: 23 });
  assert.equal(after[0x1c94], later[0x1c94], 'le record écrit depuis est gardé');
  assert.ok(fs.readdirSync(trashDir).some((f) => f.startsWith('mb_106b')), 'l’ancienne mémoire à la corbeille');
  assert.ok(!diagnose(entry, ctx()).some((f) => f.code === 'lowRomVolume'));
  // Un volume bas choisi par le joueur n'est pas signalé.
  assert.equal(romVolumeFinding({ status: statusOf(MB, 'mb_106b', nv.data), choice: 6 }), undefined);
  // Machine sans volume en mémoire : rien.
  assert.equal(romVolumeFinding({ status: { kind: 'none', reason: 'x' } }), undefined);
});

test('volume changé à la porte pendant la partie : devient le choix du joueur ; une première partie au volume d’usine n’en est pas un', () => {
  const set = (value: number) => statusOf(MB, 'mb_106b', (writeRomVolume(MB, realNv('mb_106b-usine'), value) as { data: Buffer }).data);
  assert.equal(romVolumeChangedInGame(set(23), set(27)), 27);
  assert.equal(romVolumeChangedInGame(set(23), set(23)), undefined);
  const absent = statusOf(MB, 'mb_106b');
  assert.equal(romVolumeChangedInGame(absent, set(12)), undefined, 'mémoire créée au volume d’usine');
  assert.equal(romVolumeChangedInGame(absent, set(18)), 18, 'monté à la porte dès la première partie');
  assert.equal(romVolumeChangedInGame({ kind: 'none', reason: 'x' }, set(18)), undefined);
});

test('machine sans volume en mémoire, ROM sans carte, table sans ROM : l’état le dit, sans rien écrire', () => {
  const de = statusOf(BTTF, 'bttf_a27', realNv('bttf_a27-usine'));
  assert.deepEqual(de, { kind: 'none', rom: 'bttf_a27', reason: 'bttf_a27 ne garde pas son volume dans une mémoire que Cyber Pinball sait lire' });
  assert.deepEqual(setRomVolume(de, 20), { ok: false, reason: de.kind === 'none' ? de.reason : '' });
  assert.equal(romVolumeLine(de, undefined), undefined);
  assert.deepEqual(romVolumeStatus({ roms: ['mb_106b'], pinmameDir: 'x', memory: () => undefined }), { kind: 'none', rom: 'mb_106b', reason: 'carte mémoire de mb_106b pas encore connue' });
  assert.deepEqual(romVolumeStatus({ roms: [], pinmameDir: 'x', memory: () => MB }), { kind: 'none', reason: 'la table ne joue pas de ROM' });
  // Plusieurs ROM : la première dont la carte situe le volume.
  const c = cabinet('mb_106b', realNv('mb_106b-usine'));
  assert.equal(romVolumeStatus({ roms: ['bttf_a27', 'mb_106b'], pinmameDir: c.dir, memory: (rom) => (rom === 'mb_106b' ? MB : BTTF) }).kind, 'set');
});

test('le dossier de la mémoire : celui de la table quand elle a ses ROM, sinon le dossier PinMAME commun', () => {
  const c = cabinet('mb_106b');
  assert.equal(tablePinmameDir(c.folder, 'D:\\commun'), c.dir);
  fs.rmSync(path.join(c.dir, 'roms'), { recursive: true });
  assert.equal(tablePinmameDir(c.folder, 'D:\\commun'), 'D:\\commun');
});

test('le choix du joueur, gardé par mémoire ; le geste de la machine avec les touches de la borne', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-volume-choix-'));
  const nv = path.join(dir, 'pinmame', 'nvram', 'mb_106b.nv');
  saveRomVolumeChoice(dir, nv, 18);
  assert.equal(romVolumeChoice(readRomVolumeChoices(dir), nv.toUpperCase()), 18);
  saveRomVolumeChoice(dir, nv, undefined);
  assert.equal(romVolumeChoice(readRomVolumeChoices(dir), nv), undefined);
  fs.writeFileSync(path.join(dir, 'volumes-rom.json'), '{ "a": "x", "b": 300, "c": 5 }');
  assert.deepEqual(readRomVolumeChoices(dir), { c: 5 });
  assert.equal(romVolumeGesture(DEFAULT_BUTTONS), 'pendant la partie, ouvrir la porte du monnayeur (Fin), puis − (8) ou + (9)');
  assert.equal(romVolumeGesture({ ...DEFAULT_BUTTONS, coinDoor: undefined }), undefined);
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRomVolumes } = require(path.join(REPO_ROOT, 'app', 'dist', 'rom-volume.js')) as {
  createRomVolumes(o: { dataDir: string; romsOf(t: TableEntry): readonly string[]; sharedPinmame(): string | undefined; log?(l: string): void }): {
    view(t: TableEntry): { status: RomVolumeStatus; choice?: number };
    line(t: TableEntry): ReturnType<typeof romVolumeLine>;
    beforeGame(t: TableEntry): void;
    afterGame(t: TableEntry): void;
    choose(t: TableEntry, value: number | undefined): { ok: true } | { ok: false; reason: string };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('avant et après la partie (app) : usine monté, porte gardée, première partie montée aussitôt, choix retenu', () => {
  const c = cabinet('taf_l7');
  const dataDir = path.join(c.root, 'donnees');
  cacheRealMaps(path.join(dataDir, 'cache', 'cartes-memoire'), { taf_l7: 'taf_l7' });
  const log: string[] = [];
  const volumes = createRomVolumes({ dataDir, romsOf: () => ['taf_l7'], sharedPinmame: () => undefined, log: (l) => log.push(l) });
  const table = scanTables(path.join(c.root, 'tables'))[0]! as TableEntry;
  const nvFile = path.join(c.dir, 'nvram', 'taf_l7.nv');
  const volume = () => readRomVolume(TAF, fs.readFileSync(nvFile));
  // Première partie : pas de mémoire, rien posé ; la ROM la crée au volume d'usine, montée aussitôt après.
  volumes.beforeGame(table);
  assert.ok(!fs.existsSync(nvFile));
  fs.writeFileSync(nvFile, realNv('taf_l7-usine'));
  volumes.afterGame(table);
  assert.deepEqual(volume(), { value: 23 });
  assert.match(log.join('\n'), /Volume de la ROM \(.*taf_l7\) : 12 → 23 sur 31 après la partie \(volume d’usine bas, conseillé\)/);
  // Le joueur monte à 27 à la porte pendant la partie : gardé, jamais redescendu.
  volumes.beforeGame(table);
  fs.writeFileSync(nvFile, (writeRomVolume(TAF, fs.readFileSync(nvFile), 27) as { data: Buffer }).data);
  volumes.afterGame(table);
  assert.equal(volumes.view(table).choice, 27);
  volumes.beforeGame(table);
  assert.deepEqual(volume(), { value: 27 });
  // Une autre application remet la mémoire d'usine : le choix du joueur revient avant la partie.
  fs.writeFileSync(nvFile, realNv('taf_l7-usine'));
  volumes.beforeGame(table);
  assert.deepEqual(volume(), { value: 27 });
  // « Réglages de cette table » : 10, écrit tout de suite ; puis automatique (10 n'est pas d'usine : gardé).
  assert.deepEqual(volumes.choose(table, 10), { ok: true });
  assert.deepEqual(volume(), { value: 10 });
  assert.deepEqual(volumes.choose(table, undefined), { ok: true });
  assert.equal(volumes.view(table).choice, undefined);
  assert.deepEqual(volume(), { value: 10 });
  assert.deepEqual(volumes.line(table), { detail: '10 sur 31 : bas', tone: 'warning', low: true });
  // Machine sans volume en mémoire : refus avec la raison, rien d'écrit.
  const de = createRomVolumes({ dataDir, romsOf: () => ['bttf_a27'], sharedPinmame: () => undefined });
  assert.deepEqual(de.choose(table, 10), { ok: false, reason: 'carte mémoire de bttf_a27 pas encore connue' });
});
