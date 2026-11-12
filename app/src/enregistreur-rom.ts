// Enregistreur de la musique d'une ROM (rom-music.ts) : CyberPinball.exe en mode Node
// (ELECTRON_RUN_AS_NODE), sans fenêtre, un processus par ROM :
//   CyberPinball.exe <app>\dist\enregistreur-rom.js <tâche.json>
//
// Un processus à part, parce que libpinmame n'a qu'un état global (une ROM à la fois) et qu'une
// ROM qui fait tomber PinMAME ne doit faire tomber que lui. Il fait tourner la ROM dans la
// libpinmame de VPX (pinmame64.dll), par koffi, sans écran ni son audible : libpinmame ne joue
// rien elle-même, elle rend son son par un rappel, gardé ici. Le dossier de PinMAME est une copie
// préparée par Cyber Pinball (prepareRomScratch : NVRAM vierge, hors du dossier de la table).
//
// Les rappels de PinMAME viennent de son fil d'émulation : koffi les fait passer par le fil
// principal, qui ne doit donc jamais attendre PinMAME. Tous les appels à libpinmame après le
// démarrage sont asynchrones (.async) : un appel direct pendant que PinMAME attendait un rappel
// bloquait les deux (vu sur The Addams Family).
//
// Écrit le son brut (PCM 16 bits) et un résultat JSON, puis sort.

import * as fs from 'node:fs';
import { PINMAME_KEYS, ROM_AUDIO_PLAN, romKeyboardWanted, romKeyPressed } from '@cyberpinball/core';

export interface RomRecordJob {
  dll: string;
  /** Dossier de PinMAME préparé (roms\, nvram\ vierge, cfg\). */
  vpmPath: string;
  rom: string;
  switches: number[];
  /** Durée émulée à enregistrer. */
  seconds: number;
  pcm: string;
  result: string;
}

export interface RomRecordResult {
  ok: boolean;
  /** PinMAME n'a pas démarré la ROM (code dans `status`), s'est arrêté, ou ne rendait plus de son. */
  error?: 'start-failed' | 'stopped' | 'no-sound';
  status?: number;
  channels: number;
  rate: number;
  /** Durée émulée reçue. */
  seconds: number;
  /** Durée réelle. */
  wall: number;
  /** Dernière image de l'afficheur principal, en texte (pour dire où une ROM muette s'est arrêtée). */
  display?: string;
}

// Il n'y a pas de types pour koffi dans ce module regroupé : chargé à l'exécution (paquet externe).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const koffi = require('koffi') as typeof import('koffi');

const jobFile = process.argv[2];
if (!jobFile) throw new Error('Usage : CyberPinball.exe enregistreur-rom.js <tâche.json> (ELECTRON_RUN_AS_NODE=1)'); // i18n-ignore : usage
const job = JSON.parse(fs.readFileSync(jobFile, 'utf8')) as RomRecordJob;

const lib = koffi.load(job.dll);
const AudioInfo = koffi.struct('CpPinmameAudioInfo', { format: 'int', channels: 'int', sampleRate: 'double', framesPerSecond: 'double', samplesPerFrame: 'int', bufferSize: 'int' });
const Layout = koffi.struct('CpPinmameDisplayLayout', { type: 'int', top: 'int', left: 'int', length: 'int', width: 'int', height: 'int', depth: 'int' });
const Config = koffi.struct('CpPinmameConfig', {
  audioFormat: 'int',
  sampleRate: 'int',
  vpmPath: koffi.array('char', 512, 'String'),
  onStateUpdated: 'void *',
  onDisplayAvailable: 'void *',
  onDisplayUpdated: 'void *',
  onAudioAvailable: 'void *',
  onAudioUpdated: 'void *',
  onMechAvailable: 'void *',
  onMechUpdated: 'void *',
  onSolenoidUpdated: 'void *',
  onConsoleDataUpdated: 'void *',
  isKeyPressed: 'void *',
  onLogMessage: 'void *',
  onSoundCommand: 'void *',
});
const AudioAvailableCb = koffi.proto('int CpAudioAvailable(void *info, void *user)');
const AudioUpdatedCb = koffi.proto('int CpAudioUpdated(void *buffer, int samples, void *user)');
const DisplayUpdatedCb = koffi.proto('void CpDisplayUpdated(int index, void *data, void *layout, void *user)');
const KeyCb = koffi.proto('int CpIsKeyPressed(int key, void *user)');
const SetConfig = lib.func('void PinmameSetConfig(CpPinmameConfig *config)');
const Run = lib.func('int PinmameRun(const char *name)');
const Stop = lib.func('void PinmameStop()');
const IsRunning = lib.func('int PinmameIsRunning()');
const SetHandleKeyboard = lib.func('void PinmameSetHandleKeyboard(int value)');
const SetHandleMechanics = lib.func('void PinmameSetHandleMechanics(int value)');
const SetSwitch = lib.func('void PinmameSetSwitch(int sw, int state)');
void Config;

