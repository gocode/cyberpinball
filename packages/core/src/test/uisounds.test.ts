// Sons de l'interface (uisounds.ts, app/renderer/ui-sounds.js) et knocker des records :
// rien ne joue quand c'est coupé, à 0 %, en mode attente ou pendant une partie, ni côté
// processus principal (uiSoundCue) ni côté fenêtre (repli de ui-sounds.js) ; chaque son du
// registre a sa recette, son déclencheur et sa ligne dans le manuel ; le knocker suit les
// records lus avant et après la partie (newRecords) ; l'écran « Médias, son et
// attente » revient sur la bonne ligne depuis chacun de ses sous-écrans.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { REPO_ROOT } from './i18n-scan';
import { INTRO_TIMELINE } from '../intro';
import { NOTICE_RULES } from '../notices';
import { UI_SOUND_IDS, UI_SOUNDS, uiSoundCue } from '../uisounds';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings, type MenuMediaSettings } from '../mediaview';
import { playVolume, type MenuMoment } from '../menumoments';

const MOMENTS: MenuMoment[] = ['browse', 'loading', 'game', 'attract'];

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');
const S = DEFAULT_MENU_MEDIA_SETTINGS;

test('réglages : sons joués par défaut à 50 %, valeurs écrites à la main ramenées au défaut', () => {
  assert.equal(S.uiSounds, true);
  assert.equal(S.uiSoundsVolume, 50);
  assert.deepEqual(normalizeMenuMediaSettings({ uiSounds: false, uiSoundsVolume: 30 }), { ...S, uiSounds: false, uiSoundsVolume: 30 });
  const r = normalizeMenuMediaSettings({ uiSounds: 'non', uiSoundsVolume: 150 });
  assert.equal(r.uiSounds, true);
  assert.equal(r.uiSoundsVolume, 50);
  // Fichier d'une version précédente, sans ces réglages.
  assert.equal(normalizeMenuMediaSettings({ music: true }).uiSounds, true);
});

test('rien ne joue quand les sons sont coupés, à 0 %, en mode attente ou pendant une partie', () => {
  const off: MenuMediaSettings = { ...S, uiSounds: false };
  const silent: MenuMediaSettings = { ...S, uiSoundsVolume: 0 };
  for (const id of UI_SOUND_IDS) {
    for (const moment of MOMENTS) {
      assert.equal(uiSoundCue(id, off, moment), undefined, `${id} coupé, ${moment}`);
      assert.equal(uiSoundCue(id, silent, moment), undefined, `${id} à 0 %, ${moment}`);
    }
    const ring = UI_SOUNDS[id].call || UI_SOUNDS[id].notice;
    const relay = { ...(UI_SOUNDS[id].handover ? { handover: true } : {}), ...(ring ? { call: true } : {}) };
    // Pendant la partie : seuls le son du passage de relais (le coup de bobine, quand VPX prend la
    // main), celui d'un appel (le carillon d'une invitation, qui attend une réponse) et ceux des
    // notifications qui se montrent aussi pendant la partie (essai réel du 04/11/2026).
    const allowed = UI_SOUNDS[id].handover || ring;
    assert.deepEqual(uiSoundCue(id, S, 'game'), allowed ? { id, volume: playVolume(50), ...relay } : undefined, `${id} pendant la partie`);
    assert.equal(uiSoundCue(id, S, 'attract'), undefined, `${id} en mode attente`);
    assert.deepEqual(uiSoundCue(id, S, 'browse'), { id, volume: playVolume(50), ...relay });
    // La pièce tombe au Start : le chargement précède l'arrivée de VPX.
    assert.deepEqual(uiSoundCue(id, { ...S, uiSoundsVolume: 80 }, 'loading'), { id, volume: 0.8, ...relay });
  }
  assert.deepEqual(UI_SOUND_IDS.filter((id) => UI_SOUNDS[id].handover), ['coil'], 'un seul son de relais');
  assert.deepEqual(UI_SOUND_IDS.filter((id) => UI_SOUNDS[id].call), ['invite'], 'un seul son d’appel');
  // Un son de notification est celui d'une règle de notification (notices.ts, NoticeRule.sound), et seulement lui.
  const ruled = new Set(Object.values(NOTICE_RULES).flatMap((r) => (r.sound ? [r.sound] : [])));
  assert.deepEqual(UI_SOUND_IDS.filter((id) => UI_SOUNDS[id].notice), [...ruled].sort((a, b) => UI_SOUND_IDS.indexOf(a) - UI_SOUND_IDS.indexOf(b)));
});

