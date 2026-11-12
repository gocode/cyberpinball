// Musique de la ROM (romaudio.ts) : interrupteurs lus dans le script, calendrier des appuis,
// découpe du son, conteneur Ogg Opus, état des ROM (une ROM muette n'est jamais réessayée
// d'office) et dossier de travail (la NVRAM de la table n'est jamais touchée). Le service
// (app/src/rom-music.ts) et l'enregistreur (app/src/enregistreur-rom.ts) sont relus pour ce
// qui ne se joue pas sans PinMAME. Mesure sur les vraies ROM : docs/manuel.md, « Musique de la ROM ».

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { localMediaChoices } from '../mediachoices';
import { mediaStateLabel } from '../mediaedit';
import { resolveMedia } from '../medias';
import { allowedMediaDirs, isServedMedia } from '../mediaview';
import {
  clipRomAudio,
  mechRestSwitches,
  noteRomAudio,
  oggCrc,
  oggOpusFile,
  opusPacketSamples,
  PINMAME_KEYS,
  prepareRomScratch,
  readRomAudioState,
  ROM_AUDIO_MAX_TRIES,
  ROM_AUDIO_PLAN,
  romAudioFile,
  romAudioWanted,
  romKeyboardWanted,
  romKeyPressed,
  romStartSwitches,
  troughSwitches,
  withoutDc,
  writeRomAudioState,
} from '../romaudio';
import { scanTables } from '../tables';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-romaudio-'));

// ---------------------------------------------------------------------------
// Interrupteurs

test('musique de la ROM : interrupteurs de la gouttière lus dans le script, sous ses trois formes', () => {
  // Terminator 2 (g5k) : InitSw, le premier nombre est l'entrée de la gouttière.
  assert.deepEqual(troughSwitches('Set bsTrough = New cvpmBallStack\nbsTrough.InitSw 18,17,16,15,0,0,0,0\n'), [17, 16, 15]);
  assert.deepEqual(troughSwitches('    bsTrough.InitSw 0, 21, 20, 19, 18, 0, 0, 0'), [21, 20, 19, 18]);
  // Back to the Future, The Walking Dead : un interrupteur par Kicker, sur une ligne qui parle de la gouttière.
  const bttf = ['Sub Kicker3_Hit():Controller.Switch(11) = 1:UpdateTrough:End Sub', 'Sub Kicker3_UnHit():Controller.Switch(11) = 0:UpdateTrough:End Sub', 'Sub Kicker2_Hit():Controller.Switch(12) = 1:UpdateTrough:End Sub'];
  assert.deepEqual(troughSwitches(bttf.join('\n')), [11, 12]);
  // cvpmTrough : InitSwitches dans un bloc With.
  assert.deepEqual(troughSwitches('With bsTrough\n  .Size = 4\n  .InitSwitches Array(32, 33, 34, 35)\nEnd With\n'), [32, 33, 34, 35]);
  // Commentaires et lignes sans rapport : rien.
  assert.deepEqual(troughSwitches("' bsTrough.InitSw 0, 1, 2\nSub Target1_Hit: Controller.Switch(44) = 1: End Sub\n"), []);
  // Huit au plus.
  assert.equal(troughSwitches('bsTrough.InitSw 0,1,2,3,4,5,6,7,8,9,10').length, 8);
});

test('musique de la ROM : mécanismes au repos (The Addams Family : sans eux, Start ne lance pas la partie)', () => {
  const taf = [
    '\tSet ThingMech = New cvpmMyMech',
    '\t\tWith ThingMech',
    "\t\t\t.AddSw 85, 59, 60 \t\t\t\t\t' Thing Up Opto",
    "\t\t\t.AddSw 84, 0, 1 \t\t\t\t\t' Thing Down Opto",
    '\t\tEnd With',
    "\t\t\t.AddSw 81, 89, 90 \t\t\t\t\t' Bookcase Open",
    "\t\t\t.AddSw 82, 0, 1 \t\t\t\t\t' Bookcase Close",
    "'\t\t\t.AddSw 99, 0, 1",
  ].join('\n');
  assert.deepEqual(mechRestSwitches(taf), [84, 82]);
  const script = `${taf}\nSub Trough3_Hit: Controller.Switch(15) = 1: End Sub\nSub Trough2_Hit: Controller.Switch(16) = 1:troughW2.isDropped = 0: End Sub\n`;
  assert.deepEqual(romStartSwitches(script), [15, 16, 84, 82]);
  assert.deepEqual(romStartSwitches(undefined), []);
});

