// Plafond des effets en partie pour les LED pilotées par libdof (dof-niveau.ts) : le <Brightness> de chaque
// bande de Cabinet.xml, que libdof applique avec sa correction gamma (LedStrip.cpp). Invariant : au cran
// 10 %, une bande en blanc plein sort quasi éteinte, quelle que soit sa luminosité décrite ; la
// description de la bande (éditeur, pilote de Cyber Pinball) n'est jamais changée par le plafond.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DOF_DESCRIBED_BRIGHTNESS,
  LED_LEVEL_CHOICES,
  LIBDOF_BRIGHTNESS_GAMMA,
  applyDofLedLevel,
  cabinetXml,
  dofStripBrightness,
  ledLevelGain,
  ledsFromCabinet,
  libdofBrightnessFactor,
  readCabinetXml,
  withGameLedLevel,
  type CabinetLeds,
} from '../index';

const leds: CabinetLeds = {
  controller: 'TeensyStripController',
  port: 'COM5',
  strips: [
    { name: 'PF Left', output: 1, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 1 },
    { name: 'PF Right', output: 2, width: 1, height: 60, arrangement: 'BottomUpLeftRight', colorOrder: 'GRB', brightness: 100, dofOutput: 4 },
    { name: 'PF Back', output: 3, width: 32, height: 8, arrangement: 'LeftRightTopDown', colorOrder: 'RGB', brightness: 35, dofOutput: 7 },
  ],
};
const now = new Date('2026-11-26T12:00:00Z');

/** Ce que libdof envoie pour un blanc plein (255) d'une bande dont <Brightness> vaut `b` (troncature, LedStrip.cpp). */
const libdofWhite = (b: number, gamma = LIBDOF_BRIGHTNESS_GAMMA) => Math.floor(255 * libdofBrightnessFactor(b, gamma));

test('au cran 10 %, une bande pilotée par libdof sort quasi éteinte, quelle que soit sa luminosité décrite', () => {
  const gain = ledLevelGain(10);
  for (const described of [1, 5, 20, 35, 50, 80, 100]) {
    const b = dofStripBrightness(described, gain);
    assert.ok(b >= 1, `bande à ${described} % : jamais éteinte d'office (${b})`);
    assert.ok(libdofWhite(b) <= 3, `bande à ${described} % : blanc plein ${libdofWhite(b)}/255 au cran 10 %`);
  }
  // Le facteur de libdof suit celui de la bande décrite multiplié par le gain (à l'arrondi entier près).
  for (const level of LED_LEVEL_CHOICES) {
    const g = ledLevelGain(level);
    const factor = libdofBrightnessFactor(dofStripBrightness(100, g));
    if (level === 0) assert.equal(factor, 0, 'cran 0 : éteint');
    else assert.ok(Math.abs(factor - g) <= Math.max(0.01, g * 0.12), `cran ${level} : facteur libdof ${factor.toFixed(4)} pour un gain ${g.toFixed(4)}`);
  }
  assert.equal(dofStripBrightness(80, 1), 80, 'cran 100 : la luminosité décrite, telle quelle');
  assert.equal(dofStripBrightness(0, 0.5), 0, 'bande éteinte : le reste');
  // Correction gamma déclarée par la bande : prise en compte.
  const linear = dofStripBrightness(100, ledLevelGain(10), 1);
  assert.ok(libdofWhite(linear, 1) <= 3, `gamma 1 : blanc plein ${libdofWhite(linear, 1)}/255`);
  // Plus le cran est haut, plus libdof éclaire.
  const steps = LED_LEVEL_CHOICES.map((l) => dofStripBrightness(80, ledLevelGain(l)));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i]! >= steps[i - 1]!, `crans croissants : ${steps.join(', ')}`);
});