test('fenêtre : le carillon d’une invitation sonne pendant la partie, et seulement lui', () => {
  const w = uiSoundsWindow();
  w.api.setPhase('playing');
  w.cue({ id: 'invite', volume: 0.5, call: true });
  assert.equal(w.api.status().enCours, 1, 'le carillon sonne');
  w.api.setPhase('playing');
  assert.equal(w.api.status().enCours, 1, 'un état de la partie renvoyé ne le coupe pas');
  // Un autre son se réclamant d'un appel ne passe pas ; le carillon sans le drapeau non plus.
  w.clock.now += 100;
  w.cue({ id: 'knocker', volume: 0.5, call: true });
  w.cue({ id: 'invite', volume: 0.5 });
  assert.deepEqual(Array.from(w.api.status().joues, (h) => h.son), ['invite']);
  const closed = w.log.closed;
  w.flush();
  assert.equal(w.api.status().enCours, 0);
  assert.ok(w.log.closed > closed, 'contexte audio fermé après le carillon');
});

test('fenêtre : le coup de bobine du relais part au début de la partie et y finit de sonner, seul', () => {
  const w = uiSoundsWindow();
  w.api.setPhase('menu');
  w.cue({ id: 'coin', volume: 0.5 });
  w.api.setPhase('playing');
  assert.equal(w.api.status().enCours, 0);
  // Le relais arrive après l'état de la partie (frontend.ts : onPlaying, puis onForeground).
  w.cue({ id: 'coil', volume: 0.5, handover: true });
  assert.equal(w.api.status().enCours, 1, 'le coup de bobine sonne');
  w.api.setPhase('playing');
  assert.equal(w.api.status().enCours, 1, 'un état de la partie renvoyé ne le coupe pas');
  // Un autre son se réclamant du relais ne passe pas.
  w.clock.now += 100;
  w.cue({ id: 'knocker', volume: 0.5, handover: true });
  w.cue({ id: 'coil', volume: 0.5 });
  assert.deepEqual(Array.from(w.api.status().joues, (h) => h.son), ['coin', 'coil']);
  // Le son fini, plus aucun flux ouvert pendant la partie.
  const closed = w.log.closed;
  w.flush();
  assert.equal(w.api.status().enCours, 0);
  assert.ok(w.log.closed > closed, 'contexte audio fermé');
});

// ---------------------------------------------------------------------------
// Fenêtre : app/renderer/ui-sounds.js, avec un faux WebAudio qui retient ce qui est créé.

interface FakeLog {
  contexts: number;
  closed: number;
  disconnected: number;
  /** Fin programmée de chaque source, relative au début du son. */
  stops: number[];
  starts: number;
  /** Départ programmé de chaque source, relatif à l'horloge du contexte au moment de l'appel. */
  startAt: number[];
  sinks: string[];
}

function fakeAudio(log: FakeLog, audio: { outputLatency?: number; state?: string } = {}) {
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = <T extends object>(extra: T) => ({ connect: (n: unknown) => n, disconnect: () => void log.disconnected++, ...extra });
  return class FakeAudioContext {
    sampleRate = 48000;
    currentTime = 10;
    state = audio.state ?? 'running';
    outputLatency = audio.outputLatency ?? 0;
    destination = node({});
    constructor() {
      log.contexts++;
    }
    createGain() {
      return node({ gain: param() });
    }
    createOscillator() {
      const ctx = this;
      return node({ type: 'sine', frequency: param(), start: (t: number) => void (log.starts++, log.startAt.push(t - ctx.currentTime)), stop: (t: number) => void log.stops.push(t - ctx.currentTime) });
    }
    createBufferSource() {
      const ctx = this;
      return node({ buffer: undefined, start: (t: number) => void (log.starts++, log.startAt.push(t - ctx.currentTime)), stop: (t: number) => void log.stops.push(t - ctx.currentTime) });
    }
    createBiquadFilter() {
      return node({ type: 'lowpass', frequency: param(), Q: param() });
    }
    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    }
    resume() {
      // Une sortie qui se réveille : le contexte tourne une fois la promesse tenue, pas avant.
      return Promise.resolve().then(() => void (this.state = 'running'));
    }
    close() {
      log.closed++;
      return Promise.resolve();
    }
    setSinkId(id: string) {
      log.sinks.push(id);
      return Promise.resolve();
    }
  };
}