// ---------------------------------------------------------------------------
// Calendrier

test('musique de la ROM : Échap, pièces puis Start, au temps émulé ; clavier lu seulement autour des appuis', () => {
  const p = ROM_AUDIO_PLAN;
  assert.ok(p.escapeAt[0]! < p.coinAt[0]! && p.coinAt[p.coinAt.length - 1]! < p.startAt, 'Échap avant les pièces, pièces avant Start');
  assert.ok(romKeyPressed(PINMAME_KEYS.escape, p.escapeAt[0]! + 0.1));
  assert.ok(!romKeyPressed(PINMAME_KEYS.escape, p.escapeAt[0]! + 0.5));
  for (const at of p.coinAt) assert.ok(romKeyPressed(PINMAME_KEYS.coin, at + 0.1));
  assert.ok(romKeyPressed(PINMAME_KEYS.start, p.startAt + 0.1));
  assert.ok(!romKeyPressed(PINMAME_KEYS.start, p.startAt - 0.1));
  assert.ok(!romKeyPressed(42, p.startAt + 0.1), 'autre touche jamais pressée');
  // Allumé un peu avant chaque appui et jusqu'après, éteint le reste du temps.
  for (const at of [...p.escapeAt, ...p.coinAt, p.startAt]) {
    assert.ok(romKeyboardWanted(at - 0.1) && romKeyboardWanted(at + p.press));
  }
  assert.ok(!romKeyboardWanted(5) && !romKeyboardWanted(17) && !romKeyboardWanted(p.startAt + 3));
});

// ---------------------------------------------------------------------------
// Découpe

const RATE = 44_100;
function signal(seconds: number, channels: number, at: (t: number) => number): Int16Array {
  const out = new Int16Array(Math.round(seconds * RATE) * channels);
  for (let i = 0; i < out.length / channels; i++) for (let c = 0; c < channels; c++) out[i * channels + c] = Math.round(at(i / RATE));
  return out;
}
const tone = (t: number, amp = 2000) => amp * Math.sin(2 * Math.PI * 440 * t);

test('musique de la ROM : la composante continue des cartes WPC ne passe pas pour du son', () => {
  // T2 et TAF muets : un décalage constant d'environ 3 200 (−20 dBFS), relevé sur la borne.
  const muted = signal(40, 1, () => 3224);
  assert.deepEqual(clipRomAudio(muted, 1, RATE), { ok: false, loudSeconds: 0 });
  const filtered = withoutDc(muted, 1);
  assert.ok(Math.abs(filtered[filtered.length - 1]!) < 1, 'décalage retiré');
});

test('musique de la ROM : de Start au premier long silence, normalisée, avec un fondu', () => {
  const start = ROM_AUDIO_PLAN.startAt;
  // Pièces avant Start (écartées), puis 12 s de musique, puis le silence ; décalage continu en prime.
  const s = signal(start + 20, 2, (t) => 3200 + (t > 20 && t < 22 ? tone(t) : t >= start && t < start + 12 ? tone(t, 1000) : 0));
  const clip = clipRomAudio(s, 2, RATE);
  assert.ok(clip.ok);
  assert.ok(Math.abs(clip.from - start) < 0.2, `commence à Start (${clip.from})`);
  assert.ok(clip.seconds > 12 && clip.seconds < 12.6, `s'arrête au silence (${clip.seconds} s)`);
  let peak = 0;
  for (const v of clip.samples) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak > 0.75 * 32767 && peak <= 0.81 * 32767, `normalisée vers 80 % (${peak})`);
  const last = clip.samples.slice(-200);
  assert.ok(Math.max(...last.map(Math.abs)) < 0.05 * 32767, 'fondu de fin');
  // Des pièces, puis plus rien après Start : rien à garder.
  const coinsOnly = signal(start + 20, 1, (t) => (t > 20 && t < 22 ? tone(t) : 0));
  assert.equal(clipRomAudio(coinsOnly, 1, RATE).ok, false);
});

