// garde-depot : relit les sources de tout le dépôt ; passée à chaque vérification de branche, où qu'elle soit rangée (scripts/verifier.mjs)
// PowerShell sans les signes d'un logiciel malveillant (powershell.ts). Le 19/11/2026, un antivirus
// (détection comportementale, « Trojan.Win32.Generic ») a mis l'exécutable de Cyber Pinball en
// quarantaine au démarrage : il lançait sans fenêtre PowerShell avec un script encodé
// (-EncodedCommand), la politique d'exécution contournée (-ExecutionPolicy Bypass), et listait les
// antivirus du poste (SecurityCenter2, AntiVirusProduct) ; sa tâche de réparation du pare-feu, aux
// droits d'administrateur, suivait le même modèle.
//
// Invariant : aucun code livré (application, cœur, paquets, pages, installeur) ne contient ces
// gestes, ni rien qui décode et exécute un script à la volée. Les commentaires, qui racontent
// l'histoire, ne comptent pas.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { POWERSHELL_POLICY, powershellFileArgs, powershellFileText, writeTempPowershellScript } from '../powershell';
import { REPO_ROOT } from './i18n-scan';

/** Les gestes interdits, et pourquoi. */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /EncodedCommand/i, why: 'script encodé en base 64 : passer par un fichier .ps1 lisible (writeTempPowershellScript)' },
  { pattern: /\bBypass\b/, why: `politique d'exécution contournée : ${POWERSHELL_POLICY} (POWERSHELL_POLICY)` },
  { pattern: /AntiVirusProduct|SecurityCenter2/i, why: 'relevé des antivirus du poste' },
  { pattern: /'-WindowStyle',\s*'Hidden'/, why: 'fenêtre cachée par argument : windowsHide suffit' },
  { pattern: /FromBase64String|Invoke-Expression/i, why: 'script décodé ou évalué à la volée' },
];

/** Les dossiers du code livré, et les extensions lues. */
const SHIPPED: { dir: string; ext: RegExp }[] = [
  { dir: 'app/src', ext: /\.ts$/ },
  { dir: 'app/renderer', ext: /\.(js|html)$/ },
  { dir: 'packages/core/src', ext: /\.ts$/ },
  { dir: 'packages/win-displays/src', ext: /\.ts$/ },
  { dir: 'packages/installer/src', ext: /\.ts$/ },
  { dir: 'scripts/installeur', ext: /\.(nsi|nsh)$/ },
];

function filesIn(dir: string, ext: RegExp): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'test' || e.name === 'node_modules' || e.name === 'dist' ? [] : filesIn(full, ext);
    return ext.test(e.name) ? [full] : [];
  });
}

/** Le texte sans ses commentaires de ligne (// en JavaScript, ; en NSIS, # en PowerShell en tête de ligne). */
function withoutComments(text: string, nsis: boolean): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (nsis) return /^\s*;/.test(line) ? '' : line.replace(/\s;\s.*$/, '');
      if (/^\s*(\/\/|\*|\/\*|#)/.test(line)) return '';
      return line.replace(/(^|[^:'"`])\/\/.*$/, '$1');
    })
    .join('\n');
}

test('le code livré ne lance jamais PowerShell comme un logiciel malveillant', () => {
  const found: string[] = [];
  let read = 0;
  for (const { dir, ext } of SHIPPED) {
    for (const file of filesIn(path.join(REPO_ROOT, dir), ext)) {
      read++;
      const text = withoutComments(fs.readFileSync(file, 'utf8'), /\.ns[ih]$/.test(file));
      text.split('\n').forEach((line, i) => {
        for (const { pattern, why } of FORBIDDEN) if (pattern.test(line)) found.push(`${path.relative(REPO_ROOT, file)}:${i + 1} : ${why}\n    ${line.trim().slice(0, 160)}`);
      });
    }
  }
  assert.ok(read > 100, `trop peu de fichiers lus (${read}) : les dossiers ont changé de place ?`);
  assert.deepEqual(found, []);
});

test('le test reconnaît bien chaque geste interdit, et laisse passer les commentaires', () => {
  const samples = [
    "spawn(ps, ['-NoProfile', '-EncodedCommand', encoded])",
    "['-ExecutionPolicy', 'Bypass', '-File', f]",
    'Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct',
    "spawn(ps, ['-WindowStyle', 'Hidden', '-File', f])",
    '[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($s))',
  ];
  for (const line of samples) assert.ok(FORBIDDEN.some(({ pattern }) => pattern.test(withoutComments(line, false))), line);
  assert.equal(withoutComments('// avant : -EncodedCommand et Bypass', false).trim(), '');
  assert.equal(withoutComments('const x = 1; // -EncodedCommand', false).trim(), 'const x = 1;');
  assert.equal(withoutComments("const url = 'https://exemple.test/Bypass';", false), "const url = 'https://exemple.test/Bypass';", 'une adresse n’est pas un commentaire');
  assert.equal(withoutComments('; Bypass dans un commentaire NSIS', true).trim(), '');
});

test('un script PowerShell passe par un fichier lisible : BOM, CRLF, RemoteSigned', () => {
  assert.deepEqual(powershellFileArgs('C:\\Temp\\a.ps1'), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned', '-File', 'C:\\Temp\\a.ps1']);
  const text = powershellFileText('$a = 1\n$b = 2');
  assert.equal(text.charCodeAt(0), 0xfeff, 'BOM : Windows PowerShell 5.1 lirait sinon en ANSI');
  assert.equal(text.slice(1), '$a = 1\r\n$b = 2\r\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ps-'));
  try {
    const file = writeTempPowershellScript('essai', 'Write-Output "é"', dir);
    assert.equal(path.basename(file), 'cyberpinball-essai.ps1', 'un nom fixe : relancé, il remplace le précédent');
    assert.equal(fs.readFileSync(file, 'utf8'), powershellFileText('Write-Output "é"'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
