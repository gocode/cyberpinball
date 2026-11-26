// Repli DOF des tables à ROM (dof-repli.ts) : essai sur une borne, 25/11/2026, « toutes les tables à ROM testées
// restent muettes » — la config du configtool n'avait presque rien pour les bandes (Medieval Madness 2
// effets, Addams Family 6, Indiana Jones 4). Le repli est écrit dans la config DOF, sans jamais toucher
// une config riche ni masquer la vraie ligne d'une ROM.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DOF_FALLBACK_NUMBER,
  cabinetXml,
  dofPoorBelow,
  dofRomLines,
  dofRomStripEffects,
  dofRomTriggers,
  ledsFromCabinet,
  parseDofIni,
  planDofFallback,
  planLedWrite,
  readDofSetup,
  refreshDofFallback,
  withFallbackEquivalent,
  type CabinetLeds,
  type DofEquivalentOutputs,
} from '../index';

const STRIPS = [
  { name: 'PF Left', width: 1, height: 60 },
  { name: 'PF Right', width: 1, height: 60 },
];
const COLORS = '[Colors DOF]\r\nRed=#ff0000ff\r\nBlue=#0000ffff\r\nWhite=#ffffffff\r\n';
const area = 'AL0 AT0 AW100 AH100';
/** Config du configtool : pauvre pour mm (2 effets), riche pour mbash, rien pour taf. */
const INI30 = [
  '[version]',
  'version=1',
  COLORS,
  '[Variables DOF]',
  `flash=Red ${area} 200`,
  '[Config DOF]',
  `mm,S9 Red ${area} 300/W15 Blue ${area},0`,
  `mbash,${Array.from({ length: 6 }, (_, i) => `S${i + 1} @flash@`).join('/')},${Array.from({ length: 6 }, (_, i) => `L${i + 10} Blue ${area} 150`).join('/')}`,
  `ij_l7,S20 White ${area},0`,
].join('\r\n');
/** Pinscape : signaux de la ROM (bobines, flippers), sans bande. */
const INI51 = ['[Colors DOF]', 'Red=#ff0000ff', '[Config DOF]', 'mm,S9,S10,W15,S47|S48,G1', 'taf,S1,S2,W11,(L12 and W13)', 'mbash,S1,S2'].join('\r\n');
const EQUIVALENTS: DofEquivalentOutputs[] = [
  { number: 30, outputs: [{ number: 1, name: 'PF Left' }, { number: 4, name: 'PF Right' }] },
  { number: 51, outputs: [{ number: 1, name: 'Contactor 1' }] },
  { number: DOF_FALLBACK_NUMBER, outputs: [{ number: 1, name: 'PF Left' }, { number: 4, name: 'PF Right' }] },
];
const configs = () => [parseDofIni(INI30, 30), parseDofIni(INI51, 51)];
const NAMES = STRIPS.map((s) => s.name);
const LIBRARY = ['mm_109b', 'taf_l7', 'ij_l7', 'mbash', 'totan_14', 'Inconnue_10'];

test('Repli DOF : effets sur les bandes comptés comme libdof (colonnes, variables, rangs de correspondance)', () => {
  const c = configs();
  assert.equal(dofRomStripEffects(c, EQUIVALENTS, NAMES, 'mm_109b'), 2, 'mm : 2 effets sur PF Left, rien sur PF Right');
  assert.equal(dofRomStripEffects(c, EQUIVALENTS, NAMES, 'mbash'), 12, 'variables développées');
  assert.equal(dofRomStripEffects(c, EQUIVALENTS, NAMES, 'taf_l7'), 0, 'Pinscape seulement');
  assert.equal(dofRomStripEffects(c, EQUIVALENTS, NAMES, 'totan_14'), 0, 'aucune ligne');
  assert.equal(dofRomLines(c, 'mm_109b').tier, 2, 'mm_109b trouvé par « mm_ »');
  assert.deepEqual(dofRomLines(c, 'ij_l7').lines.map((l) => l.number), [30], 'égalité : la ligne exacte passe avant');
  assert.deepEqual(dofRomTriggers(c, 'mm_109b').sort(), ['G1', 'S10', 'S47', 'S48', 'S9', 'W15'].sort());
  assert.deepEqual(dofRomTriggers(c, 'taf_l7').sort(), ['L12', 'S1', 'S2', 'W11', 'W13'].sort(), 'conditions comprises, couleurs et calques ignorés');
});

