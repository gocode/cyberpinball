// Programmes d'une autre installation ouverts pendant la partie (17/11/2026 : joueur venu de PinUP Popper, arrêts de 1 à 2 s
// sur presque toutes les tables). Accepté au démarrage (« continuer quand même »), PinUP Popper n'était plus jamais signalé.
// Invariants : relevés à chaque partie, écrits avec sa cadence, repris dans le constat « La table rame », dits par-dessus VPX
// (une fois par jour) ; et l'aide-mémoire du réglage de l'affichage dit pourquoi « Enregistrer » est grisé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { displayKeys } from '../buttons';
import { programsDuringGame } from '../coexistence';
import { NOTICE_RULES, noticeText } from '../notices';
import { slowTableFinding } from '../slowtable';
import { cadenceJournal, parseVpxCadence, recordGameCadence, tableCadence } from '../vpxcadence';

const SLOW = 'Cadence end: frames=2152 duration=55.2s fps=39.0 p50=17ms p95=70ms p99=127ms max=1132ms late=28.9% stalls=49 worst10s=10.1fps';

test('programmes relevés : menus, lecteur de PuP, dmdext, serveur B2S ; Cyber Pinball et VPX jamais', () => {
  assert.deepEqual(programsDuringGame(['explorer.exe', 'PINUPMENU.EXE', 'PinUpDisplay.exe', 'PinUpPlayer.exe', 'dmdext.exe', 'VPinballX_BGFX64.exe', 'CyberPinball.exe']), ['PinUP Popper', 'PinUP Player', 'dmdext']);
  assert.deepEqual(programsDuringGame(['B2SBackglassServerEXE.exe', 'PinballY.exe']), ['PinballY', 'B2S Server']);
  assert.deepEqual(programsDuringGame(['explorer.exe', 'CyberPinball.exe', 'VPinballX_BGFX64.exe']), []);
});

test('cadence : les programmes ouverts écrits au journal et gardés avec la partie, repris dans le constat', () => {
  const c = parseVpxCadence(SLOW)!;
  assert.match(cadenceJournal('Hellboy', c, 60, ['PinUP Popper', 'dmdext']), / ; ouverts pendant la partie : PinUP Popper, dmdext\.$/);
  assert.doesNotMatch(cadenceJournal('Hellboy', c, 60), /ouverts pendant/);
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-programmes-'));
  const file = path.join(logs, 'Hellboy.vpx');
  recordGameCadence(logs, file, c, 60, new Date(), false, ['PinUP Popper', 'dmdext']);
  assert.deepEqual(tableCadence(logs, file)[0]!.others, ['PinUP Popper', 'dmdext']);
  const finding = slowTableFinding(logs, file)!;
  assert.match(finding.detail, /PinUP Popper et dmdext étaient ouverts pendant la partie/);
  assert.match(finding.detail, /retire-les du démarrage de Windows/);
  // Partie suivante sans eux, toujours lente : plus de mention.
  recordGameCadence(logs, file, c, 60, new Date(Date.now() + 60_000));
  assert.doesNotMatch(slowTableFinding(logs, file)!.detail, /ouverts? pendant la partie/);
  fs.rmSync(logs, { recursive: true, force: true });
});

test('avis pendant la partie : par-dessus VPX, une fois par jour, hors du journal d’Activité récente', () => {
  const rule = NOTICE_RULES['program-open'];
  assert.equal(rule.away, true);
  assert.equal(rule.journal, false);
  assert.equal(rule.quietMs, 24 * 60 * 60 * 1000);
  const view = noticeText('program-open', [{ kind: 'program-open', key: 'program|PinUP Popper', at: 0, subject: 'PinUP Popper' }]);
  assert.match(view.title, /Ouvert pendant la partie : PinUP Popper/);
});

test('aide-mémoire du réglage de l’affichage : « Enregistrer » grisé tant que rien n’a changé, Lancer le rallume', () => {
  const rows = Object.fromEntries(displayKeys(undefined));
  assert.equal(rows['Enregistrer grisé : rien n’a changé ; Lancer le rallume'], rows['Valeur par défaut']);
});
