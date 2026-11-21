// Mise en route des ROM sans mémoire (romfirstboot.ts, app/src/rom-first-boot.ts, 21/11/2026).
// Sans mémoire (<pinmame>\nvram\<rom>.nv), la première partie d'une table à ROM s'arrêtait sur
// « FACTORY SETTINGS RESTORED » : pièces sonores mais sans crédit, il fallait quitter et relancer.
// Invariants : la mise en route ne presse qu'Échap (ni pièce ni Start), ne remplace jamais une
// mémoire présente, et se fait avant la partie (avant le volume de la ROM, qui s'y écrit).
// Banc réel (l'enregistreur en mode « boot » sur de vraies ROM) quand CYBERPINBALL_BANC_ROMS
// donne un dossier de .zip et CYBERPINBALL_PINMAME_DLL la pinmame64.dll de VPX.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { PINMAME_KEYS } from '../romaudio';
import { adoptRomMemory, noteRomBoot, ROM_BOOT_MAX_TRIES, ROM_BOOT_PLAN, romBootKeyPressed, romBootWanted, romMemoryFile, romMemoryMissing } from '../romfirstboot';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-miseenroute-'));

test('mise en route : Échap seul, autour de 12-13 s émulées ; jamais de pièce ni de Start', () => {
  for (let t = 0; t < ROM_BOOT_PLAN.stopAt; t += 0.05) {
    assert.equal(romBootKeyPressed(PINMAME_KEYS.coin, t), false);
    assert.equal(romBootKeyPressed(PINMAME_KEYS.start, t), false);
  }
  assert.equal(romBootKeyPressed(PINMAME_KEYS.escape, 12.1), true);
  assert.equal(romBootKeyPressed(PINMAME_KEYS.escape, 13.1), true);
  assert.equal(romBootKeyPressed(PINMAME_KEYS.escape, 5), false);
  assert.ok(ROM_BOOT_PLAN.stopAt > Math.max(...ROM_BOOT_PLAN.escapeAt) + 5, 'la machine a le temps de redémarrer après Échap');
});

test('mémoire absente : dite manquante pour la ROM chargée ; présente, plus rien à faire', () => {
  const dir = tmp();
  const need = romMemoryMissing({ roms: ['TAF_L7'], pinmameDir: dir });
  assert.deepEqual(need, { rom: 'taf_l7', pinmameDir: dir, file: path.join(dir, 'nvram', 'taf_l7.nv') });
  fs.mkdirSync(path.join(dir, 'nvram'));
  fs.writeFileSync(romMemoryFile(dir, 'taf_l7'), 'x');
  assert.equal(romMemoryMissing({ roms: ['taf_l7'], pinmameDir: dir }), undefined);
  assert.equal(romMemoryMissing({ roms: [], pinmameDir: dir }), undefined);
  assert.equal(romMemoryMissing({ roms: ['taf_l7'], pinmameDir: undefined }), undefined);
});

test('la mémoire mise en route est posée si elle manque, jamais par-dessus une mémoire présente', () => {
  const dir = tmp();
  const from = path.join(dir, 'banc.nv');
  fs.writeFileSync(from, Buffer.from([1, 2, 3]));
  const need = romMemoryMissing({ roms: ['mb_106b'], pinmameDir: path.join(dir, 'pinmame') })!;
  assert.equal(adoptRomMemory(from, need), 'adopted');
  assert.deepEqual([...fs.readFileSync(need.file)], [1, 2, 3]);
  // Une partie jouée entre-temps a écrit ses records : gardés.
  fs.writeFileSync(need.file, Buffer.from([9]));
  assert.equal(adoptRomMemory(from, need), 'present');
  assert.deepEqual([...fs.readFileSync(need.file)], [9]);
  // Le banc n'a rien écrit.
  assert.equal(adoptRomMemory(path.join(dir, 'absent.nv'), { ...need, file: path.join(dir, 'autre.nv') }), 'none');
});

test('échecs : réessayée d’office deux fois au plus ; une réussite remet le compte à zéro', () => {
  let state = noteRomBoot({}, 'afm_113b', { result: 'failed', detail: 'x' });
  assert.equal(romBootWanted(state, 'afm_113b'), ROM_BOOT_MAX_TRIES > 1);
  for (let i = 1; i < ROM_BOOT_MAX_TRIES; i++) state = noteRomBoot(state, 'afm_113b', { result: 'failed' });
  assert.equal(romBootWanted(state, 'afm_113b'), false);
  state = noteRomBoot(state, 'afm_113b', { result: 'ok' });
  assert.equal(romBootWanted(state, 'afm_113b'), true);
  assert.equal(state.afm_113b!.tries, 0);
});

