// Repli DOF des tables originales (sans ROM, événements du script relayés à libdof) : essai sur une borne,
// 26/11/2026 — JP's Space Cadet sans aucun effet, The Matrix et City Hunter « assez légers ». La config du
// configtool existait, mais suivait peu les « DOF n, état » que le script envoie vraiment (une autre version du
// script, ou des événements réservés aux jouets). Toute table originale est donc jugée sur ses propres appels.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { dofScriptEvents } from '../dof-evenements';
import { classifyDofScript } from '../dof-evenements-script';
import { DOF_EFFECT_MAX_MS, DOF_FALLBACK_NUMBER, DOF_FLIPPER_REACH, DOF_ORIGINAL_COVERED, dofOriginalCoverage, dofPlayEvents, parseDofIni, planDofFallback, type DofEquivalentOutputs } from '../dof-repli';
import { scriptCode } from '../vbscript';

const STRIPS = [
  { name: 'Speaker', width: 1, height: 48 },
  { name: 'PF Back', width: 1, height: 144 },
];
const NAMES = STRIPS.map((s) => s.name);
const EQUIVALENTS: DofEquivalentOutputs[] = [
  { number: 30, outputs: [{ number: 1, name: 'Speaker' }, { number: 4, name: 'PF Back' }] },
  { number: DOF_FALLBACK_NUMBER, outputs: [{ number: 1, name: 'Speaker' }, { number: 4, name: 'PF Back' }] },
];
const area = 'AL0 AT0 AW100 AH20';
/** Config du configtool : seul E108 (rare dans le script) sur PF Back ; E900 que le script n'envoie jamais. */
const INI30 = ['[Colors DOF]', 'Yellow=#ffff00ff', '[Config DOF]', `Neo,0,0,0,E108 Yellow ${area}/E900 Yellow ${area}`, `Rich,0,0,0,E101 Yellow ${area}/E102 Yellow ${area}`].join('\r\n');
const configs = () => [parseDofIni(INI30, 30)];
const TABLE = ['#00FF41', '#FFFFFF', '#003B00'];
const segments = (content: string, key: string) => content.split(/\r?\n/).find((l) => l.startsWith(`${key},`))!.split(/[,/]/);

test('script : chaque événement DOF compté avec son nombre d’appels (constantes, SoundFXDOF), les variables ignorées', () => {
  const code = scriptCode(
    [
      'Const dLeftFlipper = 101',
      'Sub DOF(e, s) : Controller.B2SSetData e, s : End Sub',
      'Sub LeftFlipper_Collide : DOF dLeftFlipper, DOFPulse : End Sub',
      'Sub Bumper1_Hit : PlaySoundAt SoundFXDOF("fx_bumper", 105, DOFPulse, DOFContactors), Bumper1 : DOF(105, 1) : End Sub',
      'Sub Light(n) : DOF n, 1 : DOFALT 230, 2 : End Sub',
      "' DOF 999, 1",
    ].join('\r\n'),
  );
  assert.deepEqual([...dofScriptEvents(code)].sort((a, b) => a[0] - b[0]), [[101, 1], [105, 2], [230, 1]]);
});