let channels = 1;
let rate = 44_100;
let bytes = 0;
const chunks: Buffer[] = [];
let started = 0;
/** Temps émulé : le son reçu fait l'horloge. */
const emulated = () => bytes / 2 / channels / rate;
const wall = () => (started ? (performance.now() - started) / 1000 : 0);
let display: { width: number; height: number; pixels: Buffer } | undefined;

/**
 * Copie de n octets pointés par PinMAME. Pas de koffi.view : sous Electron, la cage mémoire de V8
 * refuse un ArrayBuffer posé sur une mémoire externe, et le processus tombait (« napi_get_last_error_info »).
 */
const byteArrays = new Map<number, ReturnType<typeof koffi.array>>();
function copyBytes(ptr: unknown, n: number): Buffer {
  let type = byteArrays.get(n);
  if (!type) byteArrays.set(n, (type = koffi.array('uint8_t', n, 'Typed')));
  const bytes = koffi.decode(ptr, type) as Uint8Array;
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const onAvailable = koffi.register((info: unknown) => {
  const i = koffi.decode(info, AudioInfo) as { channels: number; sampleRate: number; samplesPerFrame: number };
  channels = Math.max(1, i.channels);
  rate = Math.round(i.sampleRate);
  return i.samplesPerFrame;
}, koffi.pointer(AudioAvailableCb));
const onAudio = koffi.register((buffer: unknown, samples: number) => {
  const n = samples * channels * 2;
  chunks.push(copyBytes(buffer, n));
  bytes += n;
  return samples;
}, koffi.pointer(AudioUpdatedCb));
const onDisplay = koffi.register((index: number, data: unknown, layout: unknown) => {
  if (index !== 0 || !data || !layout) return;
  const l = koffi.decode(layout, Layout) as { width: number; height: number };
  if (l.width > 0 && l.height > 0 && l.width <= 256 && l.height <= 64) {
    display = { width: l.width, height: l.height, pixels: copyBytes(data, l.width * l.height) };
  }
}, koffi.pointer(DisplayUpdatedCb));
const onKey = koffi.register((key: number) => (romKeyPressed(key, emulated()) ? 1 : 0), koffi.pointer(KeyCb));
void PINMAME_KEYS;

function displayText(): string | undefined {
  if (!display) return undefined;
  const rows: string[] = [];
  for (let y = 0; y < display.height; y++) {
    let row = '';
    for (let x = 0; x < display.width; x++) row += display.pixels[y * display.width + x]! > 0 ? '#' : ' ';
    rows.push(row.trimEnd());
  }
  return rows.join('\n').replace(/^\n+|\n+$/g, '');
}

let finished = false;
function finish(error?: RomRecordResult['error']): void {
  if (finished) return;
  finished = true;
  clearInterval(timer);
  const pcm = Buffer.concat(chunks);
  fs.writeFileSync(job.pcm, pcm);
  const result: RomRecordResult = { ok: !error, error, channels, rate, seconds: emulated(), wall: wall(), display: displayText() };
  fs.writeFileSync(job.result, JSON.stringify(result, null, 1));
  // PinMAME arrêté sans attendre (son fil peut attendre un rappel) ; le processus sort de toute façon.
  Stop.async(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

SetConfig({
  audioFormat: 0,
  sampleRate: 44_100,
  vpmPath: job.vpmPath,
  onStateUpdated: null,
  onDisplayAvailable: null,
  onDisplayUpdated: onDisplay,
  onAudioAvailable: onAvailable,
  onAudioUpdated: onAudio,
  onMechAvailable: null,
  onMechUpdated: null,
  onSolenoidUpdated: null,
  onConsoleDataUpdated: null,
  isKeyPressed: onKey,
  onLogMessage: null,
  onSoundCommand: null,
});
// Le clavier ne s'allume qu'autour des appuis (romKeyboardWanted).
SetHandleKeyboard(0);
SetHandleMechanics(1);
const status = Run(job.rom.toLowerCase()) as number;
started = performance.now();
let keyboard = false;
let ballsIn = false;
let polling = false;
let running = 1;
let lastBytes = 0;
let lastSound = 0;
const timer = setInterval(() => {
  const t = emulated();
  const want = romKeyboardWanted(t);
  if (want !== keyboard) {
    keyboard = want;
    SetHandleKeyboard.async(want ? 1 : 0, () => {});
  }
  if (!ballsIn && t > ROM_AUDIO_PLAN.ballsAt) {
    ballsIn = true;
    for (const sw of job.switches) SetSwitch.async(sw, 1, () => {});
  }
  if (!polling) {
    polling = true;
    IsRunning.async((_e: unknown, r: number) => {
      polling = false;
      running = r;
    });
  }
  if (bytes !== lastBytes) {
    lastBytes = bytes;
    lastSound = wall();
  }
  if (t >= job.seconds) finish();
  else if (!running) finish('stopped');
  else if (wall() - lastSound > 15) finish('no-sound');
}, 50);
if (status !== 0) {
  clearInterval(timer);
  fs.writeFileSync(job.result, JSON.stringify({ ok: false, error: 'start-failed', status, channels, rate, seconds: 0, wall: 0 } satisfies RomRecordResult));
  process.exit(0);
}
