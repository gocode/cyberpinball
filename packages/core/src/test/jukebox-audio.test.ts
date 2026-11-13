// Sorties du son du Juke-box (jukebox-audio.ts) : réglage d'usine inchangé, sorties ajoutées sans
// déplacer le son, dernière sortie jamais coupée, plan de routage (filtres, gain, retard).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_MENU_MEDIA_SETTINGS,
  activeJukeboxOutputs,
  defaultJukeboxOutput,
  followsMenuOutput,
  jukeboxFilters,
  jukeboxOutputSummary,
  jukeboxRoutes,
  nextChoice,
  normalizeJukeboxAudio,
  normalizeMenuMediaSettings,
  plainRoutes,
  toggleJukeboxOutput,
  withJukeboxOutput,
  JUKEBOX_VOLUME_CHOICES,
} from '../index';

const FRONTON = 'Digital Audio (S/PDIF) (High Definition Audio Device)';
const PLAYFIELD = 'PL4380UH (NVIDIA High Definition Audio)';
const CAISSON = 'Haut-parleurs (USB Audio Device)';

test('réglage d’usine : la sortie du menu, son intact, sans graphe', () => {
  const d = DEFAULT_MENU_MEDIA_SETTINGS.jukeboxAudio;
  assert.deepEqual(d, { outputs: [] });
  assert.ok(followsMenuOutput(d));
  const routes = jukeboxRoutes(d, FRONTON);
  assert.deepEqual(routes, [{ output: FRONTON, gain: 1, filters: [], delay: 0 }]);
  assert.ok(plainRoutes(routes), 'le chemin d’avant : setSinkId seul');
  // Sans sortie de menu : la sortie par défaut de Windows.
  assert.equal(jukeboxRoutes(d, undefined)[0]!.output, '');
  // medias.json d'avant : rien à lire, le réglage d'usine.
  assert.deepEqual(normalizeMenuMediaSettings({}).jukeboxAudio, { outputs: [] });
});

test('ajouter une sortie garde celle qui jouait ; la dernière ne se coupe pas', () => {
  let a = normalizeJukeboxAudio(undefined);
  // La seule sortie (celle du menu) ne se coupe pas.
  assert.equal(toggleJukeboxOutput(a, FRONTON, FRONTON), undefined);
  a = toggleJukeboxOutput(a, FRONTON, CAISSON)!;
  assert.deepEqual(
    activeJukeboxOutputs(a, FRONTON).map((o) => o.name),
    [FRONTON, CAISSON],
    'le fronton continue, le caisson s’ajoute',
  );
  assert.ok(!followsMenuOutput(a));
  // Couper le fronton : le caisson reste seul ; puis il ne se coupe plus.
  a = toggleJukeboxOutput(a, FRONTON, FRONTON)!;
  assert.deepEqual(activeJukeboxOutputs(a, FRONTON).map((o) => o.name), [CAISSON]);
  assert.equal(toggleJukeboxOutput(a, FRONTON, CAISSON), undefined);
  // Une sortie déplacée hors du menu (le playfield) ne change rien : les sorties choisies restent.
  assert.deepEqual(activeJukeboxOutputs(a, PLAYFIELD).map((o) => o.name), [CAISSON]);
});

test('le réglage de la sortie du menu vaut aussi quand elle est suivie par défaut', () => {
  const a = withJukeboxOutput({ outputs: [] }, { ...defaultJukeboxOutput(FRONTON), volume: 70, profile: 'custom', bass: 6 });
  assert.ok(followsMenuOutput(a), 'pas activée explicitement : toujours la sortie du menu');
  const [r] = jukeboxRoutes(a, FRONTON);
  assert.equal(r!.gain, 0.7);
  assert.deepEqual(r!.filters, [{ type: 'lowshelf', frequency: 200, gain: 6 }]);
  assert.ok(!plainRoutes([r!]));
});

test('profils : basses seules, médiums et aigus, personnalisé', () => {
  const o = defaultJukeboxOutput(CAISSON);
  assert.deepEqual(jukeboxFilters({ ...o, profile: 'full', bass: 9 }), [], 'complet : les corrections ne jouent pas');
  assert.deepEqual(jukeboxFilters({ ...o, profile: 'bass' }).map((f) => f.type), ['lowpass', 'lowpass']);
  assert.deepEqual(jukeboxFilters({ ...o, profile: 'highs' }).map((f) => f.type), ['highpass', 'highpass']);
  assert.deepEqual(
    jukeboxFilters({ ...o, profile: 'custom', bass: -3, mid: 0, treble: 9 }),
    [
      { type: 'lowshelf', frequency: 200, gain: -3 },
      { type: 'highshelf', frequency: 4000, gain: 9 },
    ],
    'une bande à 0 dB n’ajoute pas de filtre',
  );
});

test('plan : une route par sortie, volume, retard ; plusieurs sorties passent par le graphe', () => {
  let a = toggleJukeboxOutput({ outputs: [] }, FRONTON, CAISSON)!;
  a = withJukeboxOutput(a, { ...activeJukeboxOutputs(a, FRONTON)[1]!, volume: 80, profile: 'bass', delay: 20 });
  const routes = jukeboxRoutes(a, FRONTON);
  assert.equal(routes.length, 2);
  assert.deepEqual(routes[1], { output: CAISSON, gain: 0.8, filters: jukeboxFilters({ profile: 'bass', bass: 0, mid: 0, treble: 0 }), delay: 0.02 });
  assert.ok(!plainRoutes(routes));
});

test('lecture d’un medias.json abîmé : valeurs bornées, doublons et noms vides écartés', () => {
  const a = normalizeJukeboxAudio({
    outputs: [
      { name: FRONTON, enabled: true, volume: 250, profile: 'fort', bass: 40, mid: -40, treble: 'x', delay: -5 },
      { name: FRONTON, enabled: false },
      { name: '  ' },
      'n’importe quoi',
    ],
  });
  assert.deepEqual(a.outputs, [{ name: FRONTON, enabled: true, volume: 100, profile: 'full', bass: 12, mid: -12, treble: 0, delay: 0 }]);
});

test('libellés et choix aux boutons', () => {
  assert.equal(jukeboxOutputSummary(defaultJukeboxOutput(FRONTON)), '100 % · complet');
  assert.equal(jukeboxOutputSummary({ ...defaultJukeboxOutput(FRONTON), volume: 80, profile: 'custom', bass: 6, treble: -3, delay: 20 }), '80 % · basses +6 dB, aigus −3 dB · retard 20 ms');
  assert.equal(nextChoice(JUKEBOX_VOLUME_CHOICES, 100), 0, 'Start après le maximum : retour au début');
  assert.equal(nextChoice(JUKEBOX_VOLUME_CHOICES, 55), 60, 'valeur hors liste : la plus proche, puis la suivante');
});
