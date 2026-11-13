// Menu système > Médias > Réglages du Juke-box (13/11/2026) : tous les réglages du Juke-box au même
// endroit (app/src/jukebox-settings.ts), à part de la gestion de ses playlists. Sorties du son : une
// ou plusieurs, chacune avec son volume, son profil, ses basses, médiums et aigus, son retard, et un
// extrait d'essai ; visualiseur du DMD ; médaillon dans la roue (le même réglage que Tables > Roue).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { DEFAULT_MENU_MEDIA_SETTINGS, type MenuMediaSettings } from '../mediaview';
import { SYSTEM_GROUPS, systemPathOf } from '../systemmenu';
import type { JukeboxAudioRoute } from '../jukebox-audio';

interface BuiltLike {
  heading: string;
  icon?: string;
  lead?: string;
  actions: { label: string; detail?: string; icon?: string; tone?: string; key?: string; run: () => void }[];
  back: () => void;
}

const FRONTON = 'Digital Audio (S/PDIF) (High Definition Audio Device)';
const PLAYFIELD = 'PL4380UH (NVIDIA High Definition Audio)';
const OCULUS = 'Casque (Oculus Virtual Audio Device)';
const OUTPUTS = [
  { endpointId: '{0.0.0.00000000}.{a}', friendlyName: PLAYFIELD, deviceDesc: 'PL4380UH', interfaceName: 'NVIDIA High Definition Audio', bus: 'HDAUDIO', formFactor: 9, channels: 2, channelMask: 3, isDefault: true },
  { endpointId: '{0.0.0.00000000}.{b}', friendlyName: FRONTON, deviceDesc: 'Digital Audio (S/PDIF)', interfaceName: 'High Definition Audio Device', bus: 'HDAUDIO', formFactor: 8, channels: 2, channelMask: 3 },
  { endpointId: '{0.0.0.00000000}.{c}', friendlyName: OCULUS, deviceDesc: 'Casque', interfaceName: 'Oculus Virtual Audio Device', bus: 'ROOT', formFactor: 3, channels: 2, channelMask: 3 },
];

function bench() {
  const { createJukeboxSettings } = require(path.join(REPO_ROOT, 'app', 'dist', 'jukebox-settings.js')) as {
    createJukeboxSettings(host: unknown): { item: { run(): void; detail?: string }; open(back: () => void): void };
  };
  let settings: MenuMediaSettings = { ...DEFAULT_MENU_MEDIA_SETTINGS };
  const opened: { build: () => BuiltLike; at: number }[] = [];
  const tests: JukeboxAudioRoute[] = [];
  let system = 0;
  const s = createJukeboxSettings({
    library: { openCustom: (build: () => BuiltLike, at = 0) => opened.push({ build, at }), openSystem: () => system++ },
    settings: () => settings,
    save: (next: MenuMediaSettings) => (settings = next),
    outputs: () => OUTPUTS,
    menuOutput: () => FRONTON,
    place: (name: string) => (name === FRONTON ? 'fronton' : name === PLAYFIELD ? 'playfield' : undefined),
    test: (route: JukeboxAudioRoute) => tests.push(route),
  });
  const top = () => opened.at(-1)!;
  const screen = () => top().build();
  const press = (label: RegExp | string) => {
    const a = screen().actions.find((x) => (typeof label === 'string' ? x.label === label : label.test(x.label)));
    assert.ok(a, `ligne « ${label} » absente de « ${screen().heading} » : ${screen().actions.map((x) => x.label).join(' | ')}`);
    a.run();
  };
  return { s, settings: () => settings, screen, top, press, tests, system: () => system };
}

test('menu système : « Réglages du Juke-box » dans Médias, juste après la gestion du Juke-box', () => {
  assert.deepEqual(systemPathOf('jukebox-settings'), ['medias']);
  const entries = SYSTEM_GROUPS.medias.entries as readonly string[];
  assert.equal(entries.indexOf('jukebox-settings'), entries.indexOf('jukebox') + 1);
});

test('écran principal : sorties du son, visualiseur, médaillon ; le visualiseur a quitté « Médias, son et attente »', () => {
  const b = bench();
  assert.match(b.s.item.detail ?? '', /Sorties du son : fronton, son intact · visualiseur : Pochette/);
  b.s.item.run();
  const main = b.screen();
  assert.equal(main.heading, 'Réglages du Juke-box');
  assert.deepEqual(
    main.actions.map((a) => a.label),
    ['Sorties du son : fronton, son intact', 'Visualiseur du Juke-box : Pochette', 'Juke-box dans la roue : affiché', 'Retour'],
  );
  const icons = main.actions.map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, `une icône par ligne : ${icons.join(', ')}`);
  b.press(/^Visualiseur/);
  assert.equal(b.settings().jukeboxVisualizer, 'multicolore');
  b.press(/^Juke-box dans la roue/);
  assert.equal(b.settings().jukebox, false, 'le même réglage que Tables > Roue');
  b.press('Retour');
  assert.equal(b.system(), 1);
  const media = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'menu-settings.ts'), 'utf8');
  assert.doesNotMatch(media, /jukeboxVisualizer/, 'plus de visualiseur dans « Médias, son et attente »');
});

