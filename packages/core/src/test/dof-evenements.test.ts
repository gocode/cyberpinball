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
  parseSoundLine,
  parseTapChunk,
  parseTapLine,
  removeDofTap,
} from '../dof-evenements';
import { dofSoundClass } from '../dof-evenements-script';

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
  assert.equal(out.split(/\r?\n/).filter((l) => l.endsWith(DOF_TAP_MARK)).length, 3, 'DOF, DOFALT et SoundFX');
  assert.equal(removeDofTap(out).trimEnd(), text.trimEnd());
});

const SOUNDS = [CTRL, 'Function SoundFX (Sound, Effect)', '\tIf Effect = 0 Then', '\t\tSoundFX = ""', '\tElse', '\t\tSoundFX = Sound', '\tEnd If', 'End Function', ''].join('\r\n');

test('écoute des sons : un appel en tête de SoundFX, retiré à l\'identique, et un controller.vbs déjà retouché sans elle est refait', () => {
  const out = addDofTap(SOUNDS)!;
  const lines = out.split('\r\n');
  const at = lines.findIndex((l) => /^Function SoundFX/.test(l));
  assert.match(lines[at + 1]!, /^\tOn Error Resume Next : CyberPinball_SoundTap Sound, Effect : On Error Goto 0 ' CyberPinball-dof-tap$/);
  assert.equal(lines.filter((l) => l.endsWith(DOF_TAP_MARK)).length, 3);
  assert.ok(out.includes('\r\nSub CyberPinball_SoundTap(snd, fx)'));
  assert.equal(addDofTap(out), out, 'idempotente');
  assert.equal(removeDofTap(out), SOUNDS);
  // Retouché par une version d'avant l'écoute des sons (ni l'appel dans SoundFX, ni sa Sub) : refait.
  const sub = lines.findIndex((l) => l.startsWith('Dim CyberPinball_SoundTapLast'));
  const old = lines.filter((l, i) => i < sub && !l.includes('CyberPinball_SoundTap Sound, Effect')).join('\r\n') + '\r\n';
  assert.ok(old.includes(DOF_TAP_MARK) && !old.includes('SoundTap'));
  assert.equal(addDofTap(old), out, 'fichier déjà retouché sans les sons : refait');
});

test('fichier : lignes de sons lues, avec les événements', () => {
  assert.deepEqual(parseSoundLine('S,1,Sling_L3,43200.5'), { effect: 1, sound: 'Sling_L3', at: 43200.5 });
  assert.equal(parseSoundLine('S,1,'), undefined);
  assert.equal(parseSoundLine('E,101,1,1.5'), undefined);
  const c = parseTapChunk('E,101,1,1.5\r\nS,8,Target_Hit_2,1.6\r\nS,1,Bump');
  assert.equal(c.events.length, 1);
  assert.deepEqual(c.sounds, [{ effect: 8, sound: 'Target_Hit_2', at: 1.6 }]);
  assert.equal(c.rest, 'S,1,Bump');
});

test('sons : ce que dit le nom du son (slingshot, bumper, cible, knocker), pas les flippers ni les bruits', () => {
  assert.deepEqual(dofSoundClass('Sling_L3', 1), { kind: 'sling', side: 'left' });
  assert.deepEqual(dofSoundClass('Sling_R8', 1), { kind: 'sling', side: 'right' });
  assert.deepEqual(dofSoundClass('Bumpers_Top_2', 1), { kind: 'bumper', side: 'center' });
  assert.deepEqual(dofSoundClass('Target_Hit_6', 8), { kind: 'target', side: 'center' });
  assert.deepEqual(dofSoundClass('Drop_Target_Reset_2', 1), { kind: 'target', side: 'center' });
  assert.deepEqual(dofSoundClass('Saucer_Kick', 1), { kind: 'kicker', side: 'center' });
  assert.deepEqual(dofSoundClass('BallRelease4', 1), { kind: 'ball-start', side: 'center' });
  assert.deepEqual(dofSoundClass('Knocker_1', 2), { kind: 'award', side: 'center' });
  assert.deepEqual(dofSoundClass('fx_son_sans_nom', 8), { kind: 'target', side: 'center' }, 'jouet cibles');
  assert.equal(dofSoundClass('Flipper_L01', 7), undefined);
  assert.equal(dofSoundClass('Flipper_ReFlip_L01', 1), undefined);
  assert.equal(dofSoundClass('Plunger_Release', 1), undefined, 'lanceur : les boutons et la tirette');
  assert.equal(dofSoundClass('Ball_Rolling', 1), undefined);
  assert.equal(dofSoundClass('', 1), undefined);
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
