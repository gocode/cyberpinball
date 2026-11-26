// Remplacement du DOF d'une table (dof-remplacement.ts), 26/11/2026 : une config communautaire qui allume
// toutes les bandes d'une seule couleur. Une table en remplacement ne garde aucune sortie de bande
// de la config du configtool, garde ses autres toys, et l'option coupée rend exactement l'état d'avant.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DOF_FALLBACK_NUMBER,
  dofReplaceOf,
  dofRomLines,
  dofRomStripEffects,
  hasSuspendedStripOutputs,
  ledsFromCabinet,
  libdofEquivalents,
  parseDofIni,
  planDofFallback,
  planLedWrite,
  readDofSetup,
  refreshDofFallback,
  restoreDofReplacement,
  restoreStripOutputs,
  suspendStripOutputs,
  withDofReplace,
  type CabinetLeds,
} from '../index';

const area = 'AL0 AT0 AW100 AH100';
const COLORS = '[Colors DOF]\r\nRed=#ff0000ff\r\nBlue=#0000ffff\r\nYellow=#ffff00ff\r\n';
/** Config du configtool : riche pour mbash (tout en jaune, à la Matrix), pauvre pour mm. */
const INI30 = [COLORS, '[Config DOF]', `mbash,${Array.from({ length: 8 }, (_, i) => `S${i + 1} Yellow ${area} 200`).join('/')},${Array.from({ length: 8 }, (_, i) => `L${i + 10} Yellow ${area} 150`).join('/')}`, `mm,S9 Red ${area} 300,0`].join('\r\n');
/** Contacteurs et bobines de la même ROM : des toys qui ne sont pas des bandes. */
const INI51 = ['[Config DOF]', 'mbash,S1,S2,W15', 'mm,S9,S10'].join('\r\n');
const NAMES = ['PF Left', 'PF Right'];
const STRIPS = NAMES.map((name) => ({ name, width: 1, height: 60 }));
const LIBRARY = ['mbash', 'mm_109b'];

const leds = (): CabinetLeds => ({
  controller: 'TeensyStripController',
  port: 'COM7',
  strips: [
    { name: 'PF Left', output: 1, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 1 },
    { name: 'PF Right', output: 2, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 4 },
  ],
});

/** LedWizEquivalent 51 d'un contrôleur de toys, ajouté au Cabinet.xml écrit par Cyber Pinball. */
const CONTACTORS = [
  '    <LedWizEquivalent>',
  '      <Name>LedWizEquivalent 51</Name>',
  '      <Outputs>',
  '        <LedWizEquivalentOutput>',
  '          <OutputName>Contactor 1</OutputName>',
  '          <LedWizEquivalentOutputNumber>1</LedWizEquivalentOutputNumber>',
  '        </LedWizEquivalentOutput>',
  '        <LedWizEquivalentOutput>',
  '          <OutputName>Knocker -- B&amp;W</OutputName>',
  '          <LedWizEquivalentOutputNumber>2</LedWizEquivalentOutputNumber>',
  '        </LedWizEquivalentOutput>',
  '      </Outputs>',
  '      <LedWizNumber>51</LedWizNumber>',
  '    </LedWizEquivalent>',
];

test('Remplacement DOF : choix gardé dans le .info de la table, retiré sans laisser de trace', () => {
  const info = { Info: { Title: 'The Matrix' }, CyberPinball: { vpx: 'autre' } };
  assert.equal(dofReplaceOf(info), false);
  const on = withDofReplace(info, true);
  assert.equal(dofReplaceOf(on), true);
  assert.deepEqual(on.CyberPinball, { vpx: 'autre', dofReplace: true });
  assert.deepEqual(withDofReplace(on, false), info, 'les autres champs restent');
  assert.deepEqual(withDofReplace(withDofReplace({ Info: {} }, true), false), { Info: {} }, 'pas de CyberPinball vide');
});