test('sorties : celles de la borne (pas les virtuelles), la sortie du menu suivie ; ajouter un caisson, régler, écouter', () => {
  const b = bench();
  b.s.item.run();
  b.press(/^Sorties du son/);
  const list = b.screen().actions;
  assert.deepEqual(
    list.map((a) => a.label),
    [FRONTON, PLAYFIELD, 'Revenir au réglage d’usine', 'Retour'],
    'le casque virtuel n’est pas proposé ; la sortie du menu en tête',
  );
  assert.match(list[0]!.detail!, /100 % · complet · fronton · suit la sortie de la borne/);
  assert.match(list[1]!.detail!, /coupée · playfield/);
  assert.equal(list[2]!.tone, 'quiet', 'déjà au réglage d’usine');

  // La sortie du menu ne se coupe pas tant qu'elle est seule.
  b.press(FRONTON);
  assert.equal(b.screen().heading, FRONTON);
  assert.equal(b.screen().actions[0]!.tone, 'quiet');
  b.screen().actions[0]!.run();
  assert.deepEqual(b.settings().jukeboxAudio.outputs, [], 'rien n’a changé');
  b.press('Retour');

  // Le playfield s'ajoute, le fronton continue.
  b.press(PLAYFIELD);
  b.press(/^Juke-box sur cette sortie/);
  assert.deepEqual(
    b.settings().jukeboxAudio.outputs.filter((o) => o.enabled).map((o) => o.name),
    [FRONTON, PLAYFIELD],
  );
  // Volume 60 %, profil personnalisé, basses +6 dB, retard 20 ms.
  b.press(/^Volume/);
  b.press('60 %');
  assert.equal(b.screen().heading, PLAYFIELD, 'retour à la sortie');
  assert.equal(b.top().at, 1, 'sur la ligne du volume');
  assert.equal(b.screen().actions.find((a) => /^Basses/.test(a.label))!.tone, 'quiet', 'basses grisées hors profil personnalisé');
  b.press(/^Profil/);
  b.press('Personnalisé');
  b.press(/^Basses/);
  b.press('+6 dB');
  b.press(/^Retard/);
  b.press('20 ms');
  const o = b.settings().jukeboxAudio.outputs.find((x) => x.name === PLAYFIELD)!;
  assert.deepEqual([o.volume, o.profile, o.bass, o.delay], [60, 'custom', 6, 20]);
  b.press('Écouter cette sortie');
  assert.deepEqual(b.tests, [{ output: PLAYFIELD, gain: 0.6, filters: [{ type: 'lowshelf', frequency: 200, gain: 6 }], delay: 0.02 }]);
  const icons = b.screen().actions.map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, `une icône par ligne : ${icons.join(', ')}`);
  b.press('Retour');
  assert.equal(b.top().at, 1, 'retour sur la ligne de la sortie');
  assert.match(b.screen().actions[1]!.detail!, /60 % · basses \+6 dB · retard 20 ms · playfield/);

  // Réglage d'usine : tout revient à la sortie du menu.
  b.press('Revenir au réglage d’usine');
  assert.deepEqual(b.settings().jukeboxAudio.outputs, []);
});

test('gestion du Juke-box : la ligne « Réglages du Juke-box » y mène, Exit y ramène', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'jukebox-menu.ts'), 'utf8');
  assert.match(src, /label: t\('Réglages du Juke-box'\), key: 'settings'[\s\S]{0,120}host\.openSettings!\(\(\) => open\(\)\)/);
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /jukeboxSettings: \(back\) => jukeboxSettings\.open\(back\)/);
  assert.match(front, /routes: \(\) => jukeboxAudioRoutes\(\)/);
  assert.match(front, /return jukeboxRoutes\(headset\?\.inUse \? \{ outputs: \[\] \} : mediaSettings\.jukeboxAudio, menuOutput\(\)\);/, 'casque en usage : le Juke-box le suit');
});

test('borne sans sortie de menu (pas d’étape « Son ») : la sortie par défaut de Windows est active, et le reste quand on en ajoute une', () => {
  const { createJukeboxSettings } = require(path.join(REPO_ROOT, 'app', 'dist', 'jukebox-settings.js')) as {
    createJukeboxSettings(host: unknown): { item: { run(): void } };
  };
  let settings: MenuMediaSettings = { ...DEFAULT_MENU_MEDIA_SETTINGS };
  const opened: (() => BuiltLike)[] = [];
  const s = createJukeboxSettings({
    library: { openCustom: (build: () => BuiltLike) => opened.push(build), openSystem() {} },
    settings: () => settings,
    save: (next: MenuMediaSettings) => (settings = next),
    outputs: () => OUTPUTS,
    menuOutput: () => undefined,
    place: (name: string) => (name === PLAYFIELD ? 'sortie par défaut de Windows' : undefined),
    test() {},
  });
  s.item.run();
  opened.at(-1)!().actions[0]!.run();
  const list = opened.at(-1)!().actions;
  assert.equal(list[0]!.label, PLAYFIELD, 'la sortie par défaut de Windows en tête');
  assert.equal(list[0]!.tone, 'ok', 'active : c’est elle qui joue');
  assert.match(list[0]!.detail!, /^100 % · complet · sortie par défaut de Windows \(Start : régler\)$/);
  assert.ok(list.every((a) => a.icon === undefined || ['restore', 'back'].includes(a.icon)), 'aucune icône répétée sur les sorties');
  // Ajouter le fronton : la sortie par défaut continue de jouer.
  list.find((a) => a.label === FRONTON)!.run();
  opened.at(-1)!().actions[0]!.run();
  assert.deepEqual(
    settings.jukeboxAudio.outputs.filter((o) => o.enabled).map((o) => o.name),
    [PLAYFIELD, FRONTON],
  );
});
