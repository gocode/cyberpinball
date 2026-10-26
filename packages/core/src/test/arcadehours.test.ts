import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  ArcadeHours,
  DEFAULT_ARCADE_HOURS,
  STOP_NOTICE_MS,
  STOP_WINDOW_OUTSIDE_MS,
  arcadeHoursClock,
  arcadeHoursSummary,
  hourLabel,
  inDailyRange,
  isNight,
  minuteOfDay,
  nextOccurrence,
  normalizeArcadeHours,
  parseWakeDevices,
  stopInNight,
  stopWindow,
  type ArcadeHoursSettings,
  type StopNotice,
} from '../arcadehours';
import { GUEST_DOORS } from '../guestmode';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import { createPowerControl, powerExecutor, type PowerClock, type PowerOutcome } from '../power';
import { SYSTEM_GROUPS } from '../systemmenu';
import { menuRenderer, menuState } from './menu-renderer';

// Horaire de la borne, façon salle d'arcade : la nuit traverse minuit, l'arrêt attend la borne
// libre et s'annonce 30 s avant, le moindre bouton rend la main, et un essai n'éteint ni ne met
// jamais en veille le poste qui le fait tourner.
const REPO = path.join(__dirname, '..', '..', '..', '..');
const H = 3600_000;
const M = 60_000;
/** Instant local : le 26 octobre 2026 (lendemain du changement d'heure), décalé de `day` jours. */
const local = (hour: number, minute = 0, day = 0) => new Date(2026, 9, 26 + day, hour, minute).getTime();
const ON: ArcadeHoursSettings = { ...DEFAULT_ARCADE_HOURS, on: true };

test('réglages : horaire désactivé par défaut (nuit 23 h–8 h, veille à 2 h, voile à 70 %) ; valeurs écrites à la main ramenées au défaut', () => {
  assert.deepEqual(DEFAULT_ARCADE_HOURS, { on: false, nightFrom: 23 * 60, nightTo: 8 * 60, nightDim: 70, stopAt: 2 * 60, stopBy: 'sleep' });
  assert.deepEqual(DEFAULT_MENU_MEDIA_SETTINGS.hours, DEFAULT_ARCADE_HOURS);
  assert.deepEqual(normalizeMenuMediaSettings({}).hours, DEFAULT_ARCADE_HOURS, 'medias.json d’une version précédente');
  assert.deepEqual(normalizeArcadeHours({ on: 'oui', nightFrom: 1440, nightTo: -1, nightDim: 120, stopAt: 2.5, stopBy: 'restart' }), DEFAULT_ARCADE_HOURS);
  // « Jamais » se garde (null), une heure à la minute aussi.
  assert.deepEqual(normalizeArcadeHours({ on: true, stopAt: null, nightTo: 6 * 60 + 30, stopBy: 'shutdown' }), { ...ON, stopAt: null, nightTo: 390, stopBy: 'shutdown' });
  assert.equal(hourLabel(120), '2 h');
  assert.equal(hourLabel(390), '6 h 30');
  assert.equal(arcadeHoursSummary(DEFAULT_ARCADE_HOURS), 'désactivé');
  assert.equal(arcadeHoursSummary(ON), 'nuit 23 h–8 h · veille à 2 h');
  assert.equal(arcadeHoursSummary({ ...ON, stopBy: 'shutdown' }), 'nuit 23 h–8 h · extinction à 2 h');
  assert.equal(arcadeHoursSummary({ ...ON, stopAt: null }), 'nuit 23 h–8 h · sans arrêt automatique');
});

test('nuit : l’horaire traverse minuit ; une plage du jour aussi ; début = fin, pas de nuit ; jamais quand l’horaire est désactivé', () => {
  const night = (h: number, m = 0, s = ON) => isNight(local(h, m), s);
  assert.deepEqual([night(22, 59), night(23), night(0, 30), night(2), night(7, 59), night(8), night(12)], [false, true, true, true, true, false, false]);
  const day = { ...ON, nightFrom: 60, nightTo: 6 * 60 };
  assert.deepEqual([night(0, 59, day), night(1, 0, day), night(5, 59, day), night(6, 0, day)], [false, true, true, false]);
  assert.equal(inDailyRange(120, 300, 300), false);
  assert.equal(night(23, 30, DEFAULT_ARCADE_HOURS), false);
  // L'heure d'arrêt dans la nuit, ou signalée hors de la nuit.
  assert.equal(stopInNight(ON), true);
  assert.equal(stopInNight({ ...ON, stopAt: 22 * 60 }), false);
  assert.equal(stopInNight({ ...ON, stopAt: null }), true);
});

