// Ce qu'il faut pour jouer (playable.ts) : le fichier .vpx et, si le script en demande une,
// la ROM. Aucun autre manque ne retient « Jouer », n'est « indispensable » dans « Ce qu'il
// faut », ni ne compte comme étape obligatoire du parcours, quelle que soit sa gravité.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quickNeeds, requirements } from '../acquisition';
import { FINDING_CODES, scriptFacts, type Finding } from '../doctor';
import { journeyChoices, journeyPosition, planJourney } from '../journey';
import { blocksPlay, PLAY_BLOCKING_FINDINGS, playSeverity, requiredForPlay } from '../playable';
import type { VpsGame } from '../vps';

const SCRIPT = scriptFacts('Const cGameName="t2_l8"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n');
const link = (n: number) => ({ urls: [{ url: `https://vpuniverse.com/files/file/${n}-x/` }], updatedAt: n });

test('seuls les constats de ROM sont bloquants ; tout autre « error » redescend à « warning »', () => {
  for (const code of FINDING_CODES) {
    const finding: Finding = { code, severity: 'error', title: code, detail: '' };
    const blocking = (PLAY_BLOCKING_FINDINGS as readonly string[]).includes(code);
    assert.equal(blocksPlay(finding), blocking, code);
    assert.equal(playSeverity(finding).severity, blocking ? 'error' : 'warning', code);
    // Un rappel ou une ROM trouvée par le dossier commun de PinMAME ne bloque pas.
    assert.equal(blocksPlay({ code, severity: 'info' }), false);
  }
  assert.ok(PLAY_BLOCKING_FINDINGS.every((c) => c.startsWith('rom')));
});

test('aucun autre manque ne retient « Jouer » ni ne compte dans « étape n sur N »', () => {
  const others = FINDING_CODES.filter((c) => !(PLAY_BLOCKING_FINDINGS as readonly string[]).includes(c));
  // Même marqués « error » (règle à venir mal classée), tous ensemble.
  const findings: Finding[] = others.map((code) => ({ code, severity: 'error', title: code, detail: 'x', fix: { label: `Corriger ${code}`, ops: [] } }));
  const script = { ...SCRIPT, dmdFolder: 'T2DMD' };
  const j = planJourney({ file: 'C:\\tables\\T2\\T2.vpx', vpxInstalled: true, cabinetConfigured: true, screens: { backglass: true, dmd: 'small', topper: false }, script, findings });
  assert.equal(j.ready, true);
  assert.equal(j.remaining, 0);
  assert.deepEqual(j.steps.map((s) => s.id), ['setup', 'table', 'rom', 'play']);
  assert.equal(journeyPosition(j), 'Étape 4 sur 4');
  assert.ok(j.extras.length > 0 && j.extras.every((s) => !s.required));
  assert.equal(journeyChoices(j)[0]!.choice.action.kind, 'play');

  // Et une ROM qui manque, elle, retient « Jouer ».
  const rom: Finding = { code: 'romMissing', severity: 'error', title: 'ROM « t2_l8 » absente', detail: 'x', rom: 't2_l8' };
  const blocked = planJourney({ file: 'C:\\tables\\T2\\T2.vpx', vpxInstalled: true, cabinetConfigured: true, screens: { backglass: true, dmd: 'small', topper: false }, script, findings: [rom, ...findings] });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.steps[blocked.current]!.id, 'rom');
});

test('« Ce qu’il faut » : indispensables, la table et la ROM seulement ; l’installation rapide ne bloque que sur elles', () => {
  const game: VpsGame = {
    id: 'g',
    name: 'Terminator 2',
    tableFiles: [{ id: 't', tableFormat: 'VPX', ...link(1) }],
    b2sFiles: [{ id: 'b', ...link(2) }],
    romFiles: [{ version: 't2_l8', ...link(3) }],
    pupPackFiles: [{ id: 'p', ...link(4) }],
    altSoundFiles: [{ id: 's', ...link(5) }],
    altColorFiles: [{ id: 'c', ...link(6) }],
    soundFiles: [{ id: 'm', ...link(7) }],
    topperFiles: [{ id: 'tp', ...link(8) }],
    povFiles: [{ id: 'pv', ...link(9) }],
  };
  const needs = requirements(game, game.tableFiles![0]!, { screens: { backglass: true, dmd: 'full', topper: true }, roms: new Set() });
  assert.deepEqual(needs.filter((n) => n.required).map((n) => n.kind).sort(), ['rom', 'table']);
  for (const n of needs) assert.equal(n.required, requiredForPlay(n.kind), n.kind);
  // Fronton sans lien : rien ne bloque l'installation rapide.
  const noB2s = requirements({ ...game, b2sFiles: [] }, game.tableFiles![0]!, { screens: { backglass: true, dmd: 'full', topper: true }, roms: new Set() });
  assert.deepEqual(quickNeeds(noB2s).blocked, []);
});
