// Banc de VPX dans le casque : la cadence lue dans la trace du runtime factice (sans VPX ni casque).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { cadenceDeLaTrace, ecartPose, manettesVues, posesProjection, SCENARIO_REPOS } from './banc-vpx.mjs';

test('banc de VPX : cadence par tranche de 360 images, lue dans la trace du runtime', () => {
  const trace = ['0 4242 runtime charge, scenario de 5 etapes', '62 4242 image 1 couches=1', '5062 4242 image 360 couches=1', '5100 4242 scenario bouton', '17862 4242 image 720 couches=1'].join('\n');
  const c = cadenceDeLaTrace(trace);
  assert.equal(c.length, 2);
  assert.ok(Math.abs(c[0].images - 71.8) < 1e-9); // 359 images en 5 s
  assert.ok(Math.abs(c[1].images - 28.125) < 1e-9); // 360 images en 12,8 s : le palier de la borne
  assert.deepEqual(cadenceDeLaTrace(''), []);
  // Le scénario « repos » ne fait aucun geste : casque porté, manettes posées.
  assert.doesNotMatch(SCENARIO_REPOS, /bouton|valeur/);
  assert.match(SCENARIO_REPOS, /^0 porte 1$/m);
});

test('banc de VPX : poses de la projection et manettes vues, lues dans la trace du runtime', () => {
  const trace = ['69 4242 projection espace=0.0000,0.0000,0.0000,0.00000', '15036 4242 projection espace=0.6000,0.0000,-0.4000,2.97986', '15059 4242 projection espace=0.0000,0.0000,0.0001,0.00000', '900 4242 manette gauche prise vue=-0.3000,1.0500,-0.2700'].join('\n');
  const p = posesProjection(trace);
  assert.equal(p.length, 3);
  assert.ok(ecartPose(p[0], p[1]).cm > 70 && ecartPose(p[0], p[1]).deg > 170);
  assert.ok(ecartPose(p[0], p[2]).cm < 0.02 && ecartPose(p[0], p[2]).deg === 0);
  assert.deepEqual(manettesVues(trace), [{ ms: 900, main: 'gauche prise', x: -0.3, y: 1.05, z: -0.27 }]);
});

test('repère d’une partie : correction nulle au lancement, sauts composés, écrite d’un coup, journal de la couche lu', () => {
  const { GameRoom } = createRequire(import.meta.url)('../app/dist/couche-repere.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repere-partie-'));
  const place = { x: 0.1, z: -0.2, yaw: 0.3, lockbarHeight: 1 };
  const room = new GameRoom(dir, place, true);
  assert.equal(fs.readFileSync(room.file, 'utf8'), `journal ${room.journal}\nsaut 0 0 0 0\n`);
  room.onJump({ angle: 0.5, tx: 0.2, tz: 0, dy: 0 });
  room.onJump({ angle: -0.5, tx: 0, tz: 0.3, dy: 0.01 });
  assert.equal(room.jumps, 2);
  const [, angle, tx, tz, dy] = fs.readFileSync(room.file, 'utf8').split('\n')[1].split(' ').map(Number);
  assert.ok(Math.abs(angle) < 1e-12 && Math.abs(tx - 0.2 * Math.cos(-0.5)) < 1e-12 && Math.abs(tz - (0.3 + 0.2 * Math.sin(-0.5))) < 1e-12 && Math.abs(dy - 0.01) < 1e-12);
  assert.equal(fs.existsSync(`${room.file}.tmp`), false);
  assert.equal(room.corrected(), false);
  fs.writeFileSync(room.journal, '01:45:02.981 couche chargée par VPX\n01:45:18.559 correction appliquée (1) : angle=0.5\n');
  assert.equal(room.corrected(), true);
  // Une partie suivante repart d'une correction nulle, journal effacé.
  const suivante = new GameRoom(dir, place, true);
  assert.equal(fs.readFileSync(suivante.file, 'utf8'), `journal ${suivante.journal}\nsaut 0 0 0 0\n`);
  assert.equal(suivante.journalText(), '');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('couche du repère écartée pour cette version seulement : levée à la mise à jour', () => {
  const { roomLayerSetAside, setRoomLayerAside } = createRequire(import.meta.url)('../app/dist/couche-repere.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'couche-ecartee-'));
  assert.equal(roomLayerSetAside(dir, '0.1.13-essai.5'), undefined);
  setRoomLayerAside(dir, '0.1.13-essai.5', 'VPX s’est arrêté brutalement (code 0xC0000005)', new Date('2026-11-14T02:00:00Z'));
  assert.deepEqual(roomLayerSetAside(dir, '0.1.13-essai.5'), { since: '2026-11-14T02:00:00.000Z', why: 'VPX s’est arrêté brutalement (code 0xC0000005)' });
  // Une autre version : l'écart est levé et le fichier effacé (la couche essayée de nouveau).
  assert.equal(roomLayerSetAside(dir, '0.1.13-essai.6'), undefined);
  assert.equal(fs.existsSync(path.join(dir, 'couche-repere-ecartee.json')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