function uiSoundsWindow(audio: { outputLatency?: number; state?: string } = {}) {
  const log: FakeLog = { contexts: 0, closed: 0, disconnected: 0, stops: [], starts: 0, startAt: [], sinks: [] };
  let onCue: ((cue: unknown) => void) | undefined;
  const timers: (() => void)[] = [];
  // Horloge figée, avancée par l'essai : l'écart entre deux sons ne dépend pas de la charge du poste.
  const clock = { now: 1_000_000 };
  const window: Record<string, unknown> = { cyber: { onUiSound: (cb: (cue: unknown) => void) => (onCue = cb) } };
  const ctx = vm.createContext({
    window,
    AudioContext: fakeAudio(log, audio),
    Date: { now: () => clock.now },
    Math,
    setTimeout: (fn: () => void) => timers.push(fn),
    clearTimeout() {},
  });
  vm.runInContext(read('app', 'renderer', 'ui-sounds.js'), ctx, { filename: 'ui-sounds.js' });
  const api = window.CyberUiSounds as {
    play(id: string, volume: number, handover?: boolean, call?: boolean, hitAt?: number): boolean;
    setPhase(phase: string): void;
    setSink(id: string): void;
    recipes(): string[];
    status(): { joues: { son: string }[]; muet: boolean; enCours: number };
  };
  return { log, api, clock, cue: (c: unknown) => onCue!(c), flush: () => timers.splice(0).forEach((f) => f()) };
}

test('fenêtre : chaque son du registre a sa recette, et rien de plus', () => {
  const { api } = uiSoundsWindow();
  assert.deepEqual([...api.recipes()].sort(), [...UI_SOUND_IDS].sort());
});

test('fenêtre : pendant la partie, aucun son ne part, et celui qui sonnait se tait', () => {
  const w = uiSoundsWindow();
  w.api.setPhase('menu');
  w.cue({ id: 'solenoid', volume: 0.5 });
  assert.equal(w.log.contexts, 1);
  assert.equal(w.api.status().enCours, 1);

  w.api.setPhase('playing');
  assert.equal(w.api.status().enCours, 0, 'le son en cours est détaché');
  assert.equal(w.log.closed, 1, 'le contexte audio est fermé : aucun flux ouvert pendant la partie');
  for (const id of UI_SOUND_IDS) {
    w.cue({ id, volume: 1 });
    assert.equal(w.api.play(id, 1), false);
  }
  assert.equal(w.log.contexts, 1, 'aucun contexte audio ouvert pendant la partie');
  assert.deepEqual(Array.from(w.api.status().joues, (h) => h.son), ['solenoid']);

  // Retour au menu : les sons reviennent.
  w.api.setPhase('menu');
  assert.equal(w.api.play('knocker', 0.5), true);
});

test('fenêtre : volume nul, son inconnu et rafale du même son ne jouent pas', () => {
  const w = uiSoundsWindow();
  assert.equal(w.api.play('coin', 0), false);
  assert.equal(w.api.play('coup-de-bobine', 1), false);
  assert.equal(w.log.contexts, 0);
  assert.equal(w.api.play('solenoid', 1), true);
  w.clock.now += 44;
  assert.equal(w.api.play('solenoid', 1), false, 'même son dans les 45 ms');
  assert.equal(w.api.play('coin', 1), true, 'un autre son passe');
  w.clock.now += 1;
  assert.equal(w.api.play('solenoid', 1), true, 'même son après 45 ms');
});

test('fenêtre : chaque recette tient dans sa durée et sort sur la sortie du menu', () => {
  for (const id of UI_SOUND_IDS) {
    const w = uiSoundsWindow();
    w.api.setSink('fronton');
    assert.equal(w.api.play(id, 1), true);
    assert.ok(w.log.starts > 0, `${id} : des sources`);
    // Les sources s'arrêtent au plus tard 0,2 s après le début du son plus sa durée (ui-sounds.js libère alors le son).
    // Des bruits brefs, sous 0,8 s ; seul le souffle de l'ouverture tient plus longtemps (3,1 s, joué une fois au démarrage).
    assert.ok(Math.max(...w.log.stops) < (id === 'intro' ? 3.3 : 0.8), `${id} : ${Math.max(...w.log.stops)} s`);
    assert.deepEqual(w.log.sinks, ['fronton']);
    w.flush();
    assert.equal(w.api.status().enCours, 0, `${id} : libéré`);
  }
});