test('fenêtre d’arrêt : de l’heure d’arrêt à la fin de la nuit, à cheval sur minuit ; en cours, tout de suite ; une heure hors de la nuit', () => {
  // La veille au soir : 2 h le lendemain, jusqu'à 8 h.
  assert.deepEqual(stopWindow(local(21), ON), { action: 'sleep', at: local(2, 0, 1), until: local(8, 0, 1) });
  // Juste avant minuit, juste après : la même fenêtre.
  assert.deepEqual(stopWindow(local(23, 59), ON), { action: 'sleep', at: local(2, 0, 1), until: local(8, 0, 1) });
  assert.deepEqual(stopWindow(local(0, 1, 1), ON), { action: 'sleep', at: local(2, 0, 1), until: local(8, 0, 1) });
  // Dans la fenêtre (réveil à 3 h, démarrage à 5 h) : maintenant, jusqu'à 8 h.
  assert.deepEqual(stopWindow(local(3, 10), ON), { action: 'sleep', at: local(3, 10), until: local(8) });
  // Fenêtre passée : la nuit suivante.
  assert.deepEqual(stopWindow(local(8), ON), { action: 'sleep', at: local(2, 0, 1), until: local(8, 0, 1) });
  assert.equal(stopWindow(local(21), { ...ON, stopAt: null }), undefined);
  assert.equal(stopWindow(local(21), DEFAULT_ARCADE_HOURS), undefined, 'horaire désactivé : jamais d’arrêt');
  // Arrêt hors de la nuit (à la fin de la nuit, ou avant son début) : une heure, pas une journée entière d'arrêts.
  assert.deepEqual(stopWindow(local(9), { ...ON, stopAt: 8 * 60 }), { action: 'sleep', at: local(8, 0, 1), until: local(8, 0, 1) + STOP_WINDOW_OUTSIDE_MS });
  assert.deepEqual(stopWindow(local(8, 30), { ...ON, stopAt: 8 * 60 }), { action: 'sleep', at: local(8, 30), until: local(9) });
  assert.deepEqual(stopWindow(local(21), { ...ON, stopAt: 22 * 60 }), { action: 'sleep', at: local(22), until: local(23) });
  // Changement d'heure : 2 h reste 2 h à l'horloge du mur.
  for (let day = -3; day < 3; day++) assert.equal(minuteOfDay(nextOccurrence(local(12, 0, day), 120)), 120);
});

/** Horloge d'essai : le temps n'avance que par advance() ; `jump` : il passe sans que les minuteries tournent (veille). */
function fakeClock(start: number) {
  let now = start;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  const clock: PowerClock = {
    now: () => now,
    setTimeout: (run, ms) => (timers.set(next, { at: now + ms, run }), next++),
    clearTimeout: (handle) => void timers.delete(handle as number),
  };
  const advance = (ms: number, jump = false) => {
    const end = now + ms;
    if (jump) {
      now = end;
      for (const timer of timers.values()) timer.at = Math.max(timer.at, now);
    }
    for (;;) {
      const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].run();
    }
    now = end;
  };
  return { clock, advance };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Un horaire en marche, comme frontend.ts le monte : le module d'alimentation de l'essai
 * (l'exécuteur réel n'est jamais construit sous node --test), une borne libre ou non.
 */