test('musique de la ROM : une musique qui ne s’arrête pas est gardée jusqu’au bout de l’enregistrement', () => {
  const start = ROM_AUDIO_PLAN.startAt;
  const s = signal(start + ROM_AUDIO_PLAN.keepFor, 1, (t) => (t >= start ? tone(t) : 0));
  const clip = clipRomAudio(s, 1, RATE);
  assert.ok(clip.ok && clip.seconds > ROM_AUDIO_PLAN.keepFor - 0.5);
});

// ---------------------------------------------------------------------------
// Ogg Opus

/** Pages d'un fichier Ogg, CRC vérifié. */
function oggPages(file: Buffer) {
  const pages: { flags: number; granule: bigint; sequence: number; packets: Buffer[]; lacing: number[] }[] = [];
  let at = 0;
  let pending: Buffer[] = [];
  while (at < file.length) {
    assert.equal(file.toString('latin1', at, at + 4), 'OggS');
    const count = file[at + 26]!;
    const lacing = [...file.subarray(at + 27, at + 27 + count)];
    const size = lacing.reduce((a, b) => a + b, 0);
    const page = Buffer.from(file.subarray(at, at + 27 + count + size));
    const crc = page.readUInt32LE(22);
    page.writeUInt32LE(0, 22);
    assert.equal(oggCrc(page), crc, 'CRC de la page');
    const packets: Buffer[] = [];
    let body = at + 27 + count;
    for (const l of lacing) {
      pending.push(file.subarray(body, body + l));
      body += l;
      if (l < 255) {
        packets.push(Buffer.concat(pending));
        pending = [];
      }
    }
    pages.push({ flags: file[at + 5]!, granule: file.readBigInt64LE(at + 6), sequence: file.readUInt32LE(at + 18), packets, lacing });
    at += 27 + count + size;
  }
  return pages;
}

test('musique de la ROM : CRC des pages Ogg (polynôme 0x04C11DB7, départ à 0, sans réflexion)', () => {
  assert.equal(oggCrc(Buffer.from('123456789')), 0x89a1897f);
  assert.equal(oggCrc(Buffer.alloc(0)), 0);
});

test('musique de la ROM : durée d’un paquet Opus d’après son octet TOC', () => {
  assert.equal(opusPacketSamples(Uint8Array.of((31 << 3) | 0, 1, 2)), 960); // CELT 20 ms, une trame
  assert.equal(opusPacketSamples(Uint8Array.of((31 << 3) | 1, 1)), 1920); // deux trames égales
  assert.equal(opusPacketSamples(Uint8Array.of((28 << 3) | 3, 3)), 3 * 120); // CELT 2,5 ms, trois trames
  assert.equal(opusPacketSamples(Uint8Array.of((1 << 3) | 0)), 960); // SILK 20 ms
  assert.equal(opusPacketSamples(Uint8Array.of((13 << 3) | 0)), 960); // hybride 20 ms
  assert.equal(opusPacketSamples(new Uint8Array(0)), 0);
});

