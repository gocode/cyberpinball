// Moments du menu (T5, T6, T7) : réglages du son et de l'attente, média de chaque écran à
// chaque moment, rôles que VPX occupe pendant la partie, volumes, sortie audio du menu,
// médias de chaque moment résolus sur le disque, minuterie et tirage du mode attente, et
// branchements du rendu.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  ATTRACT_DELAY_CHOICES,
  ATTRACT_SOUND_FACTOR,
  AttractMode,
  attractDelayLabel,
  attractMemory,
  durationLabel,
  VOLUME_CHOICES,
  menuAudioOutput,
  menuSound,
  momentScreen,
  nearestChoice,
  occupiedRoles,
  pickAttractTable,
  playVolume,
  tableMediaVolume,
  volumeLabel,
  type AttractTimers,
} from '../menumoments';
import {
  DEFAULT_MENU_MEDIA_SETTINGS,
  MenuMedias,
  loadMenuMediaSettings,
  mediaPathFromUrl,
  menuMediaSettingsFile,
  normalizeMenuMediaSettings,
  saveMenuMediaSettings,
  type MenuMediaSettings,
} from '../mediaview';
import type { CabinetAudio, ObservedAudioOutput } from '../model';
import type { StackedWindow } from '../screencover';
import { scanTables, type TableEntry } from '../tables';
import { zoneRect } from '../zones';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');
const S = DEFAULT_MENU_MEDIA_SETTINGS;

function sandbox(): { root: string; dataDir: string; tables: TableEntry[] } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-moments-'));
  for (const name of ['Alpha (Williams 1991)', 'Bravo (Bally 1980)']) {
    const folder = path.join(root, 'tables', name);
    fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
    fs.writeFileSync(path.join(folder, `${name}.vpx`), '');
  }
  fs.mkdirSync(path.join(root, 'media'), { recursive: true });
  return { root, dataDir: path.join(root, 'data'), tables: scanTables(path.join(root, 'tables')) };
}

// ---------------------------------------------------------------------------
// Réglages

test('réglages : musique coupée par défaut, médias figés en partie, attente après 5 min, sans son', () => {
  assert.equal(S.music, false);
  assert.equal(S.game, 'still');
  assert.equal(S.videoVolume, 0, 'vidéos du menu muettes par défaut');
  assert.equal(S.attractDelay, 300);
  assert.equal(S.attractSound, 'muted');
  const { dataDir } = sandbox();
  assert.deepEqual(loadMenuMediaSettings(dataDir), S);
  const mine: MenuMediaSettings = { ...S, music: true, musicVolume: 40, attractDelay: 0, attractSound: 'reduced' };
  saveMenuMediaSettings(dataDir, mine);
  assert.deepEqual(loadMenuMediaSettings(dataDir), mine);
});

test('réglages : un ancien medias.json (game seul) garde son choix, le reste prend les défauts', () => {
  const { dataDir } = sandbox();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(menuMediaSettingsFile(dataDir), '{"game":"animated"}');
  assert.deepEqual(loadMenuMediaSettings(dataDir), { ...S, game: 'animated' });
});

test('réglages : valeurs invalides écrites à la main remplacées par les défauts, champ par champ', () => {
  const r = normalizeMenuMediaSettings({ music: 'oui', musicVolume: 150, videoVolume: -5, launchVolume: 33.5, attractDelay: -1, attractInterval: 1, attractSound: 'fort', game: 'animated' });
  assert.deepEqual(r, { ...S, game: 'animated' });
  assert.deepEqual(normalizeMenuMediaSettings(null), S);
  assert.deepEqual(normalizeMenuMediaSettings('texte'), S);
});

test('choix de volume : libellés en clair, valeur écrite à la main ramenée au choix le plus proche', () => {
  assert.equal(volumeLabel(0), '0 % : muet');
  assert.equal(volumeLabel(60), '60 %');
  assert.equal(nearestChoice(VOLUME_CHOICES, 63), 60);
  for (const v of [S.musicVolume, S.videoVolume, S.launchVolume]) assert.ok(VOLUME_CHOICES.includes(v));
});

