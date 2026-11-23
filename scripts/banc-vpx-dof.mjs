// Banc de la bibliothèque DOF corrigée (série 6, plugins\dof\dof64.dll) : une table de démonstration de VPX se charge
// avec le plugin DOF actif et se ferme proprement, d'abord avec la dof64.dll officielle de la 5436, puis avec la nôtre.
// Pas de DudesCab ici (le poste d'essai n'a qu'un Pinscape) : ce banc prouve que la DLL reconstruite se charge, que
// le plugin DOF officiel s'y accroche, et que la fermeture réussit (journal « Plugin DOF unloaded », code de sortie 0).
// La preuve sur une carte DudesCab reste à faire chez un joueur concerné.
// Tout se fait sur des copies (VPX, table, préférences : -PrefPath), sur le bureau caché. À lancer par
// scripts/banc-vpx-dof.ps1.
//   node scripts/banc-vpx-dof.mjs --vpx <dossier de VPX 10.8.1-5436> [--table <fichier.vpx>] [--secondes 12] [--dll <dof64.dll>]
// Fermeture : WM_CLOSE sur la fenêtre « Visual Pinball Player », comme un arrêt demandé par le menu ; VPX n'est arrêté
// de force qu'au bout de 60 s (échec du banc).

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VPX_CORRIGE_DOF, VPX_CORRIGE_EXE } from './vpx-corrige.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { closeWindow, listWindows } = require('@cyberpinball/win-displays');
const EXE = 'VPinballX_BGFX64.exe';
const DOF = path.join('plugins', 'dof', VPX_CORRIGE_DOF);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** Une partie : `dll` posée dans une copie de `vpx`, la table jouée `secondes` secondes, puis fermée par WM_CLOSE. */
async function partie({ nom, vpx, dll, table, secondes, core }) {
  const dir = path.join(os.tmpdir(), 'banc-vpx-dof', nom);
  const copie = path.join(dir, 'vpx');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(copie, { recursive: true });
  const r = spawnSync('robocopy', [vpx, copie, '/E', '/XJ', '/XD', 'docs', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
  if (r.status >= 8) throw new Error(`copie de VPX impossible (robocopy ${r.status})`);
  fs.copyFileSync(dll, path.join(copie, DOF));
  const appdata = path.join(dir, 'appdata');
  fs.mkdirSync(appdata, { recursive: true });
  const jouee = path.join(dir, 'table', 'banc.vpx');
  fs.mkdirSync(path.dirname(jouee), { recursive: true });
  fs.copyFileSync(table, jouee);
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, [
    ...core.VPX_PLAY_SETTINGS,
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: '640' },
    { section: 'Player', key: 'PlayfieldHeight', value: '480' },
    { section: 'Plugin.DOF', key: 'Enable', value: '1' },
    { section: 'Plugin.CyberPinballDmd', key: 'Enable', value: '1' },
  ]);
  const ini = path.join(dir, 'VPinballX.ini');
  fs.writeFileSync(ini, doc.toString());
  const child = spawn(path.join(copie, EXE), ['-PrefPath', appdata, '-Ini', ini, '-Play', jouee], { cwd: copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const debut = Date.now();
  let ferme = false;
  let playerSince;
  let forced = false;
  const poll = setInterval(() => {
    const now = Date.now();
    const player = listWindows().find((w) => w.pid === child.pid && w.title === 'Visual Pinball Player');
    if (player && playerSince === undefined) playerSince = now;
    if (player && !ferme && now - playerSince >= secondes * 1000) {
      ferme = true;
      closeWindow(player);
    }
    if (!forced && now - debut > (secondes + 60) * 1000) {
      forced = true;
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    }
  }, 200);
  const code = await fini;
  clearInterval(poll);
  await attendre(300);
  const logFile = [path.join(appdata, 'vpinball.log'), path.join(appdata, '10.8', 'vpinball.log')].find((f) => fs.existsSync(f));
  if (!logFile) throw new Error(`${nom} : vpinball.log absent de ${appdata} (option -PrefPath ignorée ?)`);
  const log = fs.readFileSync(logFile, 'utf8').split(/\r?\n/);
  return {
    nom,
    code,
    ferme,
    forced,
    secondes: Math.round((Date.now() - debut) / 1000),
    joue: playerSince !== undefined,
    version: log.find((l) => /Starting VPX/.test(l))?.replace(/^.*?Starting /, '').slice(0, 120),
    dofCharge: log.some((l) => /\bPlugin DOF loaded\b/.test(l)),
    dofDecharge: log.some((l) => /\bPlugin DOF unloaded\b/.test(l)),
    closing: log.some((l) => /Closing player/.test(l)),
    erreurs: log.filter((l) => / (ERROR|CRITICAL) /.test(l)).map((l) => l.replace(/^.*?\] /, '').slice(0, 160)),
    crash: fs.existsSync(path.join(path.dirname(jouee), 'crash.txt')),
    fin: log.filter(Boolean).slice(-8).map((l) => l.replace(/^\S+ \S+ /, '').slice(0, 140)),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx) {
    console.error('Usage : --vpx <dossier de VPX 10.8.1-5436> [--table <fichier.vpx>] [--secondes 12] [--dll <dof64.dll corrigée>]');
    process.exit(2);
  }
  const corrigee = path.resolve(a.dll ?? path.join(path.dirname(VPX_CORRIGE_EXE), DOF));
  const officielle = path.join(a.vpx, DOF);
  const table = path.resolve(a.table ?? path.join(a.vpx, 'assets', 'strippedTable.vpx'));
  for (const f of [corrigee, officielle, table, path.join(a.vpx, EXE)]) {
    if (!fs.existsSync(f)) {
      console.error(`Introuvable : ${f}${f === corrigee ? ' (node scripts/vpx-corrige.mjs)' : ''}`);
      process.exit(2);
    }
  }
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const secondes = Number(a.secondes ?? 12);
  const resultats = [];
  let echec = false;
  for (const [nom, dll] of [['officielle', officielle], ['corrigee', corrigee]]) {
    const r = await partie({ nom, vpx: a.vpx, dll, table, secondes, core });
    resultats.push(r);
    console.log(JSON.stringify(r, null, 2));
    // Le banc ne juge que la DLL reconstruite ; l'officielle sert de repère (le plugin DOF doit y réussir aussi).
    if (nom === 'corrigee') {
      const raisons = [];
      if (!r.joue) raisons.push('la table ne s’est pas chargée (fenêtre « Visual Pinball Player » jamais vue)');
      if (!r.dofCharge) raisons.push('le plugin DOF ne s’est pas chargé');
      if (!r.dofDecharge) raisons.push('« Plugin DOF unloaded » absent du journal');
      if (r.code !== 0) raisons.push(`code de sortie ${r.code} au lieu de 0`);
      if (r.forced) raisons.push('VPX ne s’est pas fermé de lui-même');
      if (r.crash) raisons.push('crash.txt écrit');
      if (raisons.length) {
        echec = true;
        console.error(`ÉCHEC (dof64.dll corrigée) : ${raisons.join(' ; ')}`);
      }
    }
  }
  const dossier = path.join(repo, 'tmp');
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, 'banc-vpx-dof.json'), JSON.stringify(resultats, null, 2));
  console.log(echec ? 'Banc DOF : échec.' : 'Banc DOF : la dof64.dll corrigée se charge et se ferme proprement (sans DudesCab : la preuve sur la carte reste à faire chez un joueur).');
  process.exit(echec ? 1 : 0);
}