function cabinet(start: number, settings: ArcadeHoursSettings = ON) {
  const time = fakeClock(start);
  const log: string[] = [];
  const notices: (StopNotice | undefined)[] = [];
  const done: PowerOutcome[] = [];
  let changes = 0;
  let free = true;
  const executor = powerExecutor(process.env, () => assert.fail('exécuteur réel construit en essai'), (line) => log.push(line));
  const control = createPowerControl({ executor, prepare: () => void log.push('écran noir, réglages enregistrés'), clock: time.clock });
  const hours = new ArcadeHours({
    control,
    settings: () => settings,
    idle: () => free,
    notice: (n) => notices.push(n),
    changed: () => changes++,
    // Comme au menu : après l'arrêt (réveil, essai), le menu revient et l'attente recompte son délai.
    done: (_action, outcome) => {
      done.push(outcome);
      free = false;
    },
    log: () => undefined,
    clock: time.clock,
  });
  hours.start();
  return {
    hours,
    time,
    log,
    notices,
    done,
    changes: () => changes,
    setFree: (on: boolean) => (free = on),
    set: (next: ArcadeHoursSettings) => {
      settings = next;
      hours.update();
    },
    /** Avance par pas d'une seconde, les promesses de l'action résolues entre deux. */
    run: async (ms: number) => {
      for (let t = 0; t < ms; t += 1000) {
        time.advance(Math.min(1000, ms - t));
        await flush();
      }
    },
  };
}

test('nuit à cheval sur minuit, borne libre : préavis de 30 s à 2 h, puis la veille simulée ; rien de réel', async () => {
  const c = cabinet(local(22, 50));
  assert.equal(c.hours.night(), false);
  await c.run(15 * M);
  assert.equal(c.hours.night(), true, '23 h : la nuit');
  assert.equal(c.changes(), 1, 'la nuit commence : les écrans se voilent');
  // Minuit passe sans rien faire ; 2 h moins une seconde, toujours rien.
  c.time.advance(local(2, 0, 1) - local(23, 5) - 1000);
  await flush();
  assert.deepEqual([c.notices, c.log], [[], []]);
  await c.run(1000);
  assert.deepEqual(c.notices, [{ action: 'sleep', endsAt: local(2, 0, 1) + STOP_NOTICE_MS }], '2 h : le préavis');
  await c.run(STOP_NOTICE_MS - 1000);
  assert.deepEqual(c.log, [], 'pendant le préavis, rien');
  await c.run(1000);
  await c.run(3000);
  assert.deepEqual(c.notices.at(-1), undefined, 'le préavis laisse la place à l’écran noir');
  assert.deepEqual(c.log, ['écran noir, réglages enregistrés', 'Alimentation simulée : powrprof SetSuspendState(FALSE, FALSE, FALSE)']);
  assert.deepEqual(c.done, [{ ok: true, simulated: true }]);
  // La nuit n'est pas finie : réarmé tout de suite, il attend que la borne redevienne libre.
  assert.ok(c.hours.scheduled, 'réarmé');
  assert.ok(c.hours.scheduled!.at <= local(2, 1, 1) && c.hours.scheduled!.at >= local(2, 0, 1));
  c.hours.dispose();
});

test('le moindre bouton retire le préavis : la borne reste allumée, puis s’arrête la prochaine fois qu’elle est libre', async () => {
  const c = cabinet(local(1, 59, 1));
  await c.run(70_000);
  assert.ok(c.hours.notice, 'préavis');
  // Un bouton : retiré tout de suite, et le bouton n'a pas d'autre effet.
  c.setFree(false);
  assert.equal(c.hours.activity(), true);
  assert.equal(c.hours.notice, undefined);
  assert.equal(c.notices.at(-1), undefined);
  assert.equal(c.hours.activity(), false, 'plus de préavis : un bouton ordinaire');
  // Une partie jusqu'à 2 h 40 : rien.
  c.time.advance(40 * M);
  await flush();
  assert.deepEqual(c.log, []);
  // Borne de nouveau libre (attente) : un nouveau préavis complet, puis l'arrêt.
  c.setFree(true);
  await c.run(2000);
  const second = c.notices.at(-1)!;
  assert.equal(second.endsAt - local(2, 41, 1) <= STOP_NOTICE_MS, true);
  await c.run(STOP_NOTICE_MS + 3000);
  assert.equal((c.log as string[]).filter((l) => l.startsWith('Alimentation simulée')).length, 1);
  c.hours.dispose();
});

test('partie jusqu’au matin : l’arrêt n’est pas fait après la fin de la nuit, réarmé pour la nuit suivante', async () => {
  const c = cabinet(local(1, 0, 1));
  c.setFree(false);
  c.time.advance(7 * H + 30 * M);
  await flush();
  c.setFree(true);
  await c.run(5 * M);
  assert.deepEqual([c.notices, c.log], [[], []], 'à 8 h 35, la borne libre ne s’arrête pas');
  assert.equal(c.hours.scheduled?.at, local(2, 0, 2), 'prochaine fois : 2 h la nuit suivante');
  c.hours.dispose();
});

