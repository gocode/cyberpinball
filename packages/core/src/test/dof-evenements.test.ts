// Effets LED sans configuration DOF (dof-evenements.ts) : écoute ajoutée à controller.vbs, lecture du
// fichier d'événements et profil générique réglable.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { test } from 'node:test';
import {
  DOF_EVENT_DEFAULTS,
  DOF_TAP_ENV,
  DOF_TAP_MARK,
  addDofTap,
  effectFor,
  parseTapChunk,
  parseTapLine,
  removeDofTap,
} from '../dof-evenements';

const REAL = 'D:/CyberPinball/emulators/vpx/current/scripts/controller.vbs';
const CTRL = ['Sub DOF(DOFevent, State)', '\tIf B2SOn Then', '\t\tController.B2SSetData DOFevent, State', '\tEnd If', 'End Sub', '', 'Sub DOFALT(DOFevent, State)', '\tIf B2SOnALT Then', '\tEnd If', 'End Sub', ''].join('\r\n');

test('écoute : un appel en tête de DOF et de DOFALT, avant le test de B2S', () => {
  const out = addDofTap(CTRL)!;
  const lines = out.split('\r\n');
  assert.match(lines[1]!, /CyberPinball_DofTap DOFevent, State/);
  assert.match(lines[0]!, /^Sub DOF/);
  assert.equal(lines.filter((l) => l.endsWith(DOF_TAP_MARK)).length, 2);
  assert.ok(out.includes(DOF_TAP_ENV));
  assert.ok(out.includes('\r\nSub CyberPinball_DofTap(n, s)'));
});

test('écoute : idempotente, et refaite à l\'identique après retrait', () => {
  const once = addDofTap(CTRL)!;
  assert.equal(addDofTap(once), once);
  assert.equal(removeDofTap(once), CTRL);
});

test('écoute : un controller.vbs sans Sub DOF n\'est pas touché', () => {
  assert.equal(addDofTap('Sub Autre(a, b)\r\nEnd Sub\r\n'), undefined);
});

test('écoute : le controller.vbs de VPX 10.8.1 installé reçoit la retouche', { skip: !fs.existsSync(REAL) }, () => {
  const text = fs.readFileSync(REAL, 'latin1');
  if (text.includes(DOF_TAP_MARK)) return;
  const out = addDofTap(text)!;
  assert.equal(out.split(/\r?\n/).filter((l) => l.endsWith(DOF_TAP_MARK)).length, 2);
  assert.equal(removeDofTap(out).trimEnd(), text.trimEnd());
});

test('fichier : lignes lues, ligne coupée gardée pour le morceau suivant', () => {
  assert.deepEqual(parseTapLine('E,101,1,43200.125'), { number: 101, state: 1, at: 43200.125 });
  assert.equal(parseTapLine('E,101,'), undefined);
  assert.equal(parseTapLine('n\'importe quoi'), undefined);
  const a = parseTapChunk('E,101,1,1.5\r\nE,102,0,1.6\r\nE,10');
  assert.equal(a.events.length, 2);
  assert.equal(a.rest, 'E,10');
  const b = parseTapChunk(`${a.rest}3,1,1.7\r\n`);
  assert.deepEqual(b.events, [{ number: 103, state: 1, at: 1.7 }]);
});

test('profil : coupé par défaut, réglable, flipper tenu, slingshot en impulsion', () => {
  assert.equal(effectFor({ number: 101, state: 1 }, DOF_EVENT_DEFAULTS), undefined);
  const on = { enabled: true, intensity: 100 };
  assert.deepEqual(effectFor({ number: 101, state: 1 }, on), { zone: 'left', color: '#0078ff', durationMs: 0, mode: 'hold' });
  assert.equal(effectFor({ number: 101, state: 0 }, on), undefined);
  assert.equal(effectFor({ number: 104, state: 1 }, on)?.mode, 'pulse');
  assert.equal(effectFor({ number: 999, state: 1 }, on), undefined);
  assert.equal(effectFor({ number: 102, state: 1 }, { enabled: true, intensity: 50 })?.color, '#003c80');
  assert.equal(effectFor({ number: 102, state: 1 }, { enabled: true, intensity: 0 }), undefined);
});