// Essai du 13/11/2026 sur le PinCab : l'accord du souffle sonnait avant l'ignition du plateau.
// Joué à l'arrivée du message, son accent (1,25 s) tombait 1,15 s avant l'éclair (2,4 s).
test('fenêtre : le souffle de l’ouverture, daté, ouvre son accord sur l’ignition du plateau', async () => {
  assert.equal(INTRO_TIMELINE.ignition, 2400);
  assert.equal(INTRO_TIMELINE.backglassPower, INTRO_TIMELINE.ignition, 'le fronton s’allume avec l’ignition');
  // Accent de la recette (HIT.intro) : le dernier départ de source, celui de l'accord.
  const accent = (log: FakeLog) => Math.max(...log.startAt);
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-6, `${what} : ${a} au lieu de ${b}`);

  // Départ des animations à l'instant du message : l'accord 2,4 s plus tard.
  const w = uiSoundsWindow();
  w.cue(uiSoundCue('intro', S, 'browse', w.clock.now + INTRO_TIMELINE.ignition));
  near(accent(w.log), 2.4, 'accord sur l’ignition');
  near(Math.min(...w.log.startAt), 2.4 - 1.25, 'le souffle part avant, avec l’étincelle');
  w.flush();
  assert.equal(w.api.status().enCours, 0, 'libéré à la fin');

  // Message reçu 300 ms après le départ : l'accord reste sur l'ignition.
  const late = uiSoundsWindow();
  late.api.play('intro', 1, false, false, late.clock.now + INTRO_TIMELINE.ignition - 300);
  near(accent(late.log), 2.1, 'message en retard, accord à l’heure');

  // Le retard de la sortie (outputLatency) est retranché : on entend l'accord à l'ignition.
  const lag = uiSoundsWindow({ outputLatency: 0.08 });
  lag.api.play('intro', 1, false, false, lag.clock.now + INTRO_TIMELINE.ignition);
  near(accent(lag.log), 2.4 - 0.08, 'retard de la sortie compensé');

  // Contexte suspendu (sortie qui se réveille) : son horloge n'avance pas, le départ se compte une fois qu'il tourne.
  const sleepy = uiSoundsWindow({ state: 'suspended' });
  sleepy.api.play('intro', 1, false, false, sleepy.clock.now + INTRO_TIMELINE.ignition);
  assert.equal(sleepy.log.starts, 0, 'rien de programmé sur une horloge arrêtée');
  sleepy.clock.now += 500;
  await new Promise((r) => setImmediate(r));
  near(accent(sleepy.log), 1.9, 'compté au réveil de la sortie');

  // Accent déjà passé : pas de son à contretemps.
  const past = uiSoundsWindow();
  assert.equal(past.api.play('intro', 1, false, false, past.clock.now - 1000), false);
  assert.equal(past.log.contexts, 0);

  // Sans date (tout autre son), le son part tout de suite, comme avant.
  const now = uiSoundsWindow();
  now.api.play('intro', 1);
  near(Math.min(...now.log.startAt), 0.01, 'non daté : tout de suite');
  assert.deepEqual(uiSoundCue('coin', S, 'browse'), { id: 'coin', volume: playVolume(50) }, 'pas de date sans hitAt');
});

// ---------------------------------------------------------------------------
// Branchements