test('Remplacement DOF : sorties des bandes en sommeil, rendues octet pour octet, le repli et les autres toys intacts', () => {
  const name = 'Strip -- A&amp;B';
  const xml = [
    '<Cabinet><Toys>',
    '<LedWizEquivalent><Name>LedWizEquivalent 30</Name><Outputs>',
    `<LedWizEquivalentOutput><OutputName>${name}</OutputName><LedWizEquivalentOutputNumber>1</LedWizEquivalentOutputNumber></LedWizEquivalentOutput>`,
    '<LedWizEquivalentOutput><OutputName>Undercab RGB</OutputName><LedWizEquivalentOutputNumber>4</LedWizEquivalentOutputNumber></LedWizEquivalentOutput>',
    '</Outputs><LedWizNumber>30</LedWizNumber></LedWizEquivalent>',
    `<LedWizEquivalent><Name>LedWizEquivalent ${DOF_FALLBACK_NUMBER}</Name><Outputs><LedWizEquivalentOutput><OutputName>${name}</OutputName><LedWizEquivalentOutputNumber>1</LedWizEquivalentOutputNumber></LedWizEquivalentOutput></Outputs><LedWizNumber>${DOF_FALLBACK_NUMBER}</LedWizNumber></LedWizEquivalent>`,
    '</Toys></Cabinet>',
  ].join('\r\n');
  const s = suspendStripOutputs(xml, ['Strip -- A&B']);
  assert.deepEqual(s.suspended, [{ equivalent: 30, output: 1, name: 'Strip -- A&B' }]);
  assert.ok(hasSuspendedStripOutputs(s.xml));
  assert.ok(!/<!--(?:(?!-->)[\s\S])*--(?!>)/.test(s.xml.replace(/<!-- Cyber Pinball/g, '<!-- X')), 'pas de « -- » dans un commentaire');
  const seen = libdofEquivalents(s.xml);
  assert.deepEqual(seen.find((e) => e.number === 30)!.outputs.map((o) => o.name), ['Undercab RGB'], 'libdof ne voit plus la bande');
  assert.deepEqual(seen.find((e) => e.number === DOF_FALLBACK_NUMBER)!.outputs.map((o) => o.name), ['Strip -- A&B'], 'le repli la vise toujours');
  assert.equal(restoreStripOutputs(s.xml), xml, 'rendu exact');
  assert.equal(suspendStripOutputs(s.xml, ['Strip -- A&B']).xml, s.xml, 'idempotent');
  assert.equal(suspendStripOutputs(s.xml, []).xml, xml, 'aucune bande : tout rendu');
});

