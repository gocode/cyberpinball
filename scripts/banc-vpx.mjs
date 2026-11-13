// Banc d'essai de VPX dans le casque : le vrai VPX 10.8.1 et le plugin de Cyber Pinball (packages/vpx-vision3d,
// pause.h), sur le runtime OpenXR factice (packages/casque-vr/test/runtime-factice.cpp), qui joue un scénario
// (manettes, clics des joysticks, gâchettes) sans casque. Sert à suivre un geste du casque en partie jusqu'au
// plugin sans le vrai Link. À lancer par scripts/banc-vpx.ps1, sur le bureau caché : VPX y ouvre sa fenêtre
// d'aperçu, que personne ne voit.
//   node scripts/banc-vpx.mjs --vpx <dossier de VPX 10.8.1> --table <fichier.vpx> [--scenario <fichier>] [--duree <ms>]
// Construit d'abord : npm run casque-vr (runtime factice), node scripts/vision3d.mjs (plugin).
// VPX est copié une fois dans le dossier temporaire (jamais de jonction vers l'original) ; le plugin construit y
// remplace celui de la copie à chaque passage.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BANC_RUNTIME = path.join(repo, 'build', 'casque-vr', 'Release', 'runtime-factice.dll');
export const BANC_PLUGIN = path.join(repo, 'build', 'vision3d', 'Release', 'plugin-cyberpinball64.dll');
const VPX_EXE = 'VPinballX_BGFX64.exe';

/** Le geste du calage en partie : les deux clics des joysticks tenus 4 s, gâchette, puis A. */
export const SCENARIO_CALAGE = [
  '0 porte 1',
  '0 limite fixe',
  '0 tete 0 1.6 0 0',
  '0 manette gauche -0.3 1.02 -0.35',
  '0 manette droite 0.3 1.02 -0.35',
  '6000 bouton /user/hand/left/input/thumbstick/click 1',
  '6100 bouton /user/hand/right/input/thumbstick/click 1',
  '10100 bouton /user/hand/left/input/thumbstick/click 0',
  '10100 bouton /user/hand/right/input/thumbstick/click 0',
  '12000 valeur /user/hand/right/input/trigger/value 1',
  '12300 valeur /user/hand/right/input/trigger/value 0',
  '15000 bouton /user/hand/right/input/a/click 1',
  '15200 bouton /user/hand/right/input/a/click 0',
].join('\n');

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** La copie de VPX du banc, faite une fois par version (robocopy /XJ : aucune jonction suivie ni recopiée). */
function copieVpx(source) {
  const nom = path.basename(path.resolve(source)).replace(/[^\w.-]/g, '_');
  const dest = path.join(os.tmpdir(), 'cyberpinball-banc-vpx', nom);
  if (!fs.existsSync(path.join(dest, VPX_EXE))) {
    fs.mkdirSync(dest, { recursive: true });
    const r = spawnSync('robocopy', [source, dest, '/E', '/XJ', '/XD', 'docs', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`Copie de VPX impossible (robocopy ${r.status}).`);
  }
  const plugin = path.join(dest, 'plugins', 'cyberpinball');
  fs.mkdirSync(plugin, { recursive: true });
  fs.copyFileSync(BANC_PLUGIN, path.join(plugin, 'plugin-cyberpinball64.dll'));
  if (!fs.existsSync(path.join(plugin, 'plugin.cfg')))
    fs.writeFileSync(path.join(plugin, 'plugin.cfg'), '[configuration]\nid = "CyberPinball"\nname = "Cyber Pinball"\nversion = "1.0"\n\n[libraries]\nwindows.x64 = "plugin-cyberpinball64.dll"\n');
  return dest;
}

/** L'INI d'une partie dans le casque, comme Cyber Pinball l'écrit (vr.ts, manettes.ts, frontend.ts). */
async function iniPartie(dir, imageCalage) {
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const log = path.join(dir, 'casque-vpx.txt');
  const settings = [
    { section: 'PlayerVR', key: 'AskToTurnOn', value: '1' },
    { section: 'PlayerVR', key: 'ControllerLockbarScale', value: '1' },
    { section: 'PlayerVR', key: 'ControllerCabYOffset', value: '0' },
    { section: 'Player', key: 'VRPreview', value: '0' },
    { section: 'Plugin.CyberPinball', key: 'Enable', value: '1' },
    { section: 'Plugin.CyberPinball', key: 'LogFile', value: log },
    { section: 'Plugin.CyberPinball', key: 'Calibrate', value: '1' },
    { section: 'Plugin.CyberPinball', key: 'CalibrateHeight', value: '0' },
    { section: 'Plugin.CyberPinball', key: 'CalibrateLabel', value: 'Caler la borne' },
    // Le schéma des manettes sous « Caler la borne » (image faite par Cyber Pinball), et la capture de l'étape.
    { section: 'Plugin.CyberPinball', key: 'CalibrateImage', value: imageCalage ?? '' },
    { section: 'Plugin.CyberPinball', key: 'CalibratedImage', value: imageCalage ? imageCalage.replace(/pause-image\.png$/, 'pause-image-calee.png') : '' },
    { section: 'Plugin.CyberPinball', key: 'CaptureDir', value: dir },
    ...core.vpxHeadsetInput(''),
  ];
  const ini = path.join(dir, 'VPinballX.ini');
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());
  return { ini, log };
}