test('musique de la ROM : fichier Ogg Opus (RFC 7845) relu page par page', () => {
  // 120 paquets de 20 ms (2,4 s), dont un de 510 octets (laçage 255, 255, 0) ; durée réelle 2,39 s.
  const packets = Array.from({ length: 120 }, (_v, i) => {
    const p = new Uint8Array(i === 7 ? 510 : 40 + (i % 9));
    p[0] = 31 << 3;
    p.fill(i & 0xff, 1);
    return p;
  });
  const samples = Math.round(2.39 * 48_000);
  const file = oggOpusFile({ channels: 2, inputRate: 44_100, preSkip: 312, packets, samples });
  const pages = oggPages(file);
  assert.equal(pages[0]!.flags, 0x02, 'début de flux');
  const head = pages[0]!.packets[0]!;
  assert.equal(head.toString('latin1', 0, 8), 'OpusHead');
  assert.equal(head[9], 2);
  assert.equal(head.readUInt16LE(10), 312);
  assert.equal(head.readUInt32LE(12), 44_100);
  assert.equal(pages[1]!.packets[0]!.toString('latin1', 0, 8), 'OpusTags');
  assert.deepEqual(pages.map((p) => p.sequence), pages.map((_p, i) => i), 'numéros de page suivis');
  const audio = pages.slice(2);
  assert.ok(audio.length >= 3, 'une page par seconde environ');
  assert.equal(audio[audio.length - 1]!.flags, 0x04, 'fin de flux');
  assert.equal(audio[audio.length - 1]!.granule, BigInt(312 + samples), 'la dernière page s’arrête à la durée réelle');
  for (let i = 1; i < audio.length; i++) assert.ok(audio[i]!.granule > audio[i - 1]!.granule);
  const got = audio.flatMap((p) => p.packets);
  assert.equal(got.length, packets.length);
  assert.ok(got.every((p, i) => Buffer.compare(p, Buffer.from(packets[i]!)) === 0), 'paquets intacts');
  assert.ok(audio.some((p) => p.lacing.join(',').includes('255,255,0')), 'paquet de 510 octets terminé par un laçage nul');
});

// ---------------------------------------------------------------------------
// État : une ROM muette n'est jamais réessayée d'office

test('musique de la ROM : une ROM muette n’est jamais réessayée d’office, une ROM en échec une fois de plus', () => {
  let state = {};
  assert.ok(romAudioWanted(state, 't2_l8', false), 'jamais essayée');
  assert.ok(!romAudioWanted(state, 't2_l8', true), 'déjà enregistrée');
  state = noteRomAudio(state, 'TAF_L7', { result: 'silent', detail: '0 s' });
  assert.ok(!romAudioWanted(state, 'taf_l7', false), 'muette : jamais d’office (casse du nom indifférente)');
  assert.ok(romAudioWanted(state, 'taf_l7', false, true), 'demandée depuis Médias du jeu : réessayée');
  state = noteRomAudio(state, 'st_161h', { result: 'failed' });
  assert.ok(romAudioWanted(state, 'st_161h', false));
  for (let i = 1; i < ROM_AUDIO_MAX_TRIES; i++) state = noteRomAudio(state, 'st_161h', { result: 'failed' });
  assert.equal((state as Record<string, { tries: number }>).st_161h!.tries, ROM_AUDIO_MAX_TRIES);
  assert.ok(!romAudioWanted(state, 'st_161h', false), 'échecs répétés : on n’insiste plus');
  state = noteRomAudio(state, 'bttf_a27', { result: 'ok', seconds: 30 });
  assert.ok(romAudioWanted(state, 'bttf_a27', false), 'notée mais fichier disparu (cache vidé) : refaite');
  // Gardé sur le disque, relu au démarrage.
  const dataDir = tmp();
  writeRomAudioState(dataDir, state);
  assert.deepEqual(readRomAudioState(dataDir), state);
  assert.equal(romAudioFile(dataDir, 'TAF_L7'), path.join(dataDir, 'cache', 'musiques-rom', 'taf_l7.ogg'));
  fs.writeFileSync(path.join(dataDir, 'cache', 'musiques-rom', 'etat.json'), '{abîmé');
  assert.deepEqual(readRomAudioState(dataDir), {}, 'fichier illisible : on repart de zéro');
});

// ---------------------------------------------------------------------------
// Dossier de travail : la NVRAM de la table n'est jamais touchée