test('avant la partie : la ROM est mise en route avant que son volume ne s’écrive, jamais avec un autre VPX', () => {
  const src = frontendSource();
  const boot = src.indexOf('romFirstBoot.beforeGame(');
  const volume = src.indexOf('romVolumes.beforeGame(');
  assert.ok(boot > 0 && volume > boot, 'mise en route, puis volume de la ROM');
  assert.match(src.slice(boot - 200, boot), /!otherVpx && !displayMode/);
  // La musique de la ROM attend qu'une mise en route ait fini.
  assert.match(src, /romFirstBoot\?\.active\(\) === true/);
  const worker = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'enregistreur-rom.ts'), 'utf8');
  // Mode « boot » : le résultat n'est écrit qu'une fois PinMAME arrêté (sa mémoire écrite).
  assert.match(worker, /Stop\.async\(\(\) => \{\s*if \(boot\) save\(\);/);
});

test('ROM sans son (ROM de son absentes) : paquet vide ignoré, horloge réelle, arrêt borné', () => {
  const worker = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'enregistreur-rom.ts'), 'utf8');
  const audio = worker.slice(worker.indexOf('const onAudio'), worker.indexOf('const onDisplay'));
  // koffi refuse un tableau de longueur nulle : l'exception tuait l'enregistreur (afm_113b sans son parent).
  assert.ok(audio.indexOf('if (n <= 0 || !buffer) return samples;') >= 0 && audio.indexOf('if (n <= 0') < audio.indexOf('copyBytes('));
  assert.match(worker, /if \(boot && !wallClock && !bytes && wall\(\) > 3\) wallClock = true;/);
  assert.match(worker, /else if \(boot && wall\(\) > BOOT_WALL_LIMIT\) finish\(\);/);
});

const ROMS = process.env.CYBERPINBALL_BANC_ROMS;
const DLL = process.env.CYBERPINBALL_PINMAME_DLL;
const bench = Boolean(ROMS && DLL && fs.existsSync(ROMS) && fs.existsSync(DLL));
test('banc réel : chaque ROM mise en route écrit sa mémoire (CYBERPINBALL_BANC_ROMS, CYBERPINBALL_PINMAME_DLL)', { skip: bench ? false : 'banc libpinmame non demandé', timeout: 10 * 60_000 }, () => {
  const worker = path.join(REPO_ROOT, 'app', 'dist', 'enregistreur-rom.js');
  assert.ok(fs.existsSync(worker), 'app compilée');
  const zips = fs.readdirSync(ROMS!).filter((f) => /\.zip$/i.test(f));
  assert.ok(zips.length > 0);
  for (const zip of zips) {
    const rom = zip.replace(/\.zip$/i, '').toLowerCase();
    const dir = tmp();
    for (const d of ['roms', 'nvram', 'cfg']) fs.mkdirSync(path.join(dir, d));
    fs.copyFileSync(path.join(ROMS!, zip), path.join(dir, 'roms', `${rom}.zip`));
    const job = { dll: DLL!, vpmPath: dir + path.sep, rom, switches: [], seconds: ROM_BOOT_PLAN.stopAt, pcm: path.join(dir, 'son.pcm'), result: path.join(dir, 'resultat.json'), mode: 'boot' };
    fs.writeFileSync(path.join(dir, 'tache.json'), JSON.stringify(job));
    // Comme le service : en mode Node (les tests peuvent tourner sous l'exécutable d'Electron).
    const run = spawnSync(process.execPath, [worker, path.join(dir, 'tache.json')], { timeout: 3 * 60_000, windowsHide: true, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    assert.ok(fs.existsSync(job.result), `${rom} : aucun résultat (code ${run.status}) ${run.stderr?.slice(0, 400) ?? ''}`);
    const result = JSON.parse(fs.readFileSync(job.result, 'utf8')) as { ok: boolean; seconds: number };
    assert.ok(result.ok, `${rom} : ${JSON.stringify(result)}`);
    const nv = romMemoryFile(dir, rom);
    assert.ok(fs.existsSync(nv) && fs.statSync(nv).size > 0, `${rom} : mémoire écrite`);
  }
});
