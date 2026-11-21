// Banc du VPX corrigé (packages/vpx-corrige) : la même table jouée par l'exécutable officiel de la 5436 puis par le
// nôtre, sur le bureau caché, avec le backglass B2S dans sa propre fenêtre. Compare la cadence du playfield (plugin
// CyberPinballDmd), les fenêtres que VPX ouvre, les erreurs de son journal et l'arrêt. Sans synchronisation ni limite
// (le bureau caché n'a pas de composition d'écran) : l'officiel redessine le backglass à chaque image, le nôtre au
// rythme de son écran ; la cadence du playfield doit donc être au moins égale, et rien d'autre ne doit changer.
// À lancer par scripts/banc-vpx-corrige.ps1. Tout se fait sur des copies : VPX, la table, la ROM, et le dossier des
// préférences de VPX (-PrefPath : son journal et ses réglages ; ceux du poste ne sont pas touchés).
// Mesuré le 21/11/2026 (portable i9-9980HK, Quadro RTX 4000, Attack from Mars g5k, fenêtres 640 × 480, sans synchro) :
// officiel 124,5 images/s (95e centile 23 ms), corrigé 211,4 (13 ms) ; mêmes fenêtres, mêmes lignes d'erreur.
//   node scripts/banc-vpx-corrige.mjs --vpx <dossier de VPX 10.8.1-5436> --table <fichier.vpx> --roms <dossier des ROM>
//        [--duree 75000]
// Construit d'abord : node scripts/vpx-corrige.mjs.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VPX_CORRIGE_EXE } from './vpx-corrige.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = 'VPinballX_BGFX64.exe';
const PUP = path.join('plugins', 'pup', 'plugin-pup64.dll');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Une partie de `dureeMs` avec l'exécutable `exe` posé dans une copie de `vpx` ; le bilan lu dans son journal. */
async function partie({ nom, vpx, exe, pup, table, roms, dureeMs, core }) {
  const dir = path.join(os.tmpdir(), 'banc-vpx-corrige', nom);
  const copie = path.join(dir, 'vpx');
  if (!fs.existsSync(path.join(copie, EXE))) {
    fs.mkdirSync(copie, { recursive: true });
    const r = spawnSync('robocopy', [vpx, copie, '/E', '/XJ', '/XD', 'docs', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`copie de VPX impossible (robocopy ${r.status})`);
  }
  fs.copyFileSync(exe, path.join(copie, EXE));
  // Plugin PuP (série 3) : le corrigé pour la partie corrigée, celui de l'archive pour l'officielle.
  fs.copyFileSync(pup ?? path.join(vpx, PUP), path.join(copie, PUP));
  const appdata = path.join(dir, 'appdata');
  fs.rmSync(appdata, { recursive: true, force: true });
  const pinmame = path.join(dir, 'pinmame');
  fs.rmSync(pinmame, { recursive: true, force: true });
  fs.mkdirSync(path.join(pinmame, 'roms'), { recursive: true });
  if (roms) for (const f of fs.readdirSync(roms)) fs.copyFileSync(path.join(roms, f), path.join(pinmame, 'roms', f));
  // La table, et son PuP-Pack s'il y en a un : une seule copie pour les deux parties (un PuP-Pack pèse des Go).
  const tableDir = path.join(os.tmpdir(), 'banc-vpx-corrige', 'table');
  fs.mkdirSync(tableDir, { recursive: true });
  const jouee = path.join(tableDir, path.basename(table));
  if (!fs.existsSync(jouee)) fs.copyFileSync(table, jouee);
  const b2s = table.replace(/\.vpx$/i, '.directb2s');
  if (fs.existsSync(b2s) && !fs.existsSync(jouee.replace(/\.vpx$/i, '.directb2s'))) fs.copyFileSync(b2s, jouee.replace(/\.vpx$/i, '.directb2s'));
  const pack = path.join(path.dirname(table), 'pupvideos');
  if (fs.existsSync(pack) && !fs.existsSync(path.join(tableDir, 'pupvideos'))) {
    const r = spawnSync('robocopy', [pack, path.join(tableDir, 'pupvideos'), '/E', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`copie du PuP-Pack impossible (robocopy ${r.status})`);
  }
  fs.rmSync(path.join(tableDir, 'crash.txt'), { force: true });
  const settings = [
    ...core.VPX_PLAY_SETTINGS,
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'SyncMode', value: '0' },
    { section: 'Player', key: 'MaxFramerate', value: '0' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: '640' },
    { section: 'Player', key: 'PlayfieldHeight', value: '480' },
    { section: 'Backglass', key: 'BackglassOutput', value: '1' },
    { section: 'Backglass', key: 'BackglassFullScreen', value: '0' },
    { section: 'Backglass', key: 'BackglassWndX', value: '700' },
    { section: 'Backglass', key: 'BackglassWndY', value: '0' },
    { section: 'Backglass', key: 'BackglassWidth', value: '640' },
    { section: 'Backglass', key: 'BackglassHeight', value: '480' },
    { section: 'ScoreView', key: 'ScoreViewOutput', value: '0' },
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '1' },
    { section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: pinmame },
    core.PINMAME_FAST_BOOT,
    { section: 'Plugin.B2S', key: 'Enable', value: '1' },
    { section: 'Plugin.B2SLegacy', key: 'Enable', value: '0' },
    { section: 'Plugin.CyberPinballDmd', key: 'Enable', value: '1' },
    { section: 'Plugin.PUP', key: 'Enable', value: '1' },
  ];
  const ini = path.join(dir, 'VPinballX.ini');
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());
  // -PrefPath : journal et réglages de VPX dans le dossier du banc (VPX prend sinon le dossier de SDL, celui du poste).
  fs.mkdirSync(appdata, { recursive: true });
  const child = spawn(path.join(copie, EXE), ['-PrefPath', appdata, '-Ini', ini, '-Play', jouee], { cwd: copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const debut = Date.now();
  let code = await Promise.race([fini, attendre(dureeMs).then(() => undefined)]);
  const vivant = code === undefined;
  if (vivant) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    code = await fini;
  }
  const logFile = [path.join(appdata, 'vpinball.log'), path.join(appdata, '10.8', 'vpinball.log')].find((f) => fs.existsSync(f));
  if (!logFile) throw new Error(`${nom} : vpinball.log absent de ${appdata} (option -PrefPath ignorée ?)`);
  const log = fs.readFileSync(logFile, 'utf8').split(/\r?\n/);
  const cadence = core.readVpxCadence(log);
  return {
    nom,
    vivant,
    secondes: Math.round((Date.now() - debut) / 1000),
    code,
    version: log.find((l) => /Starting VPX/.test(l))?.replace(/^.*?Starting /, '').slice(0, 120),
    fenetres: core.readVpxWindows(log).map((w) => `${w.playfield ? 'playfield' : 'annexe'} ${w.hz} Hz`),
    cadence,
    erreurs: log.filter((l) => / ERROR /.test(l)).map((l) => l.replace(/^.*?\] /, '').slice(0, 160)),
    pup: log.filter((l) => /\[PUP:/.test(l)).length,
    arrets: log.filter((l) => /Cadence: stall/.test(l)).map((l) => l.replace(/^.*?Cadence: /, '').slice(0, 200)),
    crash: fs.existsSync(path.join(path.dirname(jouee), 'crash.txt')),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('Usage : --vpx <dossier de VPX 10.8.1-5436> --table <fichier.vpx> [--roms <dossier des ROM>] [--duree 75000]');
    process.exit(2);
  }
  if (!fs.existsSync(VPX_CORRIGE_EXE)) {
    console.error('VPX corrigé absent : node scripts/vpx-corrige.mjs');
    process.exit(2);
  }
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const dureeMs = Number(a.duree ?? 75000);
  const resultats = [];
  const pupCorrige = path.join(path.dirname(VPX_CORRIGE_EXE), PUP);
  for (const [nom, exe, pup] of [
    ['officiel', path.join(a.vpx, EXE), undefined],
    ['corrige', VPX_CORRIGE_EXE, fs.existsSync(pupCorrige) ? pupCorrige : undefined],
  ])
    resultats.push(await partie({ nom, vpx: a.vpx, exe, pup, table: a.table, roms: a.roms, dureeMs, core }));
  for (const r of resultats) {
    const c = r.cadence;
    console.log(`\n== ${r.nom} : ${r.vivant ? `encore en partie au bout de ${r.secondes} s (arrêté par le banc)` : `VPX s'est arrêté seul (code ${r.code})`}${r.crash ? ', crash.txt écrit' : ''}`);
    console.log(`   ${r.version ?? 'version non lue'}`);
    console.log(`   fenêtres : ${r.fenetres.join(', ') || 'aucune'}`);
    console.log(c ? `   cadence : ${c.fps} i/s, médiane ${c.p50} ms, 99e centile ${c.p99} ms, ${c.stalls} à-coup(s), sur ${c.durationS} s` : '   cadence : aucun bilan');
    console.log(`   erreurs du journal : ${r.erreurs.length}${r.erreurs.length ? `\n     ${r.erreurs.slice(0, 8).join('\n     ')}` : ''}`);
    console.log(`   lignes du plugin PuP : ${r.pup} ; à-coups relevés : ${r.arrets.length}${r.arrets.length ? `\n     ${r.arrets.slice(0, 5).join('\n     ')}` : ''}`);
  }
  const [o, n] = resultats;
  const ok = o.vivant && n.vivant && !n.crash && n.cadence && o.cadence && n.fenetres.length === o.fenetres.length && n.erreurs.length <= o.erreurs.length && n.cadence.fps >= o.cadence.fps * 0.95;
  console.log(`\nVerdict : ${ok ? 'le corrigé joue comme l’officiel (mêmes fenêtres, pas plus d’erreurs, cadence au moins égale)' : 'ÉCART à examiner'}.`);
  process.exit(ok ? 0 : 1);
}
