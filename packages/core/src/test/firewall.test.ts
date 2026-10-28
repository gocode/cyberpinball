// Règle du pare-feu de Windows du réseau des bornes (firewall.ts) : lecture de netsh quelle que
// soit la langue de Windows, ligne de commande, et le même nom et les mêmes arguments dans
// l'installeur (scripts/installeur/cyberpinball.nsi), qui ne la demande jamais en mise à jour,
// en silence ni dans un bac à sable. Aucun test ne touche au vrai pare-feu.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { FIREWALL_RULE, firewallAddArgs, firewallDeleteArgs, netshCommandLine, readFirewallShow } from '../firewall';
import { REPO_ROOT } from './i18n-scan';

const EXE = 'D:\\CyberPinball\\app\\CyberPinball.exe';

test('lecture de netsh : en anglais, en français, absente, autre dossier', () => {
  const en = `\r\nRule Name:                            Cyber Pinball\r\n----------------------------------------------------------------------\r\nEnabled:                              Yes\r\nDirection:                            In\r\nProgram:                              ${EXE}\r\nAction:                               Allow\r\nOk.\r\n`;
  const fr = `\r\nNom de la règle :                     Cyber Pinball\r\nActivée :                             Oui\r\nProgramme :                           d:\\cyberpinball\\app\\cyberpinball.exe\r\nOk.\r\n`;
  assert.equal(readFirewallShow(en, 0, EXE), 'allowed');
  assert.equal(readFirewallShow(fr, 0, EXE), 'allowed', 'chemin sans casse, intitulé traduit');
  assert.equal(readFirewallShow('No rules match the specified criteria.\r\n', 1, EXE), 'missing');
  assert.equal(readFirewallShow('Aucune règle ne correspond aux critères spécifiés.\r\n', 1, EXE), 'missing');
  assert.equal(readFirewallShow(en.replace(EXE, 'C:\\Ailleurs\\CyberPinball.exe'), 0, EXE), 'other-program');
  assert.equal(readFirewallShow('', null, EXE), 'unknown', 'netsh introuvable');
});

test('ligne de commande : chaque valeur entre guillemets, la règle limitée à l’exécutable', () => {
  assert.equal(netshCommandLine(firewallDeleteArgs()), 'advfirewall firewall delete rule name="Cyber Pinball"');
  const add = netshCommandLine(firewallAddArgs('C:\\Program Files\\Cyber Pinball\\CyberPinball.exe'));
  assert.equal(add, 'advfirewall firewall add rule name="Cyber Pinball" dir="in" action="allow" program="C:\\Program Files\\Cyber Pinball\\CyberPinball.exe" enable="yes" profile="any"');
});

test('l’installeur pose la même règle, jamais en mise à jour, en silence ni dans un bac à sable', () => {
  const nsi = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'installeur', 'cyberpinball.nsi'), 'utf8');
  const section = nsi.slice(nsi.indexOf('Section "Partage entre bornes'), nsi.indexOf('Function RegleParefeuPresente'));
  assert.ok(section.length > 100, 'section du pare-feu');
  // Même nom et mêmes réglages que firewall.ts.
  assert.match(section, new RegExp(`delete rule name="${FIREWALL_RULE}"`));
  const add = /add rule ([^']*)'/.exec(section)?.[1] ?? '';
  for (const arg of firewallAddArgs('X').slice(4).filter((a) => !a.startsWith('program='))) assert.ok(add.includes(arg.replace(/^([^=]+)=(.*)$/, (_m, k: string, v: string) => (k === 'name' ? `${k}="${v}"` : `${k}=${v}`))), `l'installeur passe ${arg}`);
  assert.match(add, /program="\$Racine\\app\\\$\{EXE\}"/);
  // L'élévation vient après les trois sorties : bac à sable, mise à jour, silence sans /PAREFEU.
  const runas = section.indexOf('ExecShellWait "runas"');
  for (const guard of ['$BacASable != ""', '$Maj == "1"', '${Silent}']) {
    const at = section.indexOf(guard);
    assert.ok(at >= 0 && at < runas, `garde « ${guard} » avant la demande d'autorisation`);
  }
  assert.equal((section.match(/ExecShellWait "runas"/g) ?? []).length, 1, 'une seule demande d’élévation à l’installation');
  // Désinstallation : la règle retirée seulement si elle vise cette racine, jamais en silence ni en bac à sable.
  const uninstall = nsi.slice(nsi.indexOf('Section "Uninstall"'), nsi.indexOf('SectionEnd', nsi.indexOf('Section "Uninstall"')));
  const removal = uninstall.indexOf('delete rule name="Cyber Pinball"');
  assert.ok(removal > uninstall.indexOf('$BacASable == ""') && removal > uninstall.indexOf('${AndIfNot} ${Silent}') && removal > uninstall.indexOf('$INSTDIR\${EXE}'), 'désinstallation gardée');
  assert.equal((nsi.match(/ExecShellWait "runas"/g) ?? []).length, 2, 'installation et désinstallation, rien d’autre');
});