test('choix de l’attente : libellés en clair, valeur écrite à la main ramenée au choix le plus proche', () => {
  assert.equal(attractDelayLabel(0), 'jamais');
  assert.equal(attractDelayLabel(300), 'après 5 min sans bouton');
  assert.equal(durationLabel(45), '45 s');
  assert.equal(durationLabel(90), '1 min 30 s');
  assert.equal(nearestChoice(ATTRACT_DELAY_CHOICES, 290), 300);
  assert.equal(nearestChoice(ATTRACT_DELAY_CHOICES, 3), 0);
  assert.ok(ATTRACT_DELAY_CHOICES.includes(S.attractDelay));
});

// ---------------------------------------------------------------------------
// Écrans à chaque moment

test('écrans : média du rôle animé en navigation et en attente', () => {
  for (const moment of ['browse', 'attract'] as const) {
    for (const role of ['playfield', 'backglass', 'dmd', 'topper'] as const) {
      assert.deepEqual(momentScreen(moment, role, { game: 'off' }), { media: 'role', play: 'animated' }, `${moment} ${role}`);
    }
  }
});

test('écrans : au chargement, la vidéo Loading sur le playfield, les médias du jeu animés ailleurs', () => {
  assert.deepEqual(momentScreen('loading', 'playfield', { game: 'still' }), { media: 'Loading', play: 'animated' });
  for (const role of ['backglass', 'dmd', 'topper'] as const) {
    assert.deepEqual(momentScreen('loading', role, { game: 'off' }), { media: 'role', play: 'animated' }, role);
  }
});

test('écrans : en partie, écrans libres selon le réglage, playfield et écrans occupés par VPX figés', () => {
  assert.equal(momentScreen('game', 'backglass', { game: 'still' }).play, 'still');
  assert.equal(momentScreen('game', 'topper', { game: 'animated' }).play, 'animated');
  assert.equal(momentScreen('game', 'topper', { game: 'off' }).play, 'off');
  // Sous VPX : jamais animé, quel que soit le réglage.
  assert.equal(momentScreen('game', 'playfield', { game: 'animated' }).play, 'still');
  assert.equal(momentScreen('game', 'backglass', { game: 'animated', occupied: true }).play, 'still');
  assert.equal(momentScreen('game', 'dmd', { game: 'off', occupied: true }).play, 'off');
});

function win(pid: number, x: number, y: number, width: number, height: number, extra: Partial<StackedWindow> = {}): StackedWindow {
  return { pid, className: 'Window', title: '', rect: { x, y, width, height }, minimized: false, ...extra };
}

test('rôles occupés par VPX : fronton du B2S, bande DMD de PinMAME, topper libre', () => {
  const ME = 100;
  const VPX = 200;
  // Fronton 1920 × 1080 à droite du playfield, DMD 4:1 en bas de cet écran, topper au-dessus.
  const backglass = { x: 3840, y: 0, width: 1920, height: 1080 };
  const at = (zone: { x: number; y: number; width: number; height: number }) => {
    const r = zoneRect(zone, backglass);
    return { ...r, x: backglass.x + r.x, y: backglass.y + r.y };
  };
  const zones = [
    { role: 'playfield' as const, rect: { x: 0, y: 0, width: 3840, height: 2160 } },
    { role: 'backglass' as const, rect: at({ x: 0, y: 0, width: 1, height: 0.75 }) },
    { role: 'dmd' as const, rect: at({ x: 0, y: 0.75, width: 1, height: 0.25 }) },
    { role: 'topper' as const, rect: { x: 3840, y: -540, width: 1920, height: 540 } },
  ];
  const stack = [
    win(0, 0, 1040, 3840, 40, { className: 'Shell_TrayWnd' }), // barre des tâches : ignorée
    win(VPX, 0, 0, 3840, 2160, { title: 'Visual Pinball Player' }),
    win(VPX, 3840, 0, 1920, 810, { title: 'B2S Backglass' }),
    win(VPX, 4200, 830, 1200, 240, { title: 'Virtual DMD' }), // couvre 56 % de la bande
    win(VPX, 3840, -540, 300, 200, { title: 'Petite fenêtre' }), // 6 % du topper : libre
    win(VPX, 3840, -540, 1920, 540, { minimized: true }), // réduite : ne compte pas
    win(ME, 0, 0, 3840, 2160),
    win(ME, 3840, 0, 1920, 1080),
    win(ME, 3840, -540, 1920, 540),
  ];
  assert.deepEqual(occupiedRoles(zones, stack, ME).sort(), ['backglass', 'dmd', 'playfield']);
});