test('Repli DOF : invariant — aucune ROM de la bibliothèque ne reste sans effet sur les bandes, et une config riche n’est pas touchée', () => {
  const c = configs();
  const plan = planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: LIBRARY });
  assert.ok(plan.content);
  assert.deepEqual(plan.rich, ['mbash'], 'Monster Bash : config riche, aucune ligne');
  assert.ok(!/^mbash,/m.test(plan.content));
  // Même clé que la vraie config : mm (pas mm_109b), taf (pas taf_l7), ij_l7 ; nom exact pour une ROM inconnue.
  assert.deepEqual(plan.added.map((a) => a.key).sort(), ['Inconnue_10', 'ij_l7', 'mm', 'taf', 'totan_14'].sort());
  const after = [...c, parseDofIni(plan.content, DOF_FALLBACK_NUMBER)];
  for (const rom of LIBRARY) {
    const n = dofRomStripEffects(after, EQUIVALENTS, NAMES, rom);
    assert.ok(n >= dofPoorBelow(STRIPS.length), `${rom} : ${n} effets sur les bandes`);
    // Le repli ne change pas le rang retenu par libdof : la vraie ligne reste lue.
    assert.equal(dofRomLines(after, rom).tier, dofRomLines(c, rom).tier || 1, rom);
    for (const line of dofRomLines(c, rom).lines) assert.ok(dofRomLines(after, rom).lines.some((l) => l.number === line.number), `${rom} : ligne ${line.number} gardée`);
  }
  assert.equal(dofRomStripEffects(after, EQUIVALENTS, NAMES, 'mbash'), 12);
  // Signaux de la ROM, formes et couleurs variées, calques explicites.
  const mm = plan.content.split(/\r?\n/).find((l) => l.startsWith('mm,'))!;
  for (const t of ['S9 ', 'S47 ', 'W15 ', 'G1 ']) assert.ok(mm.includes(t), t);
  assert.ok(/ADU/.test(mm) && /AFDEN/.test(mm) && / 70 3 /.test(mm) && / F\d+/.test(mm), 'balayage vers le haut, scintillement, clignotement borné, fondu');
  assert.ok(new Set(mm.match(/#[0-9A-F]{6}/g)).size >= 4, 'plusieurs couleurs');
  // Sans signal connu : les bobines de la ROM.
  const totan = plan.content.split(/\r?\n/).find((l) => l.startsWith('totan_14,'))!;
  assert.ok(totan.includes('S1 ') && totan.includes('S28 '));
  // Couleurs de la table lancée.
  const tinted = planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: ['mm_109b'], palette: () => ['#12ab34'] });
  assert.ok(tinted.content!.includes('#12AB34'));
  // Marqué, sans date : réécrit seulement s'il change.
  assert.ok(plan.content.startsWith('# Written by Cyber Pinball'));
  assert.equal(planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: [...LIBRARY].reverse() }).content, plan.content);
  // Toutes riches : rien à écrire.
  assert.equal(planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: ['mbash'] }).content, undefined);
});

test('Repli DOF : seuls les effets qui réagissent au jeu comptent (éclairage permanent ou GI : config pauvre)', () => {
  // Config vue sur une vraie borne le 25/11/2026 (taf) : deux moitiés du même éclair par bobine, et une
  // config inventée qui n'allume les bandes qu'en continu.
  const half = (s: string, top: number) => `${s} White AT${top} AH15 AL0 AW100 BLINK 490 L-19`;
  const ini = parseDofIni(
    [COLORS, '[Config DOF]', `taf,0,0,0,${['S16', 'S23', 'S24'].flatMap((s) => [half(s, 0), half(s, 85)]).join('/')}`, `tz,G1 Red ${area}/ON Blue ${area}/White ${area},0`].join('\r\n'),
    30,
  );
  assert.equal(dofRomStripEffects([ini], EQUIVALENTS, NAMES, 'taf_l7'), 3, 'un effet par bobine, pas par moitié');
  assert.equal(dofRomStripEffects([ini], EQUIVALENTS, NAMES, 'tz_92'), 0, 'GI, ON et couleur seule : rien ne réagit');
  // Une seule bande : le repli suffit quand même à passer le seuil.
  const one = [{ number: 30, outputs: [{ number: 4, name: 'PF Right' }] }, { number: DOF_FALLBACK_NUMBER, outputs: [{ number: 1, name: 'PF Right' }] }];
  const plan = planDofFallback({ configs: [ini], equivalents: one, strips: [STRIPS[1]!], roms: ['taf_l7', 'tz_92'] });
  assert.deepEqual(plan.added.map((a) => a.key).sort(), ['taf', 'tz']);
  const after = [ini, parseDofIni(plan.content!, DOF_FALLBACK_NUMBER)];
  for (const rom of ['taf_l7', 'tz_92']) assert.ok(dofRomStripEffects(after, one, ['PF Right'], rom) >= dofPoorBelow(1), rom);
});

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-dof-repli-'));
}

