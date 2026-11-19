// Opérations sur les fichiers refusées par Windows, lancées depuis le front-end (19/11/2026) : mettre une table à la
// corbeille pendant qu'un de ses fichiers était ouvert ailleurs (EPERM sur le renommage du dossier) laissait une
// « exception non rattrapée » au journal à chaque appui, et rien à l'écran. Invariants : toute action d'un écran du
// front-end passe par runAction (library.ts), qui rattrape l'erreur et la dit à l'écran ; le message nomme le fichier
// et, quand Windows le sait, le programme qui le tient (Restart Manager, win-displays).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileErrorText, isFileLocked } from '../fileerror';

const REPO = path.join(__dirname, '..', '..', '..', '..');

test('toute action d’un écran du front-end passe par runAction, jamais appelée nue', () => {
  const source = fs.readFileSync(path.join(REPO, 'app', 'src', 'library.ts'), 'utf8');
  const naked = source
    .split(/\r?\n/)
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    // Une action d'écran (Action.run, élément du menu système, entrée trouvée par raccourci) appelée directement.
    .filter(({ line }) => /\b(?:actions\[[^\]]*\]\??|hit|item|systemItems\.get\([^)]*\)!?)\.run\(\)/.test(line));
  assert.deepEqual(naked, [], 'appeler runAction(action.run, back) : une erreur ne doit jamais sortir de l’écran');
  assert.match(source, /function runAction\(/);
  assert.match(source, /catch \(error\) \{\s*actionFailed\(error, back\)/);
});

test('message : fichier tenu par un programme (nommé ou non), disque plein, autre erreur', () => {
  const eperm = Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM', path: 'C:\\Cyber Pinball\\tables\\Champions League - Season 2023 (Original 2023)' });
  assert.ok(isFileLocked(eperm));
  assert.equal(fileErrorText(eperm, ['VPinballX64']), '« Champions League - Season 2023 (Original 2023) » est ouvert dans VPinballX64 : fermez-le, puis réessayez.');
  assert.match(fileErrorText(eperm), /est ouvert par un autre programme \(VPX, un lecteur vidéo, l’Explorateur de fichiers…\)/);
  assert.match(fileErrorText(Object.assign(new Error('x'), { code: 'EBUSY', path: 'a\\b.mp4' })), /« b\.mp4 »/);
  assert.equal(fileErrorText(Object.assign(new Error('x'), { code: 'ENOSPC' })), 'Le disque est plein : libérez de la place, puis réessayez.');
  assert.match(fileErrorText(new Error('autre chose')), /autre chose$/);
  assert.ok(!isFileLocked(new Error('x')));
});

test('Windows dit quel programme tient un fichier d’un dossier (Restart Manager)', { skip: process.platform !== 'win32' }, async () => {
  // win-displays se construit après le cœur (il en dépend) : chargé à l'exécution, son type écrit ici.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fileHolders } = require('@cyberpinball/win-displays') as { fileHolders(target: string): { name: string; pid: number }[] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-tenu-'));
  const file = path.join(dir, 'Table', 'Table.vpx');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'x');
  assert.deepEqual(fileHolders(path.join(dir, 'Table')), [], 'personne ne le tient');
  // Un autre processus l'ouvre sans partage, comme VPX tient sa table.
  const holder = spawn(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', `$f = [IO.File]::Open('${file}', 'Open', 'Read', 'None'); [Console]::Out.WriteLine('ouvert'); Start-Sleep -Seconds 30`],
    { windowsHide: true },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      holder.stdout.on('data', (d: Buffer) => d.toString().includes('ouvert') && resolve());
      holder.on('exit', () => reject(new Error('le processus témoin s’est arrêté')));
      setTimeout(() => reject(new Error('le processus témoin n’a pas ouvert le fichier')), 20_000);
    });
    const holders = fileHolders(path.join(dir, 'Table'));
    assert.ok(holders.some((h) => h.pid === holder.pid), JSON.stringify(holders));
    // Et le renommage du dossier est bien refusé, comme chez le joueur.
    assert.throws(() => fs.renameSync(path.join(dir, 'Table'), path.join(dir, 'Corbeille')), (e: NodeJS.ErrnoException) => isFileLocked(e));
  } finally {
    holder.kill();
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