test('Remplacement DOF : une ROM à config riche reçoit quand même les effets de Cyber Pinball', () => {
  const configs = [parseDofIni(INI30, 30), parseDofIni(INI51, 51)];
  const equivalents = [
    { number: 30, outputs: [{ number: 1, name: 'PF Left' }, { number: 4, name: 'PF Right' }] },
    { number: 51, outputs: [{ number: 1, name: 'Contactor 1' }] },
    { number: DOF_FALLBACK_NUMBER, outputs: [{ number: 1, name: 'PF Left' }, { number: 4, name: 'PF Right' }] },
  ];
  const plain = planDofFallback({ configs, equivalents, strips: STRIPS, roms: LIBRARY });
  assert.deepEqual(plain.rich, ['mbash']);
  const replaced = planDofFallback({ configs, equivalents, strips: STRIPS, roms: LIBRARY, replace: ['mbash'] });
  assert.deepEqual(replaced.added.find((a) => a.rom === 'mbash'), { rom: 'mbash', key: 'mbash', before: 16, replaced: true });
  assert.ok(replaced.added.some((a) => a.rom === 'mm_109b' && !a.replaced), 'les ROM pauvres restent complétées');
  const line = replaced.content!.split(/\r?\n/).find((l) => l.startsWith('mbash,'))!;
  for (const t of ['S1 ', 'W15 ', 'L10 ']) assert.ok(line.includes(t), `signal ${t} de la ROM repris`);
  assert.ok(new Set(line.match(/#[0-9A-F]{6}/g)).size >= 4, 'plusieurs couleurs, pas tout en jaune');
  // Même clé : libdof garde la ligne de chaque ini, toys compris.
  const after = [...configs, parseDofIni(replaced.content!, DOF_FALLBACK_NUMBER)];
  assert.deepEqual(dofRomLines(after, 'mbash').lines.map((l) => l.number), [30, 51, DOF_FALLBACK_NUMBER]);
  // Option globale coupée : seulement la table en remplacement.
  const only = planDofFallback({ configs, equivalents, strips: STRIPS, roms: LIBRARY, replace: ['mbash'], complete: false });
  assert.deepEqual(only.added.map((a) => a.rom), ['mbash']);
});

test('Remplacement DOF : au lancement, aucune sortie de bande de la config d’origine, toys gardés ; coupé, état d’avant exact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-remplacement-'));
  try {
    fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), INI30);
    fs.writeFileSync(path.join(dir, 'directoutputconfig51.ini'), INI51);
    for (const f of planLedWrite(dir, leds()).files) fs.writeFileSync(f.file, f.content);
    const cabinetFile = path.join(dir, 'Cabinet.xml');
    const written = fs.readFileSync(cabinetFile, 'utf8');
    const eol = written.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(cabinetFile, written.replace(/([ \t]*<\/Toys>)/, `${CONTACTORS.join(eol)}${eol}$1`));
    const iniFile = path.join(dir, `directoutputconfig${DOF_FALLBACK_NUMBER}.ini`);
    const community = [parseDofIni(INI30, 30), parseDofIni(INI51, 51)];

    // Partie d'une autre table : état de référence.
    refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true });
    const cabinetBefore = fs.readFileSync(cabinetFile, 'utf8');
    const iniBefore = fs.readFileSync(iniFile, 'latin1');
    assert.ok(dofRomStripEffects(community, libdofEquivalents(cabinetBefore), NAMES, 'mbash') >= 16, 'config d’origine sur les bandes');

    // Partie de mbash en remplacement.
    const r = refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true, replace: ['mbash'] });
    assert.equal(r.cabinetUpdated, true);
    assert.deepEqual(r.suspended.map((s) => `${s.equivalent}:${s.name}`).sort(), ['30:PF Left', '30:PF Right']);
    const cabinetNow = fs.readFileSync(cabinetFile, 'utf8');
    const seen = libdofEquivalents(cabinetNow);
    assert.equal(dofRomStripEffects(community, seen, NAMES, 'mbash'), 0, 'aucune sortie de bande de la config d’origine');
    assert.deepEqual(seen.find((e) => e.number === 51)!.outputs.map((o) => o.name), ['Contactor 1', 'Knocker -- B&W'], 'les autres toys restent');
    const ini = parseDofIni(fs.readFileSync(iniFile, 'latin1'), DOF_FALLBACK_NUMBER);
    assert.ok(dofRomStripEffects([...community, ini], seen, NAMES, 'mbash') >= 8, 'les bandes suivent Cyber Pinball');
    assert.deepEqual(dofRomLines([...community, ini], 'mbash').lines.map((l) => l.number), [30, 51, DOF_FALLBACK_NUMBER], 'lignes des toys lues');
    // Cyber Pinball lit toujours les sorties rendues : l'éditeur des bandes ne voit rien.
    const setup = readDofSetup(dir);
    assert.deepEqual(ledsFromCabinet(setup.cabinet!)!.strips.map((s) => s.dofOutput), [1, 4]);
    assert.ok(setup.cabinet!.equivalents.find((e) => e.number === 30)!.outputs.length === 2);

    // Fin de partie : sorties rendues.
    assert.equal(restoreDofReplacement(cabinetFile), true);
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), cabinetBefore);
    assert.equal(restoreDofReplacement(cabinetFile), false, 'rien à rendre');

    // Partie interrompue (sorties encore en sommeil), puis option coupée : état d'avant, octet pour octet.
    refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true, replace: ['mbash'] });
    assert.ok(hasSuspendedStripOutputs(fs.readFileSync(cabinetFile, 'utf8')));
    refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true });
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), cabinetBefore);
    assert.equal(fs.readFileSync(iniFile, 'latin1'), iniBefore);

    // Option des ROM pauvres coupée : le remplacement marche seul, et se défait seul.
    refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: false, replace: ['mbash'] });
    assert.ok(/^mbash,/m.test(fs.readFileSync(iniFile, 'latin1')) && !/^mm,/m.test(fs.readFileSync(iniFile, 'latin1')));
    refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: false });
    assert.equal(fs.existsSync(iniFile), false);
    assert.equal(fs.readFileSync(cabinetFile, 'utf8'), cabinetBefore);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