test('branchements : le processus principal ne joue un son que par uiSoundCue, au playfield', () => {
  const main = read('app', 'src', 'frontend.ts');
  assert.equal(main.match(/'ui-sound'/g)?.length, 1, 'un seul envoi du canal ui-sound');
  const fn = main.slice(main.indexOf('function playUiSound('), main.indexOf('function moment('));
  assert.match(fn, /uiSoundCue\(id, mediaSettings, moment\(\), hitAt\)/);
  assert.match(fn, /windows\.get\('playfield'\)/);
  // Chaque son du registre a son déclencheur : un appel explicite, ou, pour le son d'une
  // notification, la règle qui le porte (NoticeRule.sound), jouée par menu-notices.ts.
  for (const id of UI_SOUND_IDS.filter((id) => !UI_SOUNDS[id].notice)) assert.match(main, new RegExp(`playUiSound\\('${id}'[,)]`), id);
  // Le souffle de l'ouverture est daté : son accord sur l'ignition, à l'horloge des animations.
  assert.match(main, /playUiSound\('intro', startedAt === undefined \? undefined : startedAt \+ INTRO_TIMELINE\.ignition\)/);
  assert.match(main, /sound: \(id\) => playUiSound\(id\)/, 'les sons des notifications, joués à leur entrée');
  // Fenêtre : la page charge le moteur, l'état lui donne la phase, la sortie du menu lui est passée.
  assert.match(read('app', 'renderer', 'frontend.html'), /<script src="ui-sounds\.js"><\/script>/);
  assert.match(read('app', 'renderer', 'frontend.js'), /CyberUiSounds\?\.setPhase\(s\.phase\)/);
  assert.match(read('app', 'renderer', 'menu-audio.js'), /CyberUiSounds\?\.setSink\?\.\(sinkId\)/);
  assert.match(read('app', 'src', 'preload.ts'), /onUiSound:/);
});

test('registre : source et licence de chaque son, écrites dans le manuel en français et en anglais', () => {
  const fr = read('docs', 'manuel.md');
  const en = read('docs', 'manual.md');
  for (const id of UI_SOUND_IDS) {
    const spec = UI_SOUNDS[id];
    assert.ok(spec.source && spec.license, id);
    assert.ok(fr.includes(`\`${id}\``), `manuel.md cite ${id}`);
    assert.ok(en.includes(`\`${id}\``), `manual.md cite ${id}`);
  }
});

// ---------------------------------------------------------------------------
// Records (highscores.ts, testé par highscores.test.ts) : le knocker suit newRecords

test('knocker : records lus avant la partie et au retour, sonné seulement si un score est entré au tableau', () => {
  const main = read('app', 'src', 'frontend.ts');
  const start = main.indexOf('async function play(');
  // Jusqu'à l'accolade qui ferme la fonction, en début de ligne.
  const play = main.slice(start, start + main.slice(start).search(/\r?\n\}\r?\n/));
  assert.match(play, /let recordsBefore = readTableRecords\(table\);/);
  // Entre amis, relus dans le double une fois fait : réglages de l'hôte et records du groupe y sont déjà.
  assert.match(play, /const played = double\?\.table \?\? table;\s+if \(double\) recordsBefore = double\.records\(\);/);
  // Au retour, lus là où VPX les a écrits : le double d'une partie entre amis (table-double.ts), sinon la table.
  assert.match(play, /const played = double\?\.table \?\? table;/);
  // Le double relit son tableau : VPReg.stg, ou la mémoire de la ROM d'après sa carte (table-double.ts).
  assert.match(play, /const recordsAfter = double \? double\.records\(\) : readTableRecords\(played\);\s+double\?\.finish\(\);/);
  assert.match(play, /const entered = result\.ok \? newRecords\(recordsBefore, recordsAfter\) : \[\];/);
  // Entre amis, seulement le record du groupe battu (la première place d'un tableau qui en avait une).
  assert.match(play, /if \(double \? entered\.some\(\(s\) => s\.rank === 1 && \(hooks\.board\?\.length \?\? 0\) > 0\) : entered\.length\) playUiSound\('knocker'\);/);
  // Lecture d'avant au lancement, avant la partie ; le knocker après le retour au menu (broadcast).
  assert.ok(play.indexOf('recordsBefore = readTableRecords') < play.indexOf('launchVpx('));
  assert.ok(play.lastIndexOf('broadcast();') < play.indexOf("playUiSound('knocker')"));
});

// ---------------------------------------------------------------------------
// Écran « Médias, son et attente » (app/src/menu-settings.ts)

interface BuiltLike {
  heading: string;
  actions: { label: string; detail?: string; icon?: string; run: () => void }[];
  back: () => void;
}