test('borne en veille ou éteinte pendant la fenêtre : manqué, rien au réveil ; réglages changés : reprogrammé', async () => {
  const c = cabinet(local(1, 0, 1));
  // Veille de 1 h à 9 h : les minuteries ne tournent pas.
  c.time.advance(8 * H, true);
  await flush();
  assert.deepEqual(c.log, []);
  assert.equal(c.hours.scheduled?.at, local(2, 0, 2));
  // Extinction à 3 h : reprogrammé ; désactivé : plus rien de prévu.
  c.set({ ...ON, stopAt: 3 * 60, stopBy: 'shutdown' });
  assert.deepEqual([c.hours.scheduled?.action, c.hours.scheduled?.at], ['shutdown', local(3, 0, 2)]);
  c.set({ ...ON, on: false });
  assert.equal(c.hours.scheduled, undefined);
  c.hours.dispose();
});

test('essais : jamais de vraie extinction ni de vraie veille ; l’horloge décalée n’existe qu’en essai', () => {
  // L'horaire de l'application passe par le module d'alimentation du menu (powerExecutor : simulé en essai).
  const frontend = fs.readFileSync(path.join(REPO, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /new ArcadeHours\(\{\s*control: power\.control,/);
  assert.match(frontend, /const hoursClock = arcadeHoursClock\(process\.env, powerSimulated\(process\.env\)\);/);
  assert.match(frontend, /createPowerMenu\(\{\s*library,\s*clock: hoursClock,/);
  // Personne d'autre ne construit une commande d'alimentation dans l'application.
  for (const file of fs.readdirSync(path.join(REPO, 'app', 'src')).filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(REPO, 'app', 'src', file), 'utf8');
    if (file !== 'power.ts') assert.doesNotMatch(text, /createPowerControl\(/, file);
  }
  const base: PowerClock = { now: () => 1_000_000, setTimeout: () => 0, clearTimeout: () => undefined };
  const wanted = '2026-10-27T01:59:20';
  assert.equal(arcadeHoursClock({ CYBERPINBALL_HORLOGE: wanted }, false, base).now(), 1_000_000, 'hors essai, l’horloge du PC');
  assert.equal(arcadeHoursClock({ CYBERPINBALL_HORLOGE: wanted }, true, base).now(), Date.parse(wanted));
  assert.equal(arcadeHoursClock({}, true, base).now(), 1_000_000);
});

test('réveil par un bouton : boutons, claviers et souris autorisés par Windows, lus sans rien écrire', () => {
  assert.deepEqual(
    parseWakeDevices([
      { name: 'NVIDIA USB Type-C Port Policy Controller', cls: 'USB' },
      { name: 'Souris HID', cls: 'Mouse' },
      { name: 'Pinscape Controller', cls: 'HIDClass' },
      { name: 'Périphérique clavier HID', cls: 'Keyboard' },
      { name: 'Périphérique clavier HID', cls: 'Keyboard' },
      { name: 'Intel(R) Ethernet', cls: 'Net' },
    ]),
    ['Souris HID', 'Pinscape Controller', 'Périphérique clavier HID'],
  );
  assert.deepEqual(parseWakeDevices({ name: 'Clavier', cls: 'Keyboard' }), ['Clavier'], 'un seul objet');
  assert.deepEqual(parseWakeDevices(null), []);
  // Lecture seule : MSPower_DeviceWakeEnable lu, jamais écrit (ni powercfg, ni Set-CimInstance).
  const app = fs.readFileSync(path.join(REPO, 'app', 'src', 'arcade-hours.ts'), 'utf8');
  assert.match(app, /Get-CimInstance -Namespace root\/wmi -ClassName MSPower_DeviceWakeEnable/);
  assert.doesNotMatch(app, /Set-CimInstance|Invoke-CimMethod|powercfg|deviceenablewake/i);
});

test('mode invité : l’horaire ne se règle que depuis le menu système, fermé à l’invité', () => {
  assert.equal(GUEST_DOORS['menu.system'], false);
  const groups = Object.values(SYSTEM_GROUPS).filter((g) => (g.entries as readonly string[]).includes('menu-media'));
  assert.equal(groups.length, 1, 'Médias, son et attente : une entrée du menu système');
  const settings = fs.readFileSync(path.join(REPO, 'app', 'src', 'menu-settings.ts'), 'utf8');
  // L'écran de l'horaire ne s'ouvre que depuis « Médias, son et attente ».
  assert.equal([...settings.matchAll(/openHours\(\)/g)].length, 1);
});

test('rendu : voile de nuit en attente, préavis au-dessus avec son compte et sa propre invite', () => {
  const { document, send } = menuRenderer();
  const attract = { title: 'Neon Galaxy', subtitle: 'Williams · 1992' };
  const base = { ...menuState({ 'A.vpx': undefined, 'B.vpx': undefined, 'C.vpx': undefined }), attract };
  const veil = document.querySelector('#night-veil')!;
  send({ ...base, night: 0 });
  assert.ok(!veil.classList.contains('lowered'));
  assert.ok(document.querySelector('#root .attract-hint'), 'le jour : l’invite de l’attente');
  send({ ...base, night: 0.7 });
  assert.ok(veil.classList.contains('lowered'));
  assert.match(veil.getAttribute('style') ?? '', /--night:\s*0\.7/);
  const endsAt = Date.now() + 22_000;
  send({ ...base, night: 0.7, stop: { action: 'sleep', endsAt, ms: STOP_NOTICE_MS } });
  const notice = document.querySelector('#stop .stop-notice')!;
  assert.ok(notice, 'préavis dans sa couche, au-dessus du voile');
  assert.match(notice.textContent!, /Mise en veille dans\s*22\s*s/);
  assert.match(notice.textContent!, /Appuyez sur un bouton pour garder la borne allumée/);
  assert.equal(document.querySelector('#root .attract-hint'), null, 'une seule consigne à la fois');
  // Vu au bureau (fenêtre paysage) : le préavis recouvrait le fabricant et l'année ; l'attente lui laisse sa place.
  assert.ok(document.querySelector('#root .attract.has-stop'));
  assert.match(notice.querySelector('.stop-notice-bar')!.getAttribute('style') ?? '', /--stop-delay:\s*-8\d{3}ms/);
  send({ ...base, night: 0.7, stop: { action: 'shutdown', endsAt, ms: STOP_NOTICE_MS } });
  assert.match(document.querySelector('#stop .stop-notice')!.textContent!, /Extinction dans/);
  // L'écran noir de l'arrêt : ni voile ni préavis par-dessus.
  send({ ...base, phase: 'message', message: { title: 'Mise en veille…', lines: [], action: 'power' }, night: 0.7, stop: { action: 'sleep', endsAt, ms: STOP_NOTICE_MS } });
  assert.equal(document.querySelector('#stop .stop-notice'), null);
  assert.ok(!veil.classList.contains('lowered'));
  // Un bouton : retour au menu, voile levé d'un coup (aucune transition au repos).
  send({ ...base, attract: undefined, night: 0 });
  assert.equal(document.querySelector('#stop').children.length, 0);
  const css = fs.readFileSync(path.join(REPO, 'app', 'renderer', 'frontend.css'), 'utf8');
  assert.match(css, /\n\.night-veil \{[^}]*transition: none;/);
  assert.match(css, /\n\.night-veil\.lowered \{[^}]*transition: opacity 4s ease-in-out;/);
  // Tailles en unités de la zone du plateau, jamais de la fenêtre.
  const block = css.slice(css.indexOf('/* ---------- Horaire de la borne'), css.indexOf('/* ---------- Fond de partie'));
  assert.doesNotMatch(block, /\dvmin|\dvw|\dvh/);
  const reserved = Number(/\n\.attract\.has-stop \{\s*padding-bottom: ([\d.]+)cqmin;/.exec(block)?.[1]);
  const bottom = Number(/\n\.stop-notice \{[^}]*bottom: ([\d.]+)cqmin;/.exec(block)?.[1]);
  assert.ok(reserved >= bottom + 27, `place laissée au préavis : ${reserved}cqmin pour ${bottom}cqmin du bas et 27cqmin de haut`);
});