function hashDir(dir: string): string {
  const h = crypto.createHash('sha1');
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(`${path.relative(dir, p)}|${fs.statSync(p).mtimeMs}|`).update(fs.readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

test('musique de la ROM : copie des ROM et NVRAM vierge, hors du dossier de la table, jamais dedans', () => {
  const root = tmp();
  const table = path.join(root, 'tables', 'Terminator 2');
  fs.mkdirSync(path.join(table, 'pinmame', 'roms'), { recursive: true });
  fs.mkdirSync(path.join(table, 'pinmame', 'nvram'), { recursive: true });
  fs.writeFileSync(path.join(table, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
  fs.writeFileSync(path.join(table, 'pinmame', 'nvram', 't2_l8.nv'), 'records de la borne');
  const library = path.join(root, 'pinmame', 'roms');
  fs.mkdirSync(library, { recursive: true });
  for (const name of ['t2_p2.zip', 'afm_113b.zip', 't2_l8.zip']) fs.writeFileSync(path.join(library, name), name);
  const before = hashDir(table);

  const scratch = path.join(root, 'data', 'cache', 'musiques-rom', 'travail', 'pinmame');
  const prepared = prepareRomScratch({ scratch, rom: 't2_l8', romDirs: [path.join(table, 'pinmame', 'roms'), library], tableFolder: table });
  assert.deepEqual(prepared.copied.sort(), ['t2_l8.zip', 't2_p2.zip'], 'la ROM de la table, et sa famille dans la bibliothèque');
  assert.equal(fs.readFileSync(path.join(scratch, 'roms', 't2_l8.zip'), 'utf8'), 'rom', 'celle de la table d’abord');
  assert.deepEqual(fs.readdirSync(path.join(scratch, 'nvram')), [], 'NVRAM vierge');
  assert.deepEqual(fs.readdirSync(path.join(scratch, 'cfg')), [], 'réglages vierges');
  // PinMAME écrit dans son dossier : jamais dans celui de la table.
  fs.writeFileSync(path.join(scratch, 'nvram', 't2_l8.nv'), 'partie de l’enregistrement');
  assert.equal(hashDir(table), before, 'dossier de la table intact');
  assert.equal(fs.readFileSync(path.join(table, 'pinmame', 'nvram', 't2_l8.nv'), 'utf8'), 'records de la borne');
  // Préparé de nouveau : l'ancien dossier de travail est vidé (NVRAM vierge à chaque fois).
  prepareRomScratch({ scratch, rom: 't2_l8', romDirs: [path.join(table, 'pinmame', 'roms')], tableFolder: table });
  assert.deepEqual(fs.readdirSync(path.join(scratch, 'nvram')), []);
  // Un dossier de travail dans celui de la table (ou l'inverse) est refusé, sans rien y toucher.
  assert.throws(() => prepareRomScratch({ scratch: path.join(table, 'pinmame'), rom: 't2_l8', romDirs: [library], tableFolder: table }));
  assert.throws(() => prepareRomScratch({ scratch: path.join(table.toUpperCase(), 'x'), rom: 't2_l8', romDirs: [library], tableFolder: table }));
  assert.throws(() => prepareRomScratch({ scratch: root, rom: 't2_l8', romDirs: [library], tableFolder: table }));
  assert.equal(hashDir(table), before, 'refus sans dégât');
});

test('musique de la ROM : le service ne donne à PinMAME que le dossier de travail, jamais celui de la table', () => {
  const service = fs.readFileSync(path.join(REPO, 'app', 'src', 'rom-music.ts'), 'utf8');
  const worker = fs.readFileSync(path.join(REPO, 'app', 'src', 'enregistreur-rom.ts'), 'utf8');
  // Le dossier de travail est préparé avec la garde (tableFolder), sous <données>\cache\musiques-rom.
  assert.match(service, /prepareRomScratch\(\{ scratch: path\.join\(scratch, 'pinmame'\)[^}]*tableFolder: table\.folder \}\)/);
  assert.match(service, /const scratch = path\.join\(dir, 'travail'\)/);
  assert.match(service, /vpmPath: path\.join\(scratch, 'pinmame'\) \+ path\.sep/);
  // L'enregistreur ne connaît que sa tâche : aucun dossier de table, aucune écriture hors de ses fichiers de sortie.
  assert.doesNotMatch(worker, /table\.folder|tablesDir/);
  assert.deepEqual([...worker.matchAll(/fs\.writeFileSync\(([^,]+),/g)].map((m) => m[1]), ['job.pcm', 'job.result', 'job.result']);
  // Ni fenêtre ni son : libpinmame ne rend son son que par le rappel ; pas d'Electron dans ce processus.
  assert.doesNotMatch(worker, /from 'electron'/);
  // Lancé en mode Node, sans fenêtre, sous le menu ; arrêté quand une partie se prépare.
  assert.match(service, /ELECTRON_RUN_AS_NODE: '1'/);
  assert.match(service, /windowsHide: true/);
  assert.match(service, /PRIORITY_BELOW_NORMAL/);
  const frontend = fs.readFileSync(path.join(REPO, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /phase: 'loading', help: false \};\r?\n\s*\/\/[^\n]*\r?\n\s*romMusic\?\.pause\(\);/, 'pause dès le lancement');
  assert.match(frontend, /busy: \(\) => state\.phase === 'loading' \|\| state\.phase === 'playing'/);
  // Regroupé à part par la fabrication, comme le veilleur.
  assert.match(fs.readFileSync(path.join(REPO, 'scripts', 'fabriquer.mjs'), 'utf8'), /f === 'enregistreur-rom\.js'/);
});

// ---------------------------------------------------------------------------
// Repli de la musique du jeu, et proposition

test('musique de la ROM : repli de la musique du jeu, après la sienne et avant celle de la borne', () => {
  const root = tmp();
  const folder = path.join(root, 'tables', 'Terminator 2');
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Terminator 2.vpx'), '');
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  fs.writeFileSync(path.join(root, 'media', '(Audio).mp3'), 'borne');
  const music = path.join(root, 'data', 'cache', 'musiques-rom', 't2_l8.ogg');
  fs.mkdirSync(path.dirname(music), { recursive: true });
  fs.writeFileSync(music, 'OggS');
  const table = scanTables(path.join(root, 'tables'))[0]!;
  const romAudio = () => music;

  const r = resolveMedia(table, root, 'Audio', { romAudio });
  assert.equal(r.source, 'rom');
  assert.equal(r.file, music);
  assert.equal(mediaStateLabel(r, root).label, 'Repli : musique de la ROM');
  assert.equal(resolveMedia(table, root, 'Audio').source, 'default', 'sans le service : la musique de la borne');
  assert.equal(resolveMedia(table, root, 'AudioLaunch', { romAudio }).source, 'fallback', 'jamais pour le son de lancement');
  fs.writeFileSync(path.join(folder, 'medias', '(Audio) Terminator 2.mp3'), 'la sienne');
  assert.equal(resolveMedia(table, root, 'Audio', { romAudio }).source, 'vpx-name', 'sa propre musique d’abord');

  // Le menu la lit par le protocole des médias : son dossier seul, pas le dossier de travail de PinMAME.
  const dataDir = path.join(root, 'data');
  const allowed = allowedMediaDirs({ root, dataDir, tables: [table] });
  assert.ok(isServedMedia(music, allowed));
  assert.ok(!isServedMedia(path.join(dataDir, 'cache', 'musiques-rom', 'travail', 'musique.wav'), allowed));
  assert.ok(!isServedMedia(path.join(dataDir, 'cache', 'musiques-rom', 'etat.json'), allowed));

  const choices = localMediaChoices(table, { romMusic: { file: music, bytes: 4, label: 't2_l8, 30 s' } });
  assert.equal(choices.Audio?.[0]?.source, 'rom');
  assert.equal(choices.Audio?.[0]?.file, music);
  assert.equal(choices.Audio?.[0]?.label, 't2_l8, 30 s');
});