const leds = (): CabinetLeds => ({
  controller: 'TeensyStripController',
  port: 'COM7',
  strips: [
    { name: 'PF Left', output: 1, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 1 },
    { name: 'PF Right', output: 2, width: 1, height: 60, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 80, dofOutput: 4 },
  ],
});

test('Repli DOF : écrit dans le dossier des ini, Cabinet.xml complété, retiré sur demande, fichiers du joueur intacts', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'directoutputconfig30.ini'), INI30);
  fs.writeFileSync(path.join(dir, 'directoutputconfig51.ini'), INI51);
  for (const f of planLedWrite(dir, leds()).files) fs.writeFileSync(f.file, f.content);
  // Cabinet.xml d'une version précédente, sans le LedWizEquivalent du repli.
  const cabinetFile = path.join(dir, 'Cabinet.xml');
  const old = withFallbackEquivalent(fs.readFileSync(cabinetFile, 'utf8'), []);
  assert.ok(!old.includes('LedWizEquivalent 99'));
  fs.writeFileSync(cabinetFile, old);
  let r = refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true });
  assert.equal(r.cabinetUpdated, true);
  assert.equal(r.wrote, true);
  assert.equal(r.file, path.join(dir, 'directoutputconfig99.ini'));
  const setup = readDofSetup(dir);
  assert.deepEqual(setup.ini.map((f) => f.number), [30, 51], 'le repli n’est pas compté comme config du joueur');
  assert.equal(setup.fallbackIni, r.file);
  assert.deepEqual(setup.cabinet!.equivalents.find((e) => e.number === 99)?.outputs.map((o) => o.name), NAMES);
  assert.deepEqual(ledsFromCabinet(setup.cabinet!)!.strips.map((s) => s.dofOutput), [1, 4], 'l’éditeur garde les sorties du configtool');
  assert.equal(withFallbackEquivalent(fs.readFileSync(cabinetFile, 'utf8'), NAMES), fs.readFileSync(cabinetFile, 'utf8'), 'stable');
  // Rien ne change : rien n'est réécrit.
  r = refreshDofFallback(setup, LIBRARY, { enabled: true });
  assert.equal(r.wrote, false);
  assert.equal(r.cabinetUpdated, false);
  // Option coupée : fichier retiré.
  r = refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: false });
  assert.equal(r.removed, true);
  assert.equal(fs.existsSync(path.join(dir, 'directoutputconfig99.ini')), false);
  // Un directoutputconfig99.ini du joueur n'est jamais touché.
  fs.writeFileSync(path.join(dir, 'directoutputconfig99.ini'), `${COLORS}[Config DOF]\r\nmm,0\r\n`);
  r = refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true });
  assert.ok(r.refused);
  assert.equal(fs.readFileSync(path.join(dir, 'directoutputconfig99.ini'), 'latin1'), `${COLORS}[Config DOF]\r\nmm,0\r\n`);
  fs.rmSync(path.join(dir, 'directoutputconfig99.ini'));
  // Cabinet.xml écrit à la main : pas de LedWizEquivalent 99 imposé, pas de repli.
  fs.writeFileSync(cabinetFile, cabinetXml(leds()).replace(/<!--[^>]*-->/, '').replace(/[ \t]*<LedWizEquivalent>(?:(?!<\/LedWizEquivalent>)[\s\S])*LedWizEquivalent 99[\s\S]*?<\/LedWizEquivalent>\r?\n/, ''));
  r = refreshDofFallback(readDofSetup(dir), LIBRARY, { enabled: true });
  assert.ok(r.refused);
  assert.equal(fs.existsSync(path.join(dir, 'directoutputconfig99.ini')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});