export async function jouerVpx({ vpx, table, scenario = SCENARIO_CALAGE, dureeMs = 40000, imageCalage }) {
  if (!fs.existsSync(BANC_RUNTIME)) throw new Error('Runtime factice absent : npm run casque-vr.');
  if (!fs.existsSync(BANC_PLUGIN)) throw new Error('Plugin absent : node scripts/vision3d.mjs.');
  const copie = copieVpx(vpx);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-vpx-'));
  const { ini, log } = await iniPartie(dir, imageCalage);
  const manifeste = path.join(dir, 'runtime.json');
  fs.writeFileSync(manifeste, JSON.stringify({ file_format_version: '1.0.0', runtime: { name: 'Banc Cyber Pinball', library_path: BANC_RUNTIME } }, null, 2));
  const scenarioFile = path.join(dir, 'scenario.txt');
  const traceFile = path.join(dir, 'trace.txt');
  fs.writeFileSync(scenarioFile, scenario.trim() + '\n');
  const env = {
    ...process.env,
    XR_RUNTIME_JSON: manifeste,
    CYBERPINBALL_XR_SCENARIO: scenarioFile,
    CYBERPINBALL_XR_TRACE: traceFile,
    CYBERPINBALL_XR_DEBUT_FICHIER: path.join(dir, 'debut.txt'),
  };
  // La table jouée est une copie : VPX ne touche jamais à l'original (ni .ini de table, ni fichiers voisins).
  const jouee = path.join(dir, path.basename(table));
  fs.copyFileSync(table, jouee);
  const vbs = table.replace(/\.vpx$/i, '.vbs');
  if (fs.existsSync(vbs)) fs.copyFileSync(vbs, jouee.replace(/\.vpx$/i, '.vbs'));
  const sortie = [];
  const child = spawn(path.join(copie, VPX_EXE), ['-Ini', ini, '-Play', jouee], { cwd: copie, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (c) => sortie.push(String(c)));
  child.stderr.on('data', (c) => sortie.push(String(c)));
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    }, dureeMs);
    child.on('exit', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  const lire = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const vpxLog = [path.join(dir, 'vpinball.log'), path.join(copie, 'vpinball.log'), path.join(process.env.APPDATA ?? '', 'VPinballX', 'vpinball.log')].find((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > Date.now() - dureeMs - 60000);
  return { dir, code, plugin: lire(log), trace: lire(traceFile), vpxLog: vpxLog ? lire(vpxLog) : '', vpxLogFile: vpxLog, sortie: sortie.join('') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('node scripts/banc-vpx.mjs --vpx <dossier de VPX> --table <fichier.vpx> [--scenario <fichier>] [--duree <ms>]');
    process.exit(2);
  }
  const r = await jouerVpx({ vpx: a.vpx, table: a.table, scenario: a.scenario ? fs.readFileSync(a.scenario, 'utf8') : undefined, dureeMs: a.duree ? Number(a.duree) : undefined, imageCalage: a['image-calage'] });
  console.log(`Dossier : ${r.dir}\nSortie de VPX : ${r.code}\nJournal de VPX : ${r.vpxLogFile ?? '(introuvable)'}`);
  console.log('--- plugin (casque-vpx.txt) ---\n' + r.plugin);
  console.log('--- runtime (trace) ---\n' + r.trace.split('\n').filter((l) => !/ image /.test(l)).slice(0, 200).join('\n'));
  console.log('--- VPX (extraits) ---\n' + r.vpxLog.split('\n').filter((l) => /OpenXR|XR|binding|Plugin|CyberPinball|Input|ERROR|WARN/i.test(l)).slice(0, 120).join('\n'));
}
