// Banc de la bande d'une partie entre amis au-dessus d'un B2S ou d'un PuP-Pack (lancé par
// docs\demo-bande-devant.ps1, sur un bureau Windows caché : rien n'apparaît sur les écrans du poste).
// Essai du 04/11/2026 : en automatique, la bande va sur le fronton même quand la table s'en sert, et
// doit y rester devant. La vraie bande (app/dist/game-notice.js, createGameNotices) est posée sur un
// fronton simulé ; une fenêtre d'un autre processus (PowerShell, WinForms) le couvre, au premier plan
// permanent comme le B2S, puis réaffirmé toutes les 100 ms comme un PuP-Pack insistant. Toutes les
// 50 ms, la pile des fenêtres de Windows dit qui est devant ; le journal de la bande dit
// « recouverte par … : remise devant ».
//   electron docs/demo-bande-devant.cjs <spec.json>   { "out": dossier du rapport }

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = path.join(__dirname, '..');
const spec = JSON.parse(fs.readFileSync(process.argv.find((a) => a.endsWith('.json')), 'utf8').replace(/^﻿/, ''));

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const wd = require(path.join(REPO, 'packages', 'win-displays', 'dist', 'index.js'));
const { createGameNotices } = require(path.join(REPO, 'app', 'dist', 'game-notice.js'));

for (const event of ['uncaughtException', 'unhandledRejection']) process.on(event, (error) => (console.error(error), app.exit(1)));
ipcMain.on('i18n', (e) => (e.returnValue = {}));
// La bande se ferme entre deux mesures : sans fenêtre, Electron quitterait de lui-même.
app.on('window-all-closed', () => undefined);

/** La fenêtre étrangère : un formulaire WinForms au premier plan permanent sur `r`, réaffirmé toutes les `every` ms (0 : une fois). */
function foreign(r, every) {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class Z { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }
'@
$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'; $f.ShowInTaskbar = $false; $f.TopMost = $true; $f.StartPosition = 'Manual'
$f.Location = New-Object System.Drawing.Point(${r.x}, ${r.y}); $f.Size = New-Object System.Drawing.Size(${r.width}, ${r.height})
$f.BackColor = [System.Drawing.Color]::DarkMagenta; $f.Text = 'Fronton simulé (B2S, PuP)'
if (${every} -gt 0) {
  $t = New-Object System.Windows.Forms.Timer; $t.Interval = ${every || 1}
  $t.Add_Tick({ [Z]::SetWindowPos($f.Handle, [IntPtr](-1), 0, 0, 0, 0, 0x13) | Out-Null }); $t.Start()
}
[System.Windows.Forms.Application]::Run($f)
`;
  return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Une situation : la bande et la fenêtre étrangère, `ms` de mesure ; la part du temps où la bande est devant. */
async function measure(name, every, zone, lines) {
  const log = [];
  const notices = createGameNotices({
    place: () => ({ zone: { x: zone.x, y: zone.y + zone.height + 20, width: 1080, height: 1920 }, rotation: 0 }),
    boardScreens: () => ({ playfield: { zone: { x: zone.x, y: zone.y + zone.height + 20, width: 1080, height: 1920 }, rotation: 0 }, free: [], zones: { backglass: zone } }),
    scoresSettings: () => ({ place: 'auto', dmd: false }),
    dmdColor: () => undefined,
    invites: () => [],
    coveredBy: (win) => {
      const by = core.overlayCoveredBy(wd.listWindows((w) => w.visible), win.getNativeWindowHandle().readBigUInt64LE(0), process.pid);
      return by ? `« ${by.title} » (${by.className}, processus ${by.pid}${by.topmost ? ', au premier plan permanent' : ''})` : undefined;
    },
    log: (line) => log.push(line),
  });
  const view = { mode: 'board', title: 'Partie entre amis', rows: [{ name: 'Bruno', score: '2 418 300', points: 2418300, detail: 'Bille 2 sur 3', short: 'B2', ball: 2, done: false, me: false, lead: true }, { name: 'Alexis', score: '1 240 500', points: 1240500, detail: 'Bille 3 sur 3', short: 'B3', ball: 3, done: false, me: true, lead: false }] };
  // D'abord la bande (comme en partie, 3 s après la table), puis la fenêtre de la table qui passe devant.
  notices.board(view);
  await wait(1500);
  const child = foreign(zone, every);
  await wait(2500);
  let front = 0;
  let total = 0;
  const end = Date.now() + 8000;
  // La bande se relit seule, à son rythme (son minuteur, comme pendant une partie) : rien d'autre ne la relance ici.
  while (Date.now() < end) {
    const band = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible());
    const stack = wd.listWindows((w) => w.visible);
    const mine = band ? stack.findIndex((w) => w.handle === band.getNativeWindowHandle().readBigUInt64LE(0)) : -1;
    const theirs = stack.findIndex((w) => w.pid === child.pid || w.title === 'Fronton simulé (B2S, PuP)');
    if (mine >= 0 && theirs >= 0) {
      total++;
      if (mine < theirs) front++;
    }
    if (process.env.BANDE_DEVANT_DEBUG && total <= 3 && band) {
      const handle = band.getNativeWindowHandle().readBigUInt64LE(0);
      const by = core.overlayCoveredBy(stack, handle, process.pid);
      lines.push(`   relevé : bande ${mine} (${JSON.stringify(stack[mine]?.rect)}, topmost ${stack[mine]?.topmost}), étrangère ${theirs} (${JSON.stringify(stack[theirs]?.rect)}, pid ${stack[theirs]?.pid}, topmost ${stack[theirs]?.topmost}), recouverte par : ${by?.title ?? 'rien'} ; au-dessus : ${stack.slice(0, Math.max(0, mine)).map((w) => `${w.title || w.className}#${w.pid}`).slice(0, 6).join(' | ')}`);
    }
    await wait(50);
  }
  child.kill();
  notices.close();
  await wait(500);
  const share = total ? Math.round((front / total) * 1000) / 10 : 0;
  lines.push(`${name} : bande devant ${share} % du temps (${front}/${total} relevés).`);
  for (const l of log.filter((l) => /recouverte|repasse/.test(l))) lines.push(`   ${l}`);
  return { share, total };
}

app.whenReady().then(async () => {
  fs.mkdirSync(spec.out, { recursive: true });
  const d = screen.getPrimaryDisplay().workArea;
  const zone = { x: d.x + 40, y: d.y + 40, width: Math.min(1280, d.width - 80), height: Math.min(720, Math.round(d.height / 2)) };
  const lines = [`Fronton simulé : ${zone.width} × ${zone.height} en ${zone.x}, ${zone.y}.`];
  const b2s = await measure('B2S (premier plan permanent, posé une fois)', 0, zone, lines);
  const pup = await measure('PuP-Pack insistant (premier plan réaffirmé toutes les 100 ms)', 100, zone, lines);
  fs.writeFileSync(path.join(spec.out, 'rapport.txt'), lines.join('\n') + '\n');
  for (const l of lines) console.log(l);
  // La bande tient devant le B2S, et devant un PuP insistant au moins les trois quarts du temps.
  const ok = b2s.total > 20 && pup.total > 20 && b2s.share >= 95 && pup.share >= 75;
  console.log(ok ? 'Bande devant : conforme.' : 'Bande devant : en échec.');
  app.exit(ok ? 0 : 1);
});