test('rôles occupés : notre fenêtre au-dessus de celle de VPX, l’écran reste à nous', () => {
  const zones = [{ role: 'backglass' as const, rect: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.deepEqual(occupiedRoles(zones, [win(1, 0, 0, 1920, 1080), win(2, 0, 0, 1920, 1080)], 1), []);
  assert.deepEqual(occupiedRoles(zones, [win(2, 0, 0, 1920, 1080), win(1, 0, 0, 1920, 1080)], 1), ['backglass']);
  assert.deepEqual(occupiedRoles(zones, [], 1), []);
});

// ---------------------------------------------------------------------------
// Son

test('volumes : réglage × volume relatif du jeu, borné entre 0 et 1', () => {
  assert.equal(playVolume(60), 0.6);
  assert.equal(playVolume(60, 50), 0.3);
  assert.equal(playVolume(80, 200), 1, 'un jeu enregistré trop bas ne dépasse pas le maximum');
  assert.equal(playVolume(60, 0), 0);
  assert.equal(playVolume(-10), 0);
});

test('volume relatif : lu dans CyberPinball.medias.volume du .info, 100 % sans réglage', () => {
  const table = (info: unknown) => ({ info }) as Pick<TableEntry, 'info'>;
  assert.equal(tableMediaVolume(table({})), 100);
  assert.equal(tableMediaVolume(table({ CyberPinball: { medias: { volume: 50 } } })), 50);
  assert.equal(tableMediaVolume(table({ CyberPinball: { medias: { volume: 'fort' } } })), 100);
  assert.equal(tableMediaVolume(undefined), 100);
});

test('son en navigation : borne silencieuse par défaut, la musique du jeu seulement si elle est activée', () => {
  const sources = { music: 'cyber-media://fichier/a.mp3', launch: 'cyber-media://fichier/b.ogg' };
  assert.deepEqual(menuSound('browse', S, sources), { video: 0 });
  const on = { ...S, music: true, musicVolume: 50, videoVolume: 40 };
  assert.deepEqual(menuSound('browse', on, sources, 80), { music: { url: sources.music, volume: 0.4 }, video: 0 }, 'musique au volume du jeu, vidéo muette');
  // Jeu sans musique : le son de la vidéo du plateau, à son réglage.
  assert.deepEqual(menuSound('browse', on, {}, 100), { video: 0.4 });
  // Musique activée à 0 % : rien ne joue, la vidéo reste muette.
  assert.deepEqual(menuSound('browse', { ...on, musicVolume: 0 }, sources), { video: 0 });
});

test('son au chargement : le son de lancement, sinon celui de la vidéo de chargement ; rien en partie', () => {
  const launch = 'cyber-media://fichier/b.ogg';
  assert.deepEqual(menuSound('loading', S, { launch, music: 'm' }), { launch: { url: launch, volume: 0.8 }, video: 0 });
  assert.deepEqual(menuSound('loading', S, {}, 50), { video: 0.4 });
  assert.deepEqual(menuSound('loading', { ...S, launchVolume: 0 }, { launch }), { video: 0 });
  assert.deepEqual(menuSound('game', { ...S, music: true, videoVolume: 100 }, { launch, music: 'm' }), { video: 0 });
});

test('son en attente : coupé par défaut, ou réduit', () => {
  const on = { ...S, music: true, musicVolume: 100 };
  assert.deepEqual(menuSound('attract', on, { music: 'm' }), { video: 0 });
  assert.deepEqual(menuSound('attract', { ...on, attractSound: 'reduced' }, { music: 'm' }), { music: { url: 'm', volume: ATTRACT_SOUND_FACTOR }, video: 0 });
  assert.deepEqual(menuSound('attract', { ...S, videoVolume: 50, attractSound: 'reduced' }, {}), { video: 0.15 });
});

test('sortie du menu : celle du fronton (musique de VPX), sinon celle du plateau, sinon la sortie par défaut', () => {
  const seen = (friendlyName: string) => ({ friendlyName }) as ObservedAudioOutput;
  const audio: CabinetAudio = {
    outputs: [
      { endpointId: '{0.0.0.00000000}.{AAA}', label: 'Haut-parleurs (Realtek)', lastSeen: seen('Haut-parleurs (Realtek(R) Audio)') },
      { endpointId: '{0.0.0.00000000}.{BBB}', label: 'Haut-parleurs (USB Audio Device)' },
    ],
    roles: { backglass: '{0.0.0.00000000}.{aaa}', playfield: '{0.0.0.00000000}.{BBB}' },
    playfieldMode: 'stereo',
  };
  assert.deepEqual(menuAudioOutput({ audio }), { role: 'backglass', friendlyName: 'Haut-parleurs (Realtek(R) Audio)' });
  assert.deepEqual(menuAudioOutput({ audio: { ...audio, roles: { playfield: audio.roles.playfield } } }), { role: 'playfield', friendlyName: 'Haut-parleurs (USB Audio Device)' });
  assert.equal(menuAudioOutput({ audio: { ...audio, roles: {} } }), undefined);
  assert.equal(menuAudioOutput({}), undefined);
  assert.equal(menuAudioOutput(undefined), undefined);
});

// ---------------------------------------------------------------------------
// Médias de chaque moment, résolus sur le disque

test('médias par moment : vidéo de chargement, musique et son de lancement du jeu, défauts de la borne', () => {
  const b = sandbox();
  const [alpha, bravo] = b.tables;
  const dir = path.join(alpha!.folder, 'medias');
  fs.writeFileSync(path.join(dir, '(Loading) Alpha (Williams 1991).mp4'), 'vidéo');
  fs.writeFileSync(path.join(dir, '(Audio) Alpha (Williams 1991).ogg'), 'musique');
  fs.writeFileSync(path.join(dir, '(AudioLaunch) Alpha (Williams 1991).wav'), 'son');
  fs.writeFileSync(path.join(b.root, 'media', '(Audio).mp3'), 'musique de la borne');
  const m = new MenuMedias({ root: b.root, dataDir: b.dataDir, rotation: 90, b2s: false });

  const loading = m.typeMedia(alpha!, 'playfield', 'Loading');
  assert.equal(loading.type, 'Loading');
  assert.equal(loading.kind, 'video');
  assert.equal(loading.fit, 'cover');
  assert.equal(path.basename(mediaPathFromUrl(loading.url!)!), '(Loading) Alpha (Williams 1991).mp4');
  assert.deepEqual(loading.orient, { edge: 'left', halfTurn: false }, 'tournée par le rendu d’après le bord des flippers');
  // Sans vidéo de chargement : l'écran de chargement de secours.
  const none = m.typeMedia(bravo!, 'playfield', 'Loading');
  assert.equal(none.url, undefined);
  assert.equal(none.fallback, 'loading-screen');

  assert.equal(path.basename(mediaPathFromUrl(m.sound(alpha!, 'Audio')!)!), '(Audio) Alpha (Williams 1991).ogg');
  assert.equal(path.basename(mediaPathFromUrl(m.sound(alpha!, 'AudioLaunch')!)!), '(AudioLaunch) Alpha (Williams 1991).wav');
  // Bravo n'a pas de musique : celle de la borne ; pas de son de lancement : rien.
  assert.equal(path.basename(mediaPathFromUrl(m.sound(bravo!, 'Audio')!)!), '(Audio).mp3');
  assert.equal(m.sound(bravo!, 'AudioLaunch'), undefined);
  // Le protocole sert ces fichiers.
  for (const url of [loading.url!, m.sound(alpha!, 'Audio')!, m.sound(alpha!, 'AudioLaunch')!, m.sound(bravo!, 'Audio')!]) {
    assert.ok(m.allowedDirs(b.tables).some((d) => path.dirname(mediaPathFromUrl(url)!).toLowerCase() === path.resolve(d).toLowerCase()), url);
  }
  // Un rôle et un type ne se confondent pas dans la mémoire des résultats.
  assert.equal(m.roleMedia(alpha!, 'playfield').type, 'Playfield');
});

// ---------------------------------------------------------------------------
// Mode attente

/** Horloge factice : les minuteries se déclenchent à la main. */
function fakeTimers(): AttractTimers & { advance(ms: number): void; pending(): number } {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    set: (fn, ms) => {
      timers.set(++id, { at: now + ms, fn });
      return id;
    },
    clear: (h) => void timers.delete(h as number),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

function attract(delay: number, interval = 20_000) {
  const timers = fakeTimers();
  const events: string[] = [];
  let delayMs = delay;
  const mode = new AttractMode({ delayMs: () => delayMs, intervalMs: () => interval, onEnter: () => events.push('entrée'), onNext: () => events.push('suivante'), timers });
  return { timers, events, mode, setDelay: (ms: number) => (delayMs = ms) };
}

test('attente : commence après le délai sans bouton, puis une table toutes les N secondes', () => {
  const { timers, events, mode } = attract(300_000);
  mode.allow(true);
  timers.advance(299_000);
  assert.deepEqual(events, []);
  timers.advance(1000);
  assert.deepEqual(events, ['entrée']);
  assert.equal(mode.active, true);
  timers.advance(60_000);
  assert.deepEqual(events, ['entrée', 'suivante', 'suivante', 'suivante']);
});

test('attente : chaque bouton remet le compte à zéro ; le premier bouton en attente y met fin et ne fait rien d’autre', () => {
  const { timers, events, mode } = attract(60_000);
  mode.allow(true);
  timers.advance(50_000);
  assert.equal(mode.activity(), false, 'hors attente : le bouton fait son effet habituel');
  timers.advance(50_000);
  assert.deepEqual(events, [], 'le compte est reparti du bouton');
  timers.advance(10_000);
  assert.deepEqual(events, ['entrée']);
  assert.equal(mode.activity(), true, 'en attente : le bouton est mangé');
  assert.equal(mode.active, false);
  timers.advance(59_000);
  assert.deepEqual(events, ['entrée']);
  timers.advance(1000);
  assert.deepEqual(events, ['entrée', 'entrée']);
});

test('attente : 0 = jamais ; jamais hors du menu des tables (fiche, aide, message, partie)', () => {
  const never = attract(0);
  never.mode.allow(true);
  never.timers.advance(24 * 3600_000);
  assert.deepEqual(never.events, []);
  assert.equal(never.timers.pending(), 0);

  const { timers, events, mode } = attract(60_000);
  mode.allow(true);
  timers.advance(30_000);
  mode.allow(false); // la fiche s'ouvre
  timers.advance(10 * 60_000);
  assert.deepEqual(events, []);
  mode.allow(true); // retour au menu : le compte repart de zéro
  timers.advance(59_000);
  assert.deepEqual(events, []);
  timers.advance(1000);
  assert.deepEqual(events, ['entrée']);
  // Une partie lancée (ou un message) pendant l'attente l'arrête.
  mode.allow(false);
  assert.equal(mode.active, false);
  timers.advance(60_000);
  assert.deepEqual(events, ['entrée']);
});

test('attente : délai changé dans les réglages, pris en compte aussitôt', () => {
  const { timers, events, mode, setDelay } = attract(600_000);
  mode.allow(true);
  timers.advance(100_000);
  setDelay(120_000);
  mode.reschedule();
  timers.advance(20_000);
  assert.deepEqual(events, ['entrée'], 'déjà 120 s sans bouton');
  mode.activity();
  setDelay(0);
  mode.reschedule();
  timers.advance(3600_000);
  assert.deepEqual(events, ['entrée']);
  mode.dispose();
  assert.equal(timers.pending(), 0);
});

test('tirage : jamais la table choisie ni les dernières montrées, toutes finissent par passer', () => {
  assert.equal(pickAttractTable(1, [0]), 0);
  assert.equal(pickAttractTable(0, []), 0);
  // Deux tables : l'autre.
  for (let k = 0; k < 20; k++) assert.equal(pickAttractTable(2, [0], Math.random), 1);
  // Toutes récentes : seule la dernière montrée est évitée.
  for (let k = 0; k < 20; k++) assert.notEqual(pickAttractTable(3, [0, 1, 2], Math.random), 2);
  // Hasard rejoué : bornes du tirage.
  assert.equal(pickAttractTable(10, [], () => 0), 0);
  assert.equal(pickAttractTable(10, [], () => 0.999999), 9);
  assert.equal(pickAttractTable(10, [9], () => 0.999999), 8);
  // Sur une longue attente, avec la mémoire d'un tiers des tables, chacune passe, sans répétition immédiate.
  const count = 9;
  const seen = new Set<number>();
  const recent = [4];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 200; k++) {
    const pick = pickAttractTable(count, recent, random);
    assert.ok(!recent.includes(pick), `tirage ${k} : ${pick} déjà parmi ${recent}`);
    seen.add(pick);
    recent.push(pick);
    while (recent.length > attractMemory(count)) recent.shift();
  }
  assert.equal(seen.size, count);
  assert.equal(attractMemory(2), 1);
  assert.equal(attractMemory(30), 10);
});

// ---------------------------------------------------------------------------
// Branchements du rendu

test('rendu : son du menu chargé par les fenêtres du menu', () => {
  const html = fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8');
  const at = (name: string) => html.indexOf(name);
  assert.ok(at('menu-audio.js') > 0 && at('menu-audio.js') < at('frontend.js'), 'menu-audio.js chargé avant frontend.js');
  const frontend = fs.readFileSync(path.join(APP, 'src', 'frontend.ts'), 'utf8');
  // La musique démarre sans geste du joueur : les boutons passent par le processus principal.
  assert.match(frontend, /autoplayPolicy: 'no-user-gesture-required'/);
  // Nom des sorties audio et setSinkId : permissions « media » et « speaker-selection ».
  assert.match(frontend, /setPermissionCheckHandler\(.*speaker-selection/);
  const audio = fs.readFileSync(path.join(APP, 'renderer', 'menu-audio.js'), 'utf8');
  assert.match(audio, /setSinkId/);
});

test('un seul son : la musique du menu se tait pendant l’écoute d’une carte (propositions, sons de la table)', () => {
  const frontend = fs.readFileSync(path.join(APP, 'src', 'frontend.ts'), 'utf8');
  // Le plan sonore ne prend la table de l'écran que si celui-ci ne fait rien écouter.
  assert.match(frontend, /const table = state\.phase === 'library' && library\.previewsSound\(\) \? undefined : screensSubject\(\);/);
  const library = fs.readFileSync(path.join(APP, 'src', 'library.ts'), 'utf8');
  // Relevé à chaque vue, avant que soundView() ne le lise (viewFor : library puis sound).
  assert.match(library, /soundPreview = playsSoundPreview\(built\.media\);/);
  const medias = fs.readFileSync(path.join(APP, 'src', 'library-medias.ts'), 'utf8');
  assert.match(medias, /c\.action !== undefined && c\.thumb\.kind === 'audio' && !!c\.thumb\.url/);
  // Le rendu joue le son de la carte choisie, celle qui a une action (library.js).
  const renderer = fs.readFileSync(path.join(APP, 'renderer', 'library.js'), 'utf8');
  assert.match(renderer, /renderThumb\(c\.thumb, c\.action === cursor\)/);
  const order = frontend.indexOf("library: state.phase === 'library' ? library.view() : undefined");
  assert.ok(order > 0 && order < frontend.indexOf("sound: role === 'playfield' ? soundView() : undefined"), 'vue de la bibliothèque construite avant le son');
});

test('partie simulée : hors écran seulement ; à l’écran, VPX ; hors écran sans elle, la partie reste refusée', () => {
  const frontend = fs.readFileSync(path.join(APP, 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /const simulated = OFFSCREEN \? process\.env\.CYBERPINBALL_PARTIE_SIMULEE : undefined;/);
  assert.match(frontend, /simulated === undefined \? refuseOffscreen\(t\('Lancer une partie de VPX'\)\)/);
  // Le fond de partie n'arrive qu'avec la fenêtre de jeu : au chargement, les écrans gardent les médias du jeu.
  assert.match(frontend, /playing && state\.phase === 'playing'/);
  const renderer = fs.readFileSync(path.join(APP, 'renderer', 'frontend.js'), 'utf8');
  assert.match(renderer, /if \(s\.game\) return renderGame\(s\);/);
});

test('feuilles du menu : une classe n’est définie que dans une feuille (sauf états partagés)', () => {
  // frontend.html charge frontend.css, library.css et fallback.css ensemble : une même classe
  // définie dans deux feuilles se mélange en silence (.keys-grid du clavier à l'écran, vu au
  // chargement d'une table). Seuls les états (current, selected, mouse) sont partagés, et
  // frontend.css peut ajuster un composant de fallback.js dans son conteneur (cp-*).
  const classes = (name: string) => {
    const css = fs.readFileSync(path.join(APP, 'renderer', name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const found = new Set<string>();
    for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
      if (selector!.trim().startsWith('@')) continue;
      for (const [, c] of selector!.matchAll(/\.([A-Za-z_][\w-]*)/g)) found.add(c!);
    }
    return found;
  };
  const html = fs.readFileSync(path.join(APP, 'renderer', 'frontend.html'), 'utf8');
  const sheets = [...html.matchAll(/href="([\w-]+\.css)"/g)].map((m) => m[1]!);
  // theme.css (jetons du design system, police) est chargée avant les autres par chaque page.
  assert.deepEqual(sheets.sort(), ['fallback.css', 'frontend.css', 'library.css', 'theme.css']);
  const shared = new Set(['current', 'selected', 'mouse']);
  const seen = new Map<string, string>();
  const clashes: string[] = [];
  for (const sheet of sheets) {
    for (const c of classes(sheet)) {
      const other = seen.get(c);
      if (other && !shared.has(c) && !(c.startsWith('cp-') && [other, sheet].includes('fallback.css'))) clashes.push(`.${c} : ${other} et ${sheet}`);
      seen.set(c, other ?? sheet);
    }
  }
  assert.deepEqual(clashes, []);
  // Une classe d'état posée sur <html> par le rendu (in-game, attract-mode…) n'est jamais aussi
  // celle d'un composant : <html> prendrait sa mise en page (mode attente devenu invisible).
  const renderer = ['frontend.js', 'media.js', 'menu-audio.js', 'library.js'].map((f) => fs.readFileSync(path.join(APP, 'renderer', f), 'utf8')).join('\n');
  const states = [...renderer.matchAll(/documentElement\.classList\.(?:toggle|add)\('([\w-]+)'/g)].map((m) => m[1]!);
  assert.ok(states.includes('attract-mode') && states.includes('in-game'));
  const misused: string[] = [];
  for (const sheet of sheets) {
    const css = fs.readFileSync(path.join(APP, 'renderer', sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const state of states) {
      for (const m of css.matchAll(new RegExp(`\.${state}(?![\w-])`, 'g'))) {
        if (!/html(:not\()?$/.test(css.slice(Math.max(0, m.index! - 10), m.index))) misused.push(`${sheet} : .${state} hors de html.${state}`);
      }
    }
    for (const state of states) if (new RegExp(`['"\`]${state}['"\`]`).test(renderer.replace(/documentElement\.classList\.\w+\('[\w-]+'/g, ''))) misused.push(`rendu : '${state}' aussi utilisé comme classe d'élément`);
  }
  assert.deepEqual([...new Set(misused)], []);
});

test('essais hors écran : toute fenêtre de l’application est muette', () => {
  const offscreen = fs.readFileSync(path.join(APP, 'src', 'offscreen.ts'), 'utf8');
  const create = offscreen.slice(offscreen.indexOf('export function createWindow'), offscreen.indexOf('function keepOffscreen'));
  assert.match(create, /setAudioMuted\(true\)/);
  // Le rendu ne rétablit jamais le son de la fenêtre.
  for (const dir of [path.join(APP, 'src'), path.join(APP, 'renderer')]) {
    for (const name of fs.readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
      assert.doesNotMatch(fs.readFileSync(path.join(dir, name), 'utf8'), /setAudioMuted\(false\)/, name);
    }
  }
});
