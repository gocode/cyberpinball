// Fréquence des écrans : n'alerter que si elle change quelque chose à la partie (capture de la Santé du 21/11/2026 :
// « Fronton à 60 Hz, il annonce jusqu'à 75 Hz », « Topper… 76 Hz », « DMD à 60 Hz, Windows propose 75 Hz — La bille est
// plus fluide à 75 Hz », trois « À vérifier » sans effet sur la partie).
// Invariants : le playfield sous sa fréquence possible reste à vérifier (la bille) ; un écran annexe sous la sienne n'a
// ni ligne dans la Santé ni note, sa ligne de la fiche le dit sans alarme ; un écran annexe plus lent que le playfield
// avec un VPX non corrigé reste à vérifier (VPX 10.8.1 cale toute la partie sur lui), plus avec le VPX corrigé
// (TechFacts.software.vpx.patch).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setLanguage } from '../i18n';
import { pcHealthFacts, pcLines, refreshImpact, techBlocks, type TechDisplay, type TechFacts } from '../techsheet';

setLanguage('fr');

const now = Date.parse('2026-11-21');
const screen = (role: TechDisplay['role'], hz: number, more: Partial<TechDisplay> = {}): TechDisplay => ({ role, name: `Écran ${role}`, width: 1920, height: 1080, hz, connection: 'hdmi', rotation: 0, primary: role === 'playfield', ...more });

/** La borne de la capture : playfield au plus haut, fronton, topper et DMD à 60 Hz pour 75 ou 76 possibles. */
const CAPTURE = (playfieldHz: number, patch?: number): TechFacts => ({
  at: '2026-11-21T10:00:00.000Z',
  displays: [
    screen('playfield', playfieldHz, { width: 3840, height: 2160, offeredMaxHz: playfieldHz }),
    screen('backglass', 60, { offeredMaxHz: 60, edidMaxHz: 75 }),
    screen('topper', 60, { offeredMaxHz: 60, edidMaxHz: 76 }),
    screen('dmd', 60, { offeredMaxHz: 75 }),
  ],
  software: { vpx: { version: '10.8.1', ...(patch !== undefined && { patch }) }, plugins: [] },
});

const screenLines = (f: TechFacts) => pcLines(pcHealthFacts(f), now).filter((l) => l.target.kind === 'sheet' && l.target.block === 'displays');
const displaysBlock = (f: TechFacts) => techBlocks(f, now).find((b) => b.id === 'displays')!;

test('playfield sous sa fréquence possible : à vérifier, la bille y gagne', () => {
  const f: TechFacts = { at: '2026-11-21T10:00:00.000Z', displays: [screen('playfield', 60, { offeredMaxHz: 144 }), screen('backglass', 60, { offeredMaxHz: 60 })] };
  const [line, ...rest] = screenLines(f);
  assert.equal(rest.length, 0);
  assert.equal(line!.state, 'check');
  assert.equal(line!.title, 'Playfield à 60 Hz, Windows propose 144 Hz');
  assert.match(line!.detail!, /^La bille est plus fluide à 144 Hz/);
  const block = displaysBlock(f);
  assert.equal(block.state, 'check');
  assert.equal(block.sections[0]!.rows[0]!.state, 'check');
  // Sans configuration (aucun rôle), l'écran peut être le playfield : à vérifier aussi.
  assert.equal(refreshImpact(screen(undefined, 60, { offeredMaxHz: 144 }), [screen(undefined, 60, { offeredMaxHz: 144 })]), 'ball');
});

test('écrans annexes sous leur fréquence possible, sans effet : rien dans la Santé, une mention sans alarme dans la fiche', () => {
  // Playfield à 60 Hz (VPX officiel) ou à 120 Hz avec le VPX corrigé : aucun écran annexe ne cale la partie.
  for (const f of [CAPTURE(60), CAPTURE(120, 1)]) {
    const lines = screenLines(f);
    assert.deepEqual(
      lines.map((l) => [l.state, l.title]),
      [['ok', 'Playfield à la fréquence la plus haute proposée']],
    );
    assert.ok(lines.every((l) => !/bille est plus fluide|annonce jusqu’à|Windows propose/.test(`${l.title} ${l.detail ?? ''}`)));
    const block = displaysBlock(f);
    assert.equal(block.state, 'ok');
    assert.equal(block.notes.length, 0);
    const rows = block.sections[0]!.rows;
    assert.ok(rows.every((r) => r.state === 'ok'));
    // La fiche le mentionne, sur la ligne de chaque écran.
    assert.match(rows.find((r) => r.label === 'DMD')!.detail!, /Windows propose 75 Hz, sans effet sur la bille/);
    assert.match(rows.find((r) => r.label === 'Fronton')!.detail!, /jusqu’à 75 Hz annoncés, sans effet sur la bille/);
    assert.match(rows.find((r) => r.label === 'Topper')!.detail!, /jusqu’à 76 Hz annoncés, sans effet sur la bille/);
    assert.doesNotMatch(block.summary, /Hz,|annonce|propose/);
  }
  // Tous au plus haut : la phrase d'origine, juste.
  const all: TechFacts = { at: '2026-11-21T10:00:00.000Z', displays: [screen('playfield', 120, { offeredMaxHz: 120 }), screen('backglass', 60, { offeredMaxHz: 60 })] };
  assert.deepEqual(screenLines(all).map((l) => l.title), ['Écrans à la fréquence la plus haute proposée']);
  // Écran branché hors de la configuration : la partie ne s'en sert pas.
  assert.equal(refreshImpact(screen(undefined, 60, { offeredMaxHz: 144 }), [screen('playfield', 60), screen(undefined, 60, { offeredMaxHz: 144 })]), 'none');
});

test('écran annexe plus lent que le playfield, VPX officiel : à vérifier, la partie entière suit cet écran', () => {
  const f = CAPTURE(120);
  const lines = screenLines(f);
  assert.deepEqual(
    lines.map((l) => [l.state, l.title]),
    [
      ['check', 'Fronton à 60 Hz : toute la partie suit cet écran'],
      ['check', 'Topper à 60 Hz : toute la partie suit cet écran'],
      ['check', 'DMD à 60 Hz : toute la partie suit cet écran'],
    ],
  );
  for (const l of lines) {
    assert.match(l.detail!, /^Tant que VPX dessine aussi sur cet écran, toute la partie suit sa fréquence, playfield compris\./);
    assert.doesNotMatch(l.detail!, /bille/);
  }
  // Le remède : la fréquence la plus haute de cet écran, proposée par Windows ou à obtenir par le câble.
  assert.match(lines[2]!.detail!, /Windows propose 75 Hz : choisissez-la .*Affichage avancé/);
  assert.match(lines[0]!.detail!, /Il annonce jusqu’à 75 Hz\. Windows ne propose pas plus à cette définition/);
  const block = displaysBlock(f);
  assert.equal(block.state, 'check');
  assert.equal(block.notes.length, 3);
  assert.ok(block.sections[0]!.rows.slice(1).every((r) => r.state === 'check'));
  // Le même écran avec le VPX corrigé : plus rien à vérifier.
  assert.equal(screenLines(CAPTURE(120, 1)).filter((l) => l.state === 'check').length, 0);
  assert.equal(pcHealthFacts(CAPTURE(120, 1)).vpxPatched, true);
  assert.equal(pcHealthFacts(CAPTURE(120)).vpxPatched, undefined);
});
