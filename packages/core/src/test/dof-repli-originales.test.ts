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
    // Les plus appelés d'abord, aux couleurs principale et secondaire de la table (pleines : #003B00 → #00FF00).
    const effects = col.split('/');
    assert.match(effects[0]!, /^E101 #(00FF41|00FF00) /);
    assert.ok(effects.some((e) => /^E102 #(00FF41|00FF00) /.test(e)));
    assert.equal(new Set(effects.map((e) => e.split(' ')[0])).size, 24, 'au plus 24 événements par bande');
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
 * Durée d'un effet DOF une fois déclenché, attente W comprise, en ms ; Infinity s'il dure tant que l'événement
 * reste allumé (« BLINK », ou sans durée). « 420 3 » : trois clignotements en 420 ms (TableConfigSetting de
 * libdof : la durée est divisée par le nombre de clignotements).
 */
function effectMs(setting: string): number {
  const tokens = setting.trim().split(/\s+/).slice(1);
  if (tokens.some((t) => /^blink$/i.test(t))) return Infinity;
  const numbers = tokens.filter((t) => /^\d+$/.test(t)).map(Number);
  if (!numbers.length) return Infinity;
  const wait = Number(tokens.find((t) => /^W\d+$/i.test(t))?.slice(1) ?? 0);
  return wait + numbers[0]!;
}
/** Jetons qu'un réglage du repli peut porter : tout autre ferait rejeter le réglage par libdof (TableConfigSetting). */
const TOKEN = /^(?:#[0-9A-F]{6}(?:[0-9A-F]{2})?|A[LTWH]\d+|AS\d+|AD[UDLR]|APS\d+|APD\d+|APC#[0-9A-F]{6}|AF(?:DEN|MIN|MAX|FADE)\d+|F[UD]?\d+|W\d+|L\d+|INVERT|\d+)$/;
/** Composantes d'une couleur #RRGGBB. */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
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

/** Fin d'un réglage, fondu de sortie compris (ms). */
const endMs = (s: string) => effectMs(s) + Number(/\bFD(\d+)\b/.exec(s)?.[1] ?? 0);
/** Étendue d'un réglage depuis la base du flipper (% de la bande) : le bas d'une verticale, le bord du flipper d'une horizontale. */
type Base = 'bottom' | 'left' | 'right';
function extent(s: string, base: Base): { from: number; size: number } {
  if (base === 'bottom') return { from: 100 - zone(s, 'AT') - zone(s, 'AH'), size: zone(s, 'AH') };
  if (base === 'left') return { from: zone(s, 'AL'), size: zone(s, 'AW') };
  return { from: 100 - zone(s, 'AL') - zone(s, 'AW'), size: zone(s, 'AW') };
}

/**
 * Invariant de l'effet d'un flipper, à tout niveau de luminosité (en partie, libdof ne laisse à une bande baissée
 * qu'un à quinze niveaux par couleur : un dégradé de luminosité s'y arrête net, essais des 0.2.4-essai.56 et 57).
 * - La barre part de la base, ne dépasse pas DOF_FLIPPER_REACH, pleine à la base ; sa tête se fond vers les LED
 *   éteintes par tramage : des points de plus en plus espacés, le dernier fin ; la tête s'éteint avant la base.
 * - Couleurs opaques et pleines (une transparence partielle s'éteint à faible luminosité), la couleur de la table
 *   et sa teinte voisine.
 * - Un seul petit tir : impulsion brève poussée dans un balayage de toute la bande, vers le fond du plateau.
 */
function assertFlipperFx(all: string[], base: Base, label: string) {
  for (const s of all) {
    for (const hex of s.match(/#[0-9A-F]{6,8}\b/g) ?? []) {
      assert.ok(hex.length === 7 || hex.endsWith('FF'), `${label} : couleur translucide ${hex}, éteinte à faible luminosité`);
      assert.ok(Math.max(...rgb(hex)) >= 0xf0, `${label} : couleur sombre ${hex}`);
    }
    assert.ok(effectMs(s) <= DOF_EFFECT_MAX_MS, s);
  }
  const shots = all.filter((s) => /\bAD[UDLR]\b/.test(s));
  const bars = all.filter((s) => !shots.includes(s));
  // Le tir.
  assert.equal(shots.length, 1, `${label} : un tir`);
  const shot = shots[0]!;
  const toward = { bottom: 'U', left: 'R', right: 'L' }[base];
  assert.ok(/\bAL0 AT0 AW100 AH100\b/.test(shot) && new RegExp(`\\bAD${toward}\\b`).test(shot), `${label} : tir vers le fond : ${shot}`);
  assert.ok(effectMs(shot) <= 150, `${label} : impulsion trop longue : ${shot}`);
  const length = (zone(shot, 'AS') * (Number(/ (\d+) L\d+$/.exec(shot)![1]) + Number(/\bFD(\d+)\b/.exec(shot)?.[1] ?? 0))) / 1000;
  assert.ok(length <= 12, `${label} : tir de ${length} % de la bande, pas discret`);
  assert.ok(zone(shot, 'AS') <= 150, `${label} : tir trop rapide pour le voir partir`);
  assert.match(shot, /^E\d+ #00FF41 /, `${label} : tir aux couleurs de la table`);
  // La barre.
  const spans = bars.map((s) => ({ s, ...extent(s, base) }));
  for (const b of spans) assert.ok(b.from >= 0 && b.size > 0 && b.from + b.size <= DOF_FLIPPER_REACH * 100 && b.from + b.size <= 50, `${label} : ${b.s}`);
  const lit = Array.from({ length: 100 }, (_, p) => spans.some((b) => p >= b.from && p < b.from + b.size));
  const runs: { from: number; to: number }[] = [];
  lit.forEach((on, p) => {
    if (!on) return;
    const last = runs[runs.length - 1];
    if (last && last.to === p) last.to = p + 1;
    else runs.push({ from: p, to: p + 1 });
  });
  assert.ok(runs[0]!.from === 0 && runs[0]!.to >= 10, `${label} : base pleine`);
  assert.ok(runs.length >= 4, `${label} : tête sans tramage (${runs.length} segment(s)), coupée net`);
  const gaps = runs.slice(1).map((r, i) => r.from - runs[i]!.to);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i]! >= gaps[i - 1]!, `${label} : points pas de plus en plus espacés : ${gaps.join(', ')}`);
  assert.ok(gaps[gaps.length - 1]! > gaps[0]!, `${label} : espacement constant, pas de fondu`);
  assert.ok(runs[runs.length - 1]!.to - runs[runs.length - 1]!.from <= 2, `${label} : tête trop épaisse`);
  const colors = new Set(bars.map((s) => /#([0-9A-F]{6})/.exec(s)![1]!));
  assert.ok(colors.has('00FF41') && colors.size >= 2, `${label} : couleurs ${[...colors].join(', ')}`);
  const byTop = [...spans].sort((a, b) => a.from + a.size - (b.from + b.size));
  for (let i = 1; i < byTop.length; i++) assert.ok(endMs(byTop[i]!.s) <= endMs(byTop[i - 1]!.s), `${label} : la tête s'éteint après la base`);
}

test('flippers : barre du bas de la bande, tête fondue par tramage avant la moitié, et un petit tir vers le fond', () => {
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
    for (const n of [101, 102]) assertFlipperFx(column.filter((x) => x.startsWith(`E${n} `)), 'bottom', `${strip} E${n}`);
  }
  // Bande horizontale : chaque flipper part de son bord, son tir file vers l'autre.
  assertFlipperFx(bar!.filter((x) => x.startsWith('E101 ')), 'left', 'Bar E101');
  assertFlipperFx(bar!.filter((x) => x.startsWith('E102 ')), 'right', 'Bar E102');
});


/** Réglages de chaque événement, bande par bande. */
function byEvent(content: string, key: string): Map<string, string[]>[] {
  const cols = content.split(/\r?\n/).find((l) => l.startsWith(`${key},`))!.split(',').slice(1).filter((c) => c !== '0');
  return cols.map((col) => {
    const m = new Map<string, string[]>();
    for (const s of col.split('/')) {
      const t = s.split(' ')[0]!;
      m.set(t, [...(m.get(t) ?? []), s]);
    }
    return m;
  });
}

/**
 * Invariants de tout effet du repli, table originale ou ROM : jetons que libdof sait lire, couleur pleine (jamais
 * assombrie : invisible sur une bande à faible luminosité), au moins deux teintes par événement (dégradé), durée
 * bornée. L'éclairage général des ROM (G, lueur de fond) est seul à rester sombre.
 */
function assertRichEffects(content: string, label: string) {
  for (const s of settingsOf(content)) {
    const [trigger, ...tokens] = s.split(' ');
    for (const tok of tokens) assert.match(tok, TOKEN, `${label} : jeton inconnu de libdof « ${tok} » dans ${s}`);
    if (/^G\d+$/.test(trigger!)) continue;
    for (const hex of s.match(/#[0-9A-F]{6}/g) ?? []) assert.ok(Math.max(...rgb(hex)) >= 0xf0, `${label} : couleur sombre ${hex} dans ${s}`);
    assert.ok(effectMs(s) <= DOF_EFFECT_MAX_MS, `${label} : ${s}`);
  }
  for (const strip of byEvent(content, content.split(/\r?\n/).find((l) => /^[^#\[].*,/.test(l) && !l.includes('='))!.split(',')[0]!)) {
    for (const [t, list] of strip) {
      if (/^G/.test(t)) continue;
      const hues = new Set(list.flatMap((s) => s.match(/#[0-9A-F]{6}/g) ?? []));
      assert.ok(hues.size >= 2, `${label} : ${t} d'une seule teinte : ${list.join(' / ')}`);
    }
  }
}

test('bille envoyée : une comète qui monte toute la bande, à l’impulsion comme à la sortie du lanceur', () => {
  // The Matrix : E120 impulsion (lancement automatique), E208 tenu tant que la bille est au lanceur (DOFOn / DOFOff).
  const code = scriptCode(
    [
      'Sub swPlungerRest_Hit() : DOF 208, DOFOn : End Sub',
      'Sub swPlungerRest_UnHit() : DOF 208, DOFOff : End Sub',
      'Sub AutoFire() : PlungerIM.AutoFire : DOF 120, DOFPulse : End Sub',
      'Sub Bumper1_Hit() : DOF 105, DOFPulse : End Sub',
      'Sub LeftFlipper_Hit : DOF 101, DOFOn : End Sub',
    ].join('\r\n'),
  );
  const classes = classifyDofScript(code);
  assert.deepEqual(classes.get(208), { kind: 'launch', side: 'center', held: true });
  assert.deepEqual(classes.get(120), { kind: 'launch', side: 'center' });
  const events = new Map([[208, 4], [120, 1], [105, 6]]);
  const plan = planDofFallback({ configs: configs(), equivalents: EQUIVALENTS, strips: STRIPS, roms: ['Neo'], palette: () => ['#E8B400', '#1060FF', '#00C060'], events: () => events, classes: () => classes });
  for (const strip of byEvent(plan.content!, 'Neo')) {
    for (const t of ['E120', 'E208']) {
      const list = strip.get(t)!;
      // Toute la bande, en montant, à la couleur principale de la table (pleine) puis sa teinte voisine.
      const sweeps = list.filter((s) => /\bAL0 AT0 AW100 AH100\b/.test(s) && /\bADU\b/.test(s));
      assert.ok(sweeps.length >= 2, `${t} : ${list.join(' / ')}`);
      assert.match(sweeps[0]!, /^E\d+ #FFC600 /, 'jaune #E8B400 de la table, plein');
      assert.ok(list.some((s) => /#FFFFFF/.test(s)), `${t} : éclair blanc au départ`);
      assert.ok(list.some((s) => /\bAFDEN\d+/.test(s)), `${t} : étincelles`);
    }
    // Tenu : la comète part quand la bille quitte le lanceur (extinction de l'événement), pas à son arrivée.
    assert.ok(strip.get('E208')!.filter((s) => /\bADU\b/.test(s)).every((s) => /\bINVERT\b/.test(s)));
    assert.ok(!strip.get('E120')!.some((s) => /\bINVERT\b/.test(s)));
  }
  assertRichEffects(plan.content!, 'Neo');
});

test('effets riches partout : jetons libdof, couleurs pleines, dégradé à deux teintes, durée bornée (originales et ROM)', () => {
  const kinds = ['flipper', 'sling', 'bumper', 'launch', 'ball-start', 'drain', 'kicker', 'target', 'spinner', 'ramp', 'rollover', 'award', 'jackpot', 'multiball', 'tilt', 'game-start', 'game-over', 'flasher', 'other'] as const;
  const events = new Map(kinds.map((_, i) => [300 + i, 30 - i] as [number, number]));
  const classes = new Map(kinds.map((kind, i) => [300 + i, { kind, side: 'center' as const }]));
  // Palette sombre (#003B00) ou grise : remontée à pleine luminosité.
  for (const palette of [TABLE, ['#202020', '#003B00', '#400000']]) {
    const equivalents: DofEquivalentOutputs[] = [EQUIVALENTS[0]!, { number: DOF_FALLBACK_NUMBER, outputs: [...EQUIVALENTS[1]!.outputs, { number: 7, name: 'Bar' }] }];
    const plan = planDofFallback({ configs: configs(), equivalents, strips: [...STRIPS, { name: 'Bar', width: 60, height: 1 }], roms: ['Neo'], palette: () => palette, events: () => events, classes: () => classes });
    assertRichEffects(plan.content!, `originale ${palette.join(' ')}`);
  }
  const rom = planDofFallback({ configs: [], equivalents: EQUIVALENTS, strips: STRIPS, roms: ['mm_109b', 'taf_l7'] });
  assertRichEffects(rom.content!, 'ROM');
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
