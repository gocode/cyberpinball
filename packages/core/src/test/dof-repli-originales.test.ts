// Repli DOF des tables originales (sans ROM, événements du script relayés à libdof) : essai sur une borne,
// 26/11/2026 — JP's Space Cadet sans aucun effet, The Matrix et City Hunter « assez légers ». La config du
// configtool existait, mais suivait peu les « DOF n, état » que le script envoie vraiment (une autre version du
// script, ou des événements réservés aux jouets). Toute table originale est donc jugée sur ses propres appels.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { dofScriptEvents } from '../dof-evenements';
import { DOF_FALLBACK_NUMBER, DOF_ORIGINAL_COVERED, dofOriginalCoverage, parseDofIni, planDofFallback, type DofEquivalentOutputs } from '../dof-repli';
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
    const plan = planDofFallback({ configs: c, equivalents: EQUIVALENTS, strips: STRIPS, roms: [rom], palette: () => TABLE, events: () => events });
    const after = plan.content ? [...c, parseDofIni(plan.content, DOF_FALLBACK_NUMBER)] : c;
    const share = dofOriginalCoverage(after, EQUIVALENTS, NAMES, rom, events).share;
    assert.ok(share >= DOF_ORIGINAL_COVERED, `${path.basename(file)} (${rom}) : ${Math.round(share * 100)} % des appels suivis`);
    if (plan.added.length) completed++;
  }
  assert.ok(completed > 0, 'au moins une config du corpus était trop pauvre');
});