test('Cabinet.xml : plafond posé sur chaque bande, description gardée, idempotent, retour exact au cran 100', () => {
  const original = cabinetXml(leds, now);
  const capped = withGameLedLevel(original, ledLevelGain(10));
  assert.notEqual(capped, original);
  assert.equal(withGameLedLevel(capped, ledLevelGain(10)), capped, 'idempotent');
  assert.equal(withGameLedLevel(capped, 1), original, 'au cran 100 : le fichier d’origine, octet pour octet');
  assert.equal(withGameLedLevel(withGameLedLevel(capped, ledLevelGain(60)), ledLevelGain(10)), capped, 'un autre cran puis 10 % : même fichier');
  // Ce que libdof lit : <Brightness> plafonné ; le reste du fichier (contrôleur, LedWizEquivalent) intact.
  const written = [...capped.matchAll(/<Brightness>(\d+)<\/Brightness>/g)].map((m) => Number(m[1]));
  assert.deepEqual(written, leds.strips.map((s) => dofStripBrightness(s.brightness, ledLevelGain(10))));
  for (const b of written) assert.ok(libdofWhite(b) <= 3);
  assert.equal(capped.replace(/\r\n\s*<CyberPinballBrightness>\d+<\/CyberPinballBrightness>/g, '').replace(/<Brightness>\d+</g, '<Brightness>X<'), original.replace(/<Brightness>\d+</g, '<Brightness>X<'));
  assert.ok(capped.split('\r\n').every((l) => !l.includes('\n')), 'fins de ligne du fichier gardées');
  // Ce que Cyber Pinball relit (éditeur des bandes, pilote des LED) : la luminosité décrite.
  const cabinet = readCabinetXml('Cabinet.xml', capped);
  assert.deepEqual(cabinet.strips.map((s) => s.brightness), [80, 100, 35]);
  assert.deepEqual(ledsFromCabinet(cabinet)?.strips.map((s) => s.brightness), [80, 100, 35]);
  // Bande sans <Brightness> (libdof : 100) : le plafond est ajouté.
  const bare = original.replace(/\r\n\s*<Brightness>100<\/Brightness>/, '');
  const added = withGameLedLevel(bare, ledLevelGain(10));
  assert.equal(readCabinetXml('Cabinet.xml', added).strips[1]!.brightness, 100);
  assert.match(added, new RegExp(`<Brightness>${dofStripBrightness(100, ledLevelGain(10))}</Brightness>\\r\\n\\s*<${DOF_DESCRIBED_BRIGHTNESS}>100<`));
});

test('applyDofLedLevel : réécrit le Cabinet.xml de Cyber Pinball, jamais un fichier écrit à la main', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-niveau-'));
  try {
    const file = path.join(dir, 'Cabinet.xml');
    fs.writeFileSync(file, cabinetXml(leds, now), 'utf8');
    const first = applyDofLedLevel({ file }, ledLevelGain(10));
    assert.equal(first.updated, true);
    assert.equal(first.refused, undefined);
    assert.deepEqual(first.strips.map((s) => s.described), [80, 100, 35]);
    for (const s of first.strips) assert.ok(libdofWhite(s.written) <= 3, `${s.name} : ${s.written}`);
    assert.equal(applyDofLedLevel({ file }, ledLevelGain(10)).updated, false, 'rien à réécrire');
    // Écrit à la main (sans la marque) : laissé tel quel, et la raison est donnée.
    const hand = cabinetXml(leds, now).replace(/<!--[^>]*-->\r\n/, '');
    fs.writeFileSync(file, hand, 'utf8');
    const refused = applyDofLedLevel({ file }, ledLevelGain(10));
    assert.equal(refused.updated, false);
    assert.match(refused.refused ?? '', /hand-written/);
    assert.equal(fs.readFileSync(file, 'utf8'), hand);
    assert.deepEqual(refused.strips.map((s) => s.written), [80, 100, 35], 'le journal dit ce que libdof lira vraiment');
    // Fichier écrit à la main : <Brightness> reste la description, l'élément de Cyber Pinball n'y compte pas.
    const odd = hand.replace('<Brightness>80</Brightness>', `<Brightness>80</Brightness><${DOF_DESCRIBED_BRIGHTNESS}>5</${DOF_DESCRIBED_BRIGHTNESS}>`);
    assert.equal(readCabinetXml('Cabinet.xml', odd).strips[0]!.brightness, 80);
    assert.deepEqual(applyDofLedLevel(undefined, 0.5), { updated: false, strips: [] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