test('réglages du menu : chaque sous-écran revient sur sa propre ligne ; aperçu des sons', () => {
  const { createMenuSettings, MENU_SETTINGS_ROWS, ATTRACT_ROWS } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-settings.js')) as {
    createMenuSettings(host: unknown): { run(): void };
    MENU_SETTINGS_ROWS: readonly string[];
    ATTRACT_ROWS: readonly string[];
  };
  let settings: MenuMediaSettings = { ...S };
  const opened: { build: () => BuiltLike; at: number }[] = [];
  const previews: string[] = [];
  const item = createMenuSettings({
    library: { openCustom: (build: () => BuiltLike, at = 0) => opened.push({ build, at }), openSystem() {} },
    settings: () => settings,
    save: (next: MenuMediaSettings) => (settings = next),
    output: () => undefined,
    preview: (id: string) => previews.push(id),
    wakeDevices: () => [],
    sleepAllowed: () => true,
    intro: { open() {}, summary: () => 'jouée' },
    recording: { quality: () => '4k', setQuality() {} },
  });
  item.run();
  const main = opened[0]!.build;
  assert.equal(main().actions.length, MENU_SETTINGS_ROWS.length + 1, 'une ligne par réglage, plus Retour');
  assert.match(main().actions[MENU_SETTINGS_ROWS.indexOf('uiSounds')]!.label, /Sons de l’interface : joués/);
  // Une icône par ligne (garde-fou de mise en page : « même icône pour deux entrées d'un menu »).
  const icons = main().actions.slice(0, -1).map((a) => a.icon);
  assert.equal(new Set(icons).size, icons.length, icons.join(', '));

  /** Chaque ligne de l'écran `screen` : son sous-écran revient sur elle, par Exit comme par un choix. */
  function eachRowComesBack(screen: () => BuiltLike, rows: readonly string[], skip: readonly string[] = []): void {
    for (let i = 0; i < rows.length; i++) {
      if (skip.includes(rows[i]!)) continue;
      const before = opened.length;
      const snapshot = settings;
      screen().actions[i]!.run();
      if (opened.length === before) {
        settings = snapshot; // réglage basculé sur place : on le remet
        continue;
      }
      const sub = opened.at(-1)!.build();
      sub.back();
      assert.equal(opened.at(-1)!.at, i, `${rows[i]} : Exit revient sur sa ligne`);
      // Un choix aussi revient sur la ligne.
      opened.at(-2)!.build().actions[0]!.run();
      assert.equal(opened.at(-1)!.at, i, `${rows[i]} : un choix revient sur sa ligne`);
      settings = snapshot;
    }
  }
  // « Mode attente » est un écran de réglages à lui seul : Exit y revient, puis chacune de ses lignes revient sur elle-même.
  eachRowComesBack(main, MENU_SETTINGS_ROWS, ['attract']);
  main().actions[MENU_SETTINGS_ROWS.indexOf('attract')]!.run();
  const attract = opened.at(-1)!.build;
  assert.equal(attract().heading, 'Mode attente');
  assert.equal(attract().actions.length, ATTRACT_ROWS.length + 1, 'une ligne par réglage, plus Retour');
  const attractIcons = attract().actions.slice(0, -1).map((a) => a.icon);
  assert.equal(new Set(attractIcons).size, attractIcons.length, attractIcons.join(', '));
  attract().back();
  assert.equal(opened.at(-1)!.at, MENU_SETTINGS_ROWS.indexOf('attract'), 'Mode attente : Exit revient sur sa ligne');
  eachRowComesBack(attract, ATTRACT_ROWS);
  // Crédits de la table montrée : basculés sur place, affichés par défaut.
  assert.match(attract().actions[ATTRACT_ROWS.indexOf('attractCredits')]!.label, /Crédits de la table : affichés/);
  attract().actions[ATTRACT_ROWS.indexOf('attractCredits')]!.run();
  assert.equal(settings.attractCredits, false);
  assert.match(main().actions[MENU_SETTINGS_ROWS.indexOf('attract')]!.detail ?? '', /crédits masqués/);
  settings = { ...S };
  // Basculer les sons fait entendre le clic ; choisir leur volume, la pièce ; rétablir le lancement en cinéma, le coup de bobine.
  assert.ok(previews.includes('solenoid'));
  assert.ok(previews.includes('coin'));
  settings = { ...S, cinema: false };
  main().actions[MENU_SETTINGS_ROWS.indexOf('cinema')]!.run();
  assert.equal(settings.cinema, true);
  assert.equal(previews.at(-1), 'coil');
  assert.match(main().actions[MENU_SETTINGS_ROWS.indexOf('cinema')]!.label, /Lancement en cinéma : joué/);
});