test('table originale : config qui suit moins de la moitié des appels du script complétée sur toutes les bandes, aux couleurs de la table', () => {
  const c = configs();
  // 101 et 102 très appelés, 108 rare (seul suivi), 150 à 179 rares.
  const events = new Map<number, number>([[101, 40], [102, 20], [108, 2], ...Array.from({ length: 30 }, (_, i) => [150 + i, 1] as [number, number])]);
  const cov = dofOriginalCoverage(c, EQUIVALENTS, NAMES, 'Neo', events);
  assert.deepEqual([...cov.covered], [108]);
  assert.ok(cov.share < DOF_ORIGINAL_COVERED, `${Math.round(cov.share * 100)} %`);

  const plan = planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: ['Neo'], palette: () => TABLE, events: (rom) => (rom === 'Neo' ? events : undefined) });
  assert.deepEqual(plan.added.map((a) => a.key), ['Neo']);
  const content = plan.content!;
  assert.match(content, /Neo: 1 of the 33 DOF events of the table script followed/);
  const line = segments(content, 'Neo');
  // Les deux bandes (sorties 1 et 4), Speaker comprise, qui ne recevait rien.
  const cols = content.split(/\r?\n/).find((l) => l.startsWith('Neo,'))!.split(',');
  assert.equal(cols.length, 3, 'clé, sortie 1 (bande RVB : sorties 1 à 3), sortie 4');
  for (const col of [cols[1]!, cols[2]!]) {
    // Les plus appelés d'abord, aux couleurs principale et secondaire de la table.
    const effects = col.split('/');
    assert.match(effects[0]!, /^E101 #(00FF41|003B00) /);
    assert.match(effects[1]!, /^E102 #(00FF41|003B00) /);
    assert.equal(effects.length, 24, 'au plus 24 événements par bande');
    assert.ok(!effects.some((e) => e.startsWith('E108 ')), 'déjà suivi : laissé à la config d’origine');
  }
  assert.ok(!line.some((s) => /^G1 /.test(s)), 'sans ROM, G1 ne s’allume jamais');
  assert.ok(!line.some((s) => /Yellow|#FFFF00/i.test(s)), 'aucune couleur étrangère à la table pour ces événements');

  // Une fois le repli lu par libdof, la table suit ses appels.
  const after = [...c, parseDofIni(content, DOF_FALLBACK_NUMBER)];
  assert.ok(dofOriginalCoverage(after, EQUIVALENTS, NAMES, 'Neo', events).share >= DOF_ORIGINAL_COVERED);
});

test('table originale : config qui suit déjà la plupart des appels laissée telle quelle ; sans événements lus, jugée comme une ROM', () => {
  const events = new Map([[101, 10], [102, 10], [300, 3]]);
  const plan = planDofFallback({ configs: configs(), equivalents: EQUIVALENTS, strips: STRIPS, roms: ['Rich'], events: () => events });
  assert.deepEqual(plan.rich, ['Rich']);
  assert.equal(plan.content, undefined);
  // Sans appel lisible (numéros passés par variable) : seuil des ROM (2 effets, pauvre) → complétée.
  const blind = planDofFallback({ configs: configs(), equivalents: EQUIVALENTS, strips: STRIPS, roms: ['Rich'], events: () => new Map() });
  assert.deepEqual(blind.added.map((a) => a.key), ['Rich']);
});

/**
 * Durée d'un effet DOF une fois déclenché, en ms ; Infinity s'il dure tant que l'événement reste allumé (« BLINK »,
 * ou sans durée). « 70 3 » : trois clignotements de 70 ms (allumé puis éteint).
 */
function effectMs(setting: string): number {
  const tokens = setting.trim().split(/\s+/).slice(1);
  if (tokens.some((t) => /^blink$/i.test(t))) return Infinity;
  const numbers = tokens.filter((t) => /^\d+$/.test(t)).map(Number);
  if (!numbers.length) return Infinity;
  return numbers.length > 1 ? numbers[0]! * 2 * numbers[1]! : numbers[0]!;
}
const settingsOf = (content: string) =>
  content
    .split(/\r?\n/)
    .filter((l) => /^[^#\[].*,/.test(l) && !l.includes('='))
    .flatMap((l) => l.split(',').slice(1))
    .flatMap((col) => (col === '0' ? [] : col.split('/')));
const zone = (s: string, k: string) => Number(new RegExp(`\\b${k}(\\d+)\\b`).exec(s)?.[1] ?? NaN);

test('repos : sans événement nouveau, les bandes s’éteignent — chaque effet du repli a une durée, même événement tenu allumé', () => {
  // Matrix (essai du 26/11/2026) : éclairage général E118 tenu allumé toute la partie, start E125 en attente ; flippers tenus.
  const events = new Map<number, number>([[101, 30], [102, 30], [118, 2], [125, 6], [108, 5], [205, 4], [500, 1], [501, 1], [502, 1], [503, 1], [504, 1], [505, 1]]);
  const classes = new Map([
    [101, { kind: 'flipper' as const, side: 'left' as const }],
    [102, { kind: 'flipper' as const, side: 'right' as const }],
    [118, { kind: 'gi' as const, side: 'center' as const }],
    [125, { kind: 'game-start' as const, side: 'center' as const }],
  ]);
  const plan = planDofFallback({ configs: configs(), equivalents: EQUIVALENTS, strips: STRIPS, roms: ['Neo'], palette: () => TABLE, events: () => events, classes: () => classes });
  const settings = settingsOf(plan.content!);
  assert.ok(settings.length >= 20);
  for (const s of settings) assert.ok(effectMs(s) <= DOF_EFFECT_MAX_MS, `effet sans fin ou trop long : ${s}`);
  // L'éclairage général n'est pas une action de jeu : rien sur les bandes, ni dans la part suivie.
  assert.ok(!settings.some((s) => s.startsWith('E118 ')), 'éclairage général');
  assert.match(plan.content!, /of the 11 DOF events/);
  // Une table dont le script n'envoie que de l'éclairage : rien à ajouter.
  assert.equal(planDofFallback({ configs: configs(), equivalents: EQUIVALENTS, strips: STRIPS, roms: ['Neo'], events: () => new Map([[118, 3]]), classes: () => classes }).content, undefined);
  // Même règle pour les tables à ROM (bobines tenues, lampes) : seul l'éclairage général G (lueur fixe, sans animation) dure.
  const rom = planDofFallback({ configs: [], equivalents: EQUIVALENTS, strips: STRIPS, roms: ['mm_109b', 'taf_l7'] });
  for (const s of settingsOf(rom.content!).filter((x) => !/^G\d+ /.test(x))) assert.ok(effectMs(s) <= DOF_EFFECT_MAX_MS, `ROM : ${s}`);
});

test('flippers : une petite barre aux couleurs de la table, du bas de la bande, jamais au-delà de la moitié', () => {
  const events = new Map<number, number>([[101, 30], [102, 30], [108, 5]]);
  const classes = new Map([
    [101, { kind: 'flipper' as const, side: 'left' as const }],
    [102, { kind: 'flipper' as const, side: 'right' as const }],
  ]);
  const strips = [...STRIPS, { name: 'Bar', width: 60, height: 1 }];
  const equivalents: DofEquivalentOutputs[] = [EQUIVALENTS[0]!, { number: DOF_FALLBACK_NUMBER, outputs: [...EQUIVALENTS[1]!.outputs, { number: 7, name: 'Bar' }] }];
  const plan = planDofFallback({ configs: configs(), equivalents, strips, roms: ['Neo'], palette: () => TABLE, events: () => events, classes: () => classes });
  const cols = plan.content!.split(/\r?\n/).find((l) => l.startsWith('Neo,'))!.split(',');
  assert.equal(cols.length, 4);
  const [speaker, back, bar] = [cols[1]!, cols[2]!, cols[3]!].map((c) => c.split('/'));
  for (const [strip, column] of [['Speaker', speaker!], ['PF Back', back!]] as const) {
    for (const n of [101, 102]) {
      const s = column.find((x) => x.startsWith(`E${n} `))!;
      assert.ok(s, `${strip} E${n}`);
      // Bande verticale : du bas (AT + AH = 100), au plus la moitié, en montant.
      assert.equal(zone(s, 'AT') + zone(s, 'AH'), 100, s);
      assert.ok(zone(s, 'AH') <= 50 && zone(s, 'AH') === Math.round(DOF_FLIPPER_REACH * 100), s);
      assert.ok(/\bADU\b/.test(s), s);
      // Couleur principale de la table, atténuée : très léger.
      const color = /#([0-9A-F]{6})/.exec(s)![1]!;
      assert.equal(color.slice(0, 2), '00');
      assert.ok(parseInt(color.slice(2, 4), 16) < 0xff * 0.6 && parseInt(color.slice(2, 4), 16) > 0, s);
      assert.ok(effectMs(s) <= DOF_EFFECT_MAX_MS);
    }
  }
  // Bande horizontale : chaque flipper part de son bord, au plus la moitié de la largeur.
  const left = bar!.find((x) => x.startsWith('E101 '))!;
  const right = bar!.find((x) => x.startsWith('E102 '))!;
  assert.ok(zone(left, 'AL') === 0 && zone(left, 'AW') <= 50 && /\bADR\b/.test(left), left);
  assert.ok(zone(right, 'AL') + zone(right, 'AW') === 100 && zone(right, 'AW') <= 50 && /\bADL\b/.test(right), right);
});

// Corpus : scripts réels des tables originales et config DOF relevés sur la borne d'essai (tmp/, hors dépôt).
const ROOT = path.resolve(__dirname, '../../../../tmp');
const INI = path.join(ROOT, 'pincab-dof', 'directoutputconfig30.ini');
function corpus(): string[] {
  const dirs = [path.join(ROOT, 'vbs-led'), path.join(ROOT, 'vbs-led', 'vpx')].filter((d) => fs.existsSync(d));
  return fs.existsSync(INI) ? dirs.flatMap((d) => fs.readdirSync(d).filter((n) => n.endsWith('.vbs')).map((n) => path.join(d, n))) : [];
}

test('corpus : toute table originale suit au moins la moitié de ses appels DOF sur les bandes, repli compris', { skip: !corpus().length && 'corpus absent' }, () => {
  const c = [parseDofIni(fs.readFileSync(INI, 'latin1'), 30)];
  let completed = 0;
  for (const file of corpus()) {
    const code = scriptCode(fs.readFileSync(file, 'latin1'));
    const rom = /^\s*Const\s+cGameName\s*=\s*"([^"]+)"/im.exec(code)?.[1];
    const events = dofScriptEvents(code);
    if (!rom || !events.size) continue;
    const classes = classifyDofScript(code);
    const plan = planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: [rom], palette: () => TABLE, events: () => events, classes: () => classes });
    const after = plan.content ? [...c, parseDofIni(plan.content, DOF_FALLBACK_NUMBER)] : c;
    const share = dofOriginalCoverage(after, EQUIVALENTS, NAMES, rom, dofPlayEvents(events, classes)).share;
    for (const s of plan.content ? settingsOf(plan.content) : []) assert.ok(effectMs(s) <= DOF_EFFECT_MAX_MS, `${rom} : ${s}`);
    assert.ok(!(plan.content ?? '').split(/[,/]/).some((s) => /^E(\d+) /.test(s) && classes.get(Number(/^E(\d+)/.exec(s)![1]))?.kind === 'gi'), `${rom} : éclairage général`);
    assert.ok(share >= DOF_ORIGINAL_COVERED, `${path.basename(file)} (${rom}) : ${Math.round(share * 100)} % des appels suivis`);
    if (plan.added.length) completed++;
  }
  assert.ok(completed > 0, 'au moins une config du corpus était trop pauvre');
});
