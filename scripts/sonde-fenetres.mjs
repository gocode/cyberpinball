// Sonde des fenêtres de VPX : lance une table comme le lanceur (-Ini <fichier> -Play <table>)
// et relève, toutes les 100 ms, chaque fenêtre de premier plan des processus apparus depuis
// le lancement (visibles ou non) : titre, classe, position, et ce qu'en ferait le lanceur
// (classifyVpxWindow). La fenêtre Player est fermée après --secondes de jeu, comme un arrêt
// demandé par le menu ; une boîte de dialogue est laissée 2 s à l'écran, puis VPX est arrêté.
//
//   npm run build
//   node scripts/sonde-fenetres.mjs --exe <VPinballX_BGFX64.exe> --ini <copie de VPinballX.ini> --table <copie.vpx> [--secondes 20] [--sortie releve.json]
//
// --commande Edit ouvre la table dans l'éditeur au lieu de la jouer : de quoi vérifier sur
// de vraies fenêtres la reconnaissance de l'éditeur et de l'audit (arrêt 2 s après la première boîte, au plus tard après 15 s).
//
// Travailler sur des copies : VPX réenregistre le .ini à la fin de la partie.

import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const require = createRequire(import.meta.url);
const { allowAnyForeground, closeWindow, listWindows, windowTexts } = require('@cyberpinball/win-displays');
const { classifyVpxWindow, DIALOG_CLASS } = require('@cyberpinball/core');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
for (const k of ['exe', 'ini', 'table']) {
  if (!args[k]) {
    console.error(`--${k} manquant. Usage : node scripts/sonde-fenetres.mjs --exe … --ini … --table … [--secondes 20] [--sortie releve.json]`);
    process.exit(2);
  }
}
const playMs = Number(args.secondes ?? 20) * 1000;
const command = args.commande ?? 'Play';

const names = new Map();
function processName(pid) {
  if (!names.has(pid)) {
    let name = '?';
    try {
      const csv = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true });
      name = /^"([^"]+)"/.exec(csv.trim())?.[1] ?? '?';
    } catch {}
    names.set(pid, name);
  }
  return names.get(pid);
}

const before = new Set(listWindows().map((w) => w.pid));
const t0 = Date.now();
allowAnyForeground();
const child = spawn(path.resolve(args.exe), ['-Ini', path.resolve(args.ini), `-${command}`, path.resolve(args.table)], {
  cwd: path.dirname(path.resolve(args.exe)),
  windowsHide: false,
});
let phase = 'chargement';
let closeAt;
let killAt;
const seen = new Map();
const events = [];
const log = (e) => {
  events.push(e);
  const what = e.marker ?? `${e.visible ? 'visible' : 'cachée '} ${e.process} « ${e.title} » [${e.className}] ${e.rect.join(',')}${e.verdict ? ` → ${e.verdict}` : ''}`;
  console.log(`${(e.t / 1000).toFixed(1).padStart(6)} s  ${e.phase.padEnd(10)} ${what}`);
};

const poll = setInterval(() => {
  const now = Date.now() - t0;
  for (const w of listWindows()) {
    if (before.has(w.pid) && w.pid !== child.pid) continue;
    const handle = String(w.handle);
    const rect = [w.rect.x, w.rect.y, w.rect.width, w.rect.height];
    const key = `${w.title}|${w.className}|${w.visible}|${rect}`;
    let rec = seen.get(handle);
    if (!rec) {
      rec = { handle, pid: w.pid, process: processName(w.pid), first: now, states: [] };
      seen.set(handle, rec);
    }
    if (rec.key !== key) {
      rec.key = key;
      const dialog = w.className.trim() === DIALOG_CLASS;
      const texts = dialog ? windowTexts(w) : undefined;
      const verdict = w.pid === child.pid && w.visible ? classifyVpxWindow({ title: w.title, className: w.className, texts }) : undefined;
      const state = { t: now, phase, title: w.title, className: w.className, visible: w.visible, rect, texts };
      rec.states.push({ ...state, verdict });
      log({ ...state, process: rec.process, verdict: verdict && (verdict.kind === 'game' ? 'jeu' : `${verdict.kind} : ${verdict.message ?? verdict.notice}`) });
      if (dialog && w.visible && w.pid === child.pid && killAt === undefined) killAt = now + 2000;
    }
    if (phase === 'chargement' && w.pid === child.pid && w.visible && w.title === 'Visual Pinball Player') {
      phase = 'partie';
      closeAt = now + playMs;
    }
    if (phase === 'partie' && now >= closeAt && w.pid === child.pid && w.title === 'Visual Pinball Player') {
      phase = 'sortie';
      log({ t: now, phase, marker: 'fermeture du Player (WM_CLOSE)' });
      closeWindow(w);
    }
  }
  if (command !== 'Play' && killAt === undefined && now > 15_000) killAt = now;
  if ((killAt !== undefined && now >= killAt) || now > 180_000) {
    log({ t: now, phase, marker: killAt !== undefined ? 'arrêt de VPX après la boîte de dialogue' : 'délai dépassé : arrêt de VPX' });
    killAt = Infinity;
    child.kill();
  }
}, 100);

child.on('exit', (code) => {
  clearInterval(poll);
  const windows = [...seen.values()].map(({ key, ...r }) => r);
  const visible = windows.filter((w) => w.pid === child.pid && w.states.some((s) => s.visible));
  console.log(`\nVPX terminé (code ${code}) après ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  console.log(`Fenêtres de VPX montrées : ${visible.map((w) => `« ${w.states.at(-1).title} » [${w.states.at(-1).className}]`).join(', ') || 'aucune'}.`);
  if (args.sortie) fs.writeFileSync(args.sortie, JSON.stringify({ ...args, exitCode: code, events, windows }, null, 2));
});
