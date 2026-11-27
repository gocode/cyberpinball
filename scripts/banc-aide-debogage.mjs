// Banc de l'aide de débogage de core.vbs (rapport 7anghOnWiu, 27/11/2026) : Extra Ball pressé en partie ouvre la
// question de vpmAddBall (« Click YES to Add a ball to the Trough… », Oui/Non/Annuler) et Cyber Pinball arrêtait la
// partie. Ici tout est vrai : VPX, la table à ROM, son core.vbs d'origine, le lanceur de Cyber Pinball
// (app/dist/launcher.js) ; 8 s après le début de la partie, la touche Extra Ball (B, Mapping.ExtraBall = Key;5) est
// envoyée à la fenêtre de jeu. Attendu : la question fermée par Annuler, la partie continue, une notice au journal.
// La table doit avoir un cvpmTrough (sinon vpmAddBall ne demande rien) : Attack from Mars g5k, Star Trek LE, Popeye…
// À lancer par scripts\banc-aide-debogage.ps1 (bureau caché : rien à l'écran, rien ne prend le focus).
//   node scripts/banc-aide-debogage.mjs --vpx <dossier de VPX 10.8.1> --table <table à ROM.vpx> --ini <VPinballX.ini> [--secondes 25]

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { launchVpx } = require(path.join(root, 'app', 'dist', 'launcher.js'));
const { visibleWindowsOf } = require('@cyberpinball/win-displays');
const koffi = require('koffi');
const PostMessageW = koffi.load('user32.dll').func('bool __stdcall PostMessageW(void *hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
for (const k of ['vpx', 'table', 'ini']) {
  if (!args[k]) {
    console.error(`--${k} manquant.`);
    process.exit(2);
  }
}
const playMs = Number(args.secondes ?? 25) * 1000;

// Le .ini est réécrit par VPX en fin de partie : une copie, avec Extra Ball sur B quoi qu'il porte.
const work = path.join(root, 'tmp', 'banc-aide-debogage');
fs.mkdirSync(work, { recursive: true });
const ini = path.join(work, 'VPinballX.ini');
fs.writeFileSync(ini, fs.readFileSync(args.ini, 'utf8').replace(/^Mapping\.ExtraBall\s*=.*$/m, 'Mapping.ExtraBall = Key;5'));
const exe = fs.readdirSync(args.vpx).find((f) => /^VPinballX.*64\.exe$/i.test(f));
if (!exe) throw new Error('exécutable de VPX introuvable');

const WM_KEYDOWN = 0x100;
const WM_KEYUP = 0x101;
const VK_B = 0x42;
const SCAN_B = 0x30;
function pressExtraBall(pid) {
  const player = visibleWindowsOf(pid).find((w) => w.title === 'Visual Pinball Player');
  if (!player) return console.log('Fenêtre de jeu introuvable : touche non envoyée.');
  PostMessageW(player.hwnd, WM_KEYDOWN, VK_B, (SCAN_B << 16) | 1);
  setTimeout(() => PostMessageW(player.hwnd, WM_KEYUP, VK_B, ((SCAN_B << 16) | 1 | 0xc0000000) | 0), 150);
  console.log(`Touche Extra Ball (B) envoyée à ${Math.round((Date.now() - t0) / 1000)} s.`);
}

const t0 = Date.now();
const game = launchVpx({
  exe: path.join(args.vpx, exe),
  ini,
  table: path.resolve(args.table),
  vpxPrefDir: path.join(process.env.APPDATA ?? os.homedir(), 'VPinballX', '10.8'),
  timeoutMs: 120_000,
  onPlaying: () => {
    console.log(`Partie à l'écran après ${Math.round((Date.now() - t0) / 1000)} s ; arrêt demandé dans ${playMs / 1000} s.`);
    setTimeout(() => pressExtraBall(game.pid), 8000);
    setTimeout(() => game.stop(), playMs);
  },
});
console.log(`VPX lancé (processus ${game.pid}).`);
const result = await game.done;
console.log(JSON.stringify({ ok: result.ok, failure: result.failure, message: result.message, seconds: result.seconds, notices: result.notices }, null, 1));
const cancelled = result.notices.some((n) => /aide de débogage/.test(n));
const pass = !result.failure && cancelled && result.seconds >= playMs / 1000 - 2;
console.log(pass ? 'VERT : question fermée par Annuler, la partie a continué jusqu’à l’arrêt demandé.' : 'ROUGE : voir ci-dessus.');
process.exit(pass ? 0 : 1);
