// Relais DOF des tables originales (dof-relais.ts) : CyberPinball.exe en mode Node (ELECTRON_RUN_AS_NODE),
// sans fenêtre, le temps d'une partie :
//   CyberPinball.exe <app>\dist\relais-dof.js <tâche en JSON, base64>
//
// Le plugin DOF de VPX 10.8 n'initialise libdof qu'avec une ROM (contrôleur PinMAME) : une table originale
// (B2S.Server, cGameName) n'a jamais ses effets, même quand la config DOF a sa ligne. Ce relais charge la
// même libdof que VPX (plugins\dof\dof64.dll), l'initialise avec le nom B2S de la table, puis lui passe
// les « DOF n, état » du script, recopiés par controller.vbs dans un fichier (dof-evenements.ts).
//
// Protocole : une ligne « init » sur l'entrée standard (le front-end a rendu le port des LED) lance
// l'initialisation ; la fin de l'entrée standard (fin de partie) termine libdof et sort. Sur la sortie
// standard : « niveau<TAB>texte » (0 info, 1 avertissement, 2 erreur), et « ready » après l'initialisation.
//
// Un processus à part : un pilote qui se fige ou une DLL qui plante ne touchent ni VPX ni le front-end.

import * as fs from 'node:fs';
import * as path from 'node:path';

// Il n'y a pas de types pour koffi dans ce module regroupé : chargé à l'exécution (paquet externe).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const koffi = require('koffi') as typeof import('koffi');

interface Job {
  /** plugins\dof\dof64.dll de VPX. */
  dll: string;
  /** Dossier des préférences de VPX, séparateur final compris : libdof y ajoute « directoutputconfig\ ». */
  base: string;
  /** Fichier de la table (libdof en tire le nom des fichiers propres à la table). */
  table: string;
  /** Nom B2S de la table : la ligne de la config DOF. */
  rom: string;
  /** Fichier où controller.vbs recopie les événements. */
  tap: string;
}

const say = (level: string, text: string) => process.stdout.write(`${level}\t${text.replace(/[\r\n]+/g, ' ')}\n`);

const arg = process.argv[2];
if (!arg) throw new Error('Usage : CyberPinball.exe relais-dof.js <tâche> (ELECTRON_RUN_AS_NODE=1)'); // i18n-ignore : usage
const job = JSON.parse(Buffer.from(arg, 'base64').toString('utf8')) as Job;

// Les voisines de dof64.dll (libserialport, libusb, hidapi…) sont cherchées dans son dossier.
const kernel32 = koffi.load('kernel32.dll');
kernel32.func('bool __stdcall SetDllDirectoryW(str16 dir)')(path.dirname(job.dll));
const lib = koffi.load(job.dll);

// API C++ de libdof (noms décorés de MSVC, `this` en premier argument).
const LogCb = koffi.proto('void CyberPinballDofLog(int level, const char *format, void *args)');
const getConfig = lib.func('?GetInstance@Config@DOF@@SAPEAV12@XZ', 'void *', []);
const setBasePath = lib.func('?SetBasePath@Config@DOF@@QEAAXPEBD@Z', 'void', ['void *', 'str']);
const setLogLevel = lib.func('?SetLogLevel@Config@DOF@@QEAAXW4DOF_LogLevel@@@Z', 'void', ['void *', 'int']);
const setLogCallback = lib.func('?SetLogCallback@Config@DOF@@QEAAXP6AXW4DOF_LogLevel@@PEBDPEAD@Z@Z', 'void', ['void *', koffi.pointer(LogCb)]);
const construct = lib.func('??0DOF@0@QEAA@XZ', 'void *', ['void *']);
const init = lib.func('?Init@DOF@1@QEAAXPEBD0@Z', 'void', ['void *', 'str', 'str']);
const dataReceive = lib.func('?DataReceive@DOF@1@QEAAXDHH@Z', 'void', ['void *', 'char', 'int', 'int']);
const finish = lib.func('?Finish@DOF@1@QEAAXXZ', 'void', ['void *']);

const config = getConfig();
const logger = koffi.register((level: number, format: string, args: unknown) => {
  try {
    say(String(level), format === '%s' ? String(koffi.decode(args, 'const char *')) : format);
  } catch {
    // Une ligne illisible ne coûte que la ligne.
  }
}, koffi.pointer(LogCb));
setLogCallback(config, logger);
setLogLevel(config, 0);
setBasePath(config, job.base);
// L'objet DOF ne porte qu'un pointeur : 256 octets laissent de la marge.
const dof = Buffer.alloc(256);
construct(dof);

const E = 'E'.charCodeAt(0);
let started = false;
let ended = false;
let offset = 0;
let rest = '';
let poll: ReturnType<typeof setInterval> | undefined;

/** Bilan de la partie, dit en fin de partie (« bilan ») : de quoi voir après coup ce que libdof a reçu. */
const counts = { events: 0, pulses: 0, ignored: 0 };

/**
 * Les nouvelles lignes du fichier, passées à libdof : 0 éteint, 1 allumé, 2 impulsion (DOFPulse), passée
 * comme B2S.Server la passe à DOF : allumé puis éteint. L'écoute de controller.vbs est posée en tête de
 * `Sub DOF`, avant que la Sub ne casse l'impulsion : elle arrive bien en 2. Jetées jusqu'au 26/11/2026,
 * les impulsions étaient presque tous les appels DOF des tables originales (Matrix, City Hunter, Space
 * Cadet : 46 à 103 impulsions par script, contre 13 à 47 allumés ou éteints) : leurs LED restaient muettes.
 */
function relay(): void {
  let size: number;
  try {
    size = fs.statSync(job.tap).size;
  } catch {
    return;
  }
  if (size <= offset) return;
  const fd = fs.openSync(job.tap, 'r');
  const buf = Buffer.alloc(size - offset);
  try {
    fs.readSync(fd, buf, 0, buf.length, offset);
  } finally {
    fs.closeSync(fd);
  }
  offset = size;
  const text = rest + buf.toString('latin1');
  const cut = text.lastIndexOf('\n');
  rest = cut < 0 ? text : text.slice(cut + 1);
  for (const line of (cut < 0 ? '' : text.slice(0, cut)).split(/\r?\n/)) {
    const m = /^E,(\d{1,5}),(-?\d{1,3}),/.exec(line.trim());
    if (!m) continue;
    const n = Number(m[1]);
    const state = Number(m[2]);
    if (state === 2) {
      dataReceive(dof, E, n, 1);
      dataReceive(dof, E, n, 0);
      counts.pulses++;
    } else if (state === 0 || state === 1) dataReceive(dof, E, n, state);
    else {
      counts.ignored++;
      continue;
    }
    counts.events++;
  }
}

function start(): void {
  if (started || ended) return;
  started = true;
  init(dof, job.table, job.rom);
  // Après l'initialisation, plus de journal : un rappel venu d'un fil de libdof attendrait le fil
  // principal, qui peut lui-même attendre libdof (blocage). Les lignes utiles sont déjà parties.
  setLogCallback(config, null);
  say('ready', '');
  poll = setInterval(relay, 10);
}

function end(): void {
  if (ended) return;
  ended = true;
  if (poll) clearInterval(poll);
  if (started) {
    try {
      relay();
    } catch {
      // Fin de partie : le fichier a pu disparaître.
    }
    finish(dof);
  }
  // Sortie une fois le bilan écrit (une écriture dans un tube peut être différée).
  process.stdout.write(`bilan\t${JSON.stringify(counts)}\n`, () => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (data: string) => {
  if (/\binit\b/.test(data)) start();
});
process.stdin.on('end', end);
process.stdin.on('close', end);
