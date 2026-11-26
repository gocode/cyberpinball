// Applications (26/11/2026) : adresses et tuiles du cœur (packages/core/src/applications.ts), puis la
// grille du front-end (app/src/applications-menu.ts, compilé) avec un faux hôte : Start relâché ouvre,
// Start tenu une seconde ou un MagnaSave ouvre les réglages, une application ouverte puis fermée par
// Exit tenu rend la grille, et une application fermée par le front-end (partie lancée, sortie) ne la
// rend pas. Enfin le branchement dans frontend.ts : médaillon juste après le Juke-box, icônes servies,
// application fermée avant une partie. Données fictives.

import { after, test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  addApplication,
  APP_MOBILE_USER_AGENT,
  appBrowserArgs,
  appIdFor,
  appMobile,
  appInitials,
  appScreenLabel,
  appSite,
  appsInOrder,
  defaultApplications,
  isLocalHost,
  loadApplications,
  markOpened,
  normalizeAppUrl,
  placementProblem,
  portraitTurn,
  rectAfterTurn,
  sameSite,
  saveApplications,
  turnPlayfieldForApp,
  updateApplication,
  type AppEntry,
} from '../applications';
import { toPhysicalScreen } from '../fingerprint';
import { setLanguage } from '../i18n';
import type { Cabinet, Rotation } from '../model';
import {
  ORIENTATION_FILE,
  readSimulatedOrientations,
  rotateSimulated,
  SessionOrientation,
  sessionScreens,
  SIMULATED_ORIENTATION_FILE,
  wantedOrientations,
  withSimulatedOrientations,
} from '../sessionorientation';
import { devPcDisplays, emptyCabinet } from './fixtures';
import { frontendSource } from './frontend-source';

setLanguage('fr');

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');
const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-applications-'));
  dirs.push(d);
  return d;
};
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Cœur

test('normalizeAppUrl : https ajouté, http pour le réseau local, le reste refusé', () => {
  assert.equal(normalizeAppUrl(' exemple-video.example.com '), 'https://exemple-video.example.com/');
  assert.equal(normalizeAppUrl('http://exemple.example.org/page'), 'http://exemple.example.org/page');
  assert.equal(normalizeAppUrl('192.168.1.20:8123'), 'http://192.168.1.20:8123/');
  assert.equal(normalizeAppUrl('serveur.local:32400/web'), 'http://serveur.local:32400/web');
  assert.equal(normalizeAppUrl('javascript:alert(1)'), undefined);
  assert.equal(normalizeAppUrl('file:///C:/Windows'), undefined);
  assert.equal(normalizeAppUrl('pas une adresse'), undefined);
  assert.equal(normalizeAppUrl(''), undefined);
});

test('isLocalHost : adresses privées et noms locaux seulement', () => {
  for (const h of ['localhost', '127.0.0.1', '10.0.0.5', '172.20.1.1', '192.168.0.10', '169.254.3.4', 'maison.local', 'nas.lan', '[::1]']) assert.ok(isLocalHost(h), h);
  for (const h of ['exemple.example.com', '172.32.0.1', '8.8.8.8', '193.168.0.1']) assert.ok(!isLocalHost(h), h);
});

test('appSite, appIdFor, sameSite : hôte sans www, port gardé, doublons reconnus', () => {
  assert.equal(appSite('https://www.exemple.example.com/x'), 'exemple.example.com');
  assert.equal(appSite('http://192.168.1.20:8123/'), '192.168.1.20:8123');
  assert.equal(appIdFor('http://192.168.1.20:8123/'), '192-168-1-20-8123');
  assert.ok(sameSite('https://www.exemple.example.com/', 'https://exemple.example.com'));
  assert.ok(!sameSite('https://exemple.example.com/a', 'https://exemple.example.com/b'));
});

test('appInitials : deux mots, deux capitales, sinon une lettre', () => {
  assert.equal(appInitials('Home Assistant'), 'HA');
  assert.equal(appInitials('YouTube'), 'YT');
  assert.equal(appInitials('Netflix'), 'N');
  assert.equal(appInitials('  '), '?');
});

test('addApplication : refuse une adresse invalide et un site déjà là, ajoute à la fin sinon', () => {
  const store = defaultApplications('2026-11-01T00:00:00.000Z');
  const first = store.apps[0]!;
  // Le même site, avec ou sans www : un doublon.
  const twin = first.url.includes('://www.') ? first.url.replace('://www.', '://') : first.url.replace('://', '://www.');
  const dup = addApplication(store, { name: 'Copie', url: twin });
  assert.equal(dup.ok, false);
  assert.ok(!dup.ok && dup.existing?.id === first.id);
  assert.equal(addApplication(store, { name: 'X', url: 'ftp://exemple.example.com' }).ok, false);
  const r = addApplication(store, { name: 'Radio fictive', url: 'radio-fictive.example.com' });
  assert.ok(r.ok);
  assert.equal(r.ok && r.store.apps.at(-1)?.id, 'radio-fictive-example-com');
  assert.equal(r.ok && r.app.screen, 'backglass');
});

test('appsInOrder : les dernières ouvertes d’abord, puis l’ordre d’ajout', () => {
  let store = defaultApplications('2026-11-01T00:00:00.000Z');
  const [a, b, c] = store.apps as [AppEntry, AppEntry, AppEntry];
  store = markOpened(store, c.id, '2026-11-20T10:00:00.000Z');
  store = markOpened(store, b.id, '2026-11-25T10:00:00.000Z');
  assert.deepEqual(appsInOrder(store).slice(0, 3).map((e) => e.id), [b.id, c.id, a.id]);
});

test('loadApplications : les six d’office sans fichier, une entrée illisible oubliée', () => {
  const dir = tmp();
  assert.equal(loadApplications(dir).apps.length, defaultApplications().apps.length);
  saveApplications(dir, { apps: [{ id: 'ok', name: 'Fictive', url: 'https://fictive.example.com/', screen: 'playfield', color: '#112233', added: 'x' }, { id: 'Mauvais id', name: 'Y', url: 'https://y.example.com/', screen: 'backglass', color: '#000000', added: 'x' }] });
  const loaded = loadApplications(dir);
  assert.deepEqual(loaded.apps.map((e) => e.id), ['ok']);
  assert.equal(loaded.apps[0]!.screen, 'playfield');
});

test('appScreenLabel et portraitTurn', () => {
  assert.equal(appScreenLabel('playfield'), 'Playfield');
  assert.equal(appScreenLabel('backglass'), 'Fronton');
  assert.equal(portraitTurn('bottom', 0), undefined);
});

// ---------------------------------------------------------------------------
// La grille, avec un faux hôte

/* eslint-disable @typescript-eslint/no-explicit-any */
type Built = any;

function fakeSession(app: AppEntry) {
  let end: () => void = () => undefined;
  const done = new Promise<void>((r) => (end = r));
  const keys: string[] = [];
  return {
    app,
    browser: 'edge' as const,
    shown: Promise.resolve(true),
    done,
    keys,
    finished: 0,
    rect: () => undefined,
    pointer: () => undefined,
    click: () => undefined,
    wheel: () => undefined,
    type: () => undefined,
    key(k: string) {
      keys.push(k);
    },
    set: () => undefined,
    front: () => undefined,
    finish() {
      this.finished++;
      end();
    },
  };
}

interface MenuOptions {
  /** La liste écrite avant l'ouverture du menu (sinon les six d'office). */
  apps?: AppEntry[];
  portrait?: () => { rect: unknown; leave(): unknown } | undefined;
  screen?: (where: string) => unknown;
}

function makeMenu(options: MenuOptions = {}) {
  // Le module du front-end charge @cyberpinball/core, comme dans l'application.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createApplicationsMenu } = require(path.join(APP_DIST, 'applications-menu.js'));
  const screens: Built[] = [];
  const opened: { app: AppEntry; rect: unknown }[] = [];
  const sessions: ReturnType<typeof fakeSession>[] = [];
  let foreground = 0;
  let backs = 0;
  const host = {
    dataDir: tmp(),
    library: {
      openCustom: (build: () => Built) => screens.push(build),
      openPrompt: () => undefined,
      openNotice: (heading: string, lines: string[]) => screens.push(() => ({ heading, lines })),
      changed: () => undefined,
    },
    keys: () => ({ previous: ['ArrowLeft'], next: ['ArrowRight'], confirm: ['Enter'], exit: ['Escape'] }),
    zoneKeys: () => ['ShiftLeft'],
    screen: options.screen ?? ((where: string) => (where === 'backglass' ? { x: 1920, y: 0, width: 1920, height: 1080 } : { x: 0, y: 0, width: 1920, height: 1080 })),
    fronton: () => true,
    portrait: options.portrait ?? (() => undefined),
    browser: {
      browser: () => ({ exe: 'edge.exe', kind: 'edge' }),
      open: (app: AppEntry, rect: unknown) => {
        opened.push({ app, rect });
        const s = fakeSession(app);
        sessions.push(s);
        return s;
      },
      current: () => sessions.at(-1),
    },
    buttons: { keys: () => ({}), watch: () => () => undefined },
    takeForeground: () => foreground++,
    openExternal: () => undefined,
    online: () => false,
    look: async () => ({}),
    iconUrl: (file: string) => `media://${file}`,
    edgeDownloadUrl: 'https://exemple.example.com/edge',
  };
  if (options.apps) saveApplications(host.dataDir, { apps: options.apps });
  const menu = createApplicationsMenu(host);
  menu.open(() => backs++);
  return {
    menu,
    screens,
    opened,
    sessions,
    top: (): Built => screens.at(-1)!(),
    foreground: () => foreground,
    backs: () => backs,
  };
}

const key = (type: 'keyDown' | 'keyUp', code: string) => ({ type, code, key: code, isAutoRepeat: false });
const settle = () => new Promise<void>((r) => setImmediate(r));

test('la grille : tuiles au fronton, fiche, commandes, une action par application plus Ajouter et Retour', () => {
  const m = makeMenu();
  const g = m.top();
  assert.equal(g.heading, 'Applications');
  assert.equal(g.apps.mode, 'grid');
  assert.equal(g.apps.fronton, true);
  assert.equal(g.apps.tiles.length, defaultApplications().apps.length);
  assert.equal(g.apps.current, 0);
  assert.ok(g.apps.fiche, 'la fiche de la première application');
  assert.ok(g.apps.banner, 'hors ligne : le bandeau le dit');
  assert.deepEqual(g.actions.slice(-2).map((a: any) => a.key), ['add', 'back']);
  assert.equal(g.actions.length, g.apps.tiles.length + 2);
  assert.ok(g.keysUp, 'la grille reçoit le relâché de Start');
});

test('Start relâché ouvre l’application choisie sur son écran, Exit tenu la ferme et la grille revient', async () => {
  const m = makeMenu();
  const g = m.top();
  assert.equal(g.keys(key('keyDown', 'ArrowRight')), true);
  const chosen = m.top().apps.tiles[1].id;
  assert.equal(m.top().keys(key('keyDown', 'Enter')), true);
  assert.equal(m.opened.length, 0, 'rien ne s’ouvre à l’appui');
  m.top().keys(key('keyUp', 'Enter'));
  assert.equal(m.opened.length, 1);
  assert.equal(m.opened[0]!.app.id, chosen);
  assert.equal(m.menu.running()?.id, chosen);
  const open = m.top();
  assert.equal(open.apps.mode, 'open');
  assert.ok(open.apps.open.buttons.length >= 5);
  // Exit tenu une seconde : la session se termine (watchAppButtons appelle quit), la grille revient.
  m.sessions[0]!.finish();
  await settle();
  assert.equal(m.menu.running(), undefined);
  assert.equal(m.foreground(), 1, 'Cyber Pinball reprend la main');
  assert.equal(m.top().apps.mode, 'grid');
  assert.equal(m.top().apps.tiles[0].id, chosen, 'la dernière ouverte passe en tête');
});

test('Start tenu une seconde, ou un MagnaSave, ouvre les réglages de l’application choisie', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const m = makeMenu();
  const grid = m.top();
  const name = grid.apps.tiles[0].name;
  grid.keys(key('keyDown', 'Enter'));
  t.mock.timers.tick(1000);
  assert.equal(m.top().heading, name);
  assert.equal(m.top().subheading, 'Réglages');
  grid.keys(key('keyUp', 'Enter'));
  assert.equal(m.opened.length, 0, 'le relâché après les réglages n’ouvre rien');

  const m2 = makeMenu();
  assert.equal(m2.top().keys(key('keyDown', 'ShiftLeft')), true);
  assert.equal(m2.top().subheading, 'Réglages');
});

test('fermée par le front-end (partie, sortie) : ni premier plan ni grille', async () => {
  const m = makeMenu();
  m.top().keys(key('keyDown', 'Enter'));
  m.top().keys(key('keyUp', 'Enter'));
  const shown = m.screens.length;
  m.menu.close();
  await settle();
  assert.equal(m.sessions[0]!.finished, 1);
  assert.equal(m.menu.running(), undefined);
  assert.equal(m.foreground(), 0);
  assert.equal(m.screens.length, shown, 'aucun écran rouvert par-dessus la partie');
  m.menu.close();
  assert.equal(m.sessions[0]!.finished, 1, 'rien à fermer une seconde fois');
});

test('Retour à la roue depuis la grille', () => {
  const m = makeMenu();
  m.top().actions.at(-1).run();
  assert.equal(m.backs(), 1);
});

// ---------------------------------------------------------------------------
// Playfield en portrait : Windows tourne l'écran le temps de l'application, puis le rend
// (écrans simulés : jamais un vrai écran, jamais l'orientation réelle de Windows)

/** Un playfield 1920 × 1080 simulé, sa session d'orientation (celle des parties) et les fichiers qui l'enregistrent. */
function simulatedPlayfield(playfield: Cabinet['playfield']) {
  const dir = tmp();
  const panel = devPcDisplays()[3]!;
  const screen = toPhysicalScreen(panel);
  const cabinet: Cabinet = { ...emptyCabinet(), screens: [screen], roles: { playfield: screen.fingerprint }, playfield };
  const simulatedFile = path.join(dir, SIMULATED_ORIENTATION_FILE);
  const recordFile = path.join(dir, ORIENTATION_FILE);
  const displays = () => withSimulatedOrientations([panel], readSimulatedOrientations(simulatedFile));
  const options = { file: recordFile, screens: () => sessionScreens(displays(), cabinet), rotate: (gdiName: string, rotation: Rotation, persist: boolean) => rotateSimulated(simulatedFile, gdiName, rotation, persist) };
  const session = new SessionOrientation(options);
  session.start(wantedOrientations(cabinet));
  const turn = () => turnPlayfieldForApp({ session, cabinet, displays });
  return { cabinet, displays, session, options, turn, recordFile, rotation: () => displays()[0]!.rotation, bounds: () => displays()[0]!.bounds };
}

function playfieldApp(screen: AppEntry['screen']): AppEntry {
  return { id: 'fictive', name: 'Fictive', url: 'https://fictive.example.com/', screen, color: '#112233', added: 'x' };
}

test('une application ouverte sur le playfield tourne l’écran puis le rétablit ; rien ne tourne sur le fronton', async () => {
  // Flippers à gauche de l'image : Windows tourne l'écran de 270° pour les mettre en bas.
  const sim = simulatedPlayfield({ flipperEdge: 'left' });
  let calls = 0;
  const portrait = () => (calls++, sim.turn());
  const screen = (where: string) => (where === 'backglass' ? { x: 1920, y: 0, width: 1920, height: 1080 } : sim.bounds());

  // Fronton : le crochet n'est pas même appelé, l'écran garde son orientation.
  const backglass = makeMenu({ apps: [playfieldApp('backglass')], portrait, screen });
  backglass.top().keys(key('keyDown', 'Enter'));
  backglass.top().keys(key('keyUp', 'Enter'));
  assert.equal(backglass.opened.length, 1);
  assert.deepEqual(backglass.opened[0]!.rect, { x: 1920, y: 0, width: 1920, height: 1080 });
  assert.equal(calls, 0);
  assert.equal(sim.rotation(), 0);
  backglass.sessions[0]!.finish();
  await settle();
  assert.equal(sim.rotation(), 0);

  // Playfield : l'écran tourne avant l'ouverture, Edge est posé sur le rectangle tourné.
  const m = makeMenu({ apps: [playfieldApp('playfield')], portrait, screen });
  m.top().keys(key('keyDown', 'Enter'));
  m.top().keys(key('keyUp', 'Enter'));
  assert.equal(calls, 1);
  assert.equal(sim.rotation(), 270);
  assert.deepEqual(m.opened[0]!.rect, { x: 1920, y: 0, width: 1080, height: 1920 }, 'largeur et hauteur échangées');
  assert.ok(fs.existsSync(sim.recordFile), 'l’origine est notée : un plantage laisse de quoi la rendre');
  // Fermée (bouton, Edge fermé, Exit tenu : la session se termine) : l'orientation d'origine revient.
  m.sessions[0]!.finish();
  await settle();
  assert.equal(sim.rotation(), 0);
  assert.equal(fs.existsSync(sim.recordFile), false, 'plus rien à rendre');
  assert.equal(m.menu.running(), undefined);
});

test('playfield : rien à tourner quand l’image est déjà à l’endroit, ou sans playfield relevé', () => {
  const upright = simulatedPlayfield({ flipperEdge: 'bottom' });
  assert.equal(upright.turn(), undefined);
  assert.equal(upright.rotation(), 0);
  const unknown = simulatedPlayfield({ flipperEdge: 'left' });
  assert.equal(turnPlayfieldForApp({ session: unknown.session, cabinet: undefined, displays: unknown.displays }), undefined);
  assert.equal(unknown.rotation(), 0);
});

test('playfield : l’orientation de jeu revient (pas celle de Windows), une seule fois', () => {
  // Orientation de jeu 90° ; flippers en haut de l'image à 90° : l'application les veut en bas (270°).
  const sim = simulatedPlayfield({ flipperEdge: 'left', windowsRotation: 90 });
  assert.equal(sim.rotation(), 90);
  const portrait = sim.turn();
  assert.ok(portrait);
  assert.equal(sim.rotation(), 270);
  // Une veille qui remet Windows à son réglage pendant l'application : la session reprend le portrait.
  sim.session.check();
  assert.equal(sim.rotation(), 270);
  portrait.leave();
  assert.equal(sim.rotation(), 90, 'l’orientation de jeu, pas celle de Windows (0°)');
  portrait.leave();
  assert.equal(sim.rotation(), 90);
});

test('playfield : relevé de Windows pas encore à jour après le quart de tour (borne du 26/11/2026), le rectangle est tourné quand même', () => {
  // 3840 × 2160 relu après le passage de 180° à 270° : Edge était posé en paysage sur un écran devenu portrait.
  const sim = simulatedPlayfield({ flipperEdge: 'left' });
  const staleDisplays = () => sim.displays().map((d) => ({ ...d, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }));
  const portrait = turnPlayfieldForApp({ session: sim.session, cabinet: sim.cabinet, displays: staleDisplays });
  assert.ok(portrait);
  assert.equal(sim.rotation(), 270);
  assert.deepEqual(portrait.rect, { x: 0, y: 0, width: 1080, height: 1920 }, 'largeur et hauteur échangées malgré le relevé périmé');
});

test('rectAfterTurn : échange seulement après un quart de tour dont le relevé n’a pas bougé', () => {
  const before = { ...devPcDisplays()[3]!, rotation: 180 as Rotation, bounds: { x: 0, y: 0, width: 3840, height: 2160 } };
  assert.deepEqual(rectAfterTurn(before, { x: 0, y: 0, width: 3840, height: 2160 }, 270), { x: 0, y: 0, width: 2160, height: 3840 });
  assert.deepEqual(rectAfterTurn(before, { x: 0, y: 0, width: 2160, height: 3840 }, 270), { x: 0, y: 0, width: 2160, height: 3840 }, 'relevé à jour : gardé tel quel');
  assert.deepEqual(rectAfterTurn(before, { x: 0, y: 0, width: 3840, height: 2160 }, 0), { x: 0, y: 0, width: 3840, height: 2160 }, 'demi-tour : mêmes dimensions');
  const square = { ...before, bounds: { x: 0, y: 0, width: 2000, height: 2000 } };
  assert.deepEqual(rectAfterTurn(square, { x: 5, y: 6, width: 2000, height: 2000 }, 90), { x: 5, y: 6, width: 2000, height: 2000 });
});

test('placementProblem : un écart de position ou de taille se dit, un écart minime non', () => {
  const wanted = { x: 0, y: 0, width: 2160, height: 3840 };
  assert.equal(placementProblem(wanted, { x: 0, y: 0, width: 2160, height: 3840 }), undefined);
  assert.equal(placementProblem(wanted, { x: 0, y: 0, width: 2150, height: 3840 }), undefined, 'bordure');
  assert.match(placementProblem(wanted, { x: 0, y: 0, width: 3840, height: 2160 }) ?? '', /3840 × 2160 en 0, 0 au lieu de 2160 × 3840 en 0, 0/);
  assert.ok(placementProblem(wanted, undefined));
});

test('playfield : Cyber Pinball quitté ou planté pendant l’application, l’écran retrouve son orientation', () => {
  // Quitté : la sortie de la session rend l'origine, puis la fermeture tardive d'Edge ne touche plus à rien.
  const quit = simulatedPlayfield({ flipperEdge: 'right' });
  const portrait = quit.turn();
  assert.ok(portrait);
  assert.equal(quit.rotation(), 90);
  quit.session.end();
  assert.equal(quit.rotation(), 0);
  portrait.leave();
  assert.equal(quit.rotation(), 0);
  assert.equal(fs.existsSync(quit.recordFile), false);

  // Planté : le fichier de la session reste ; le démarrage suivant rend l'origine.
  const crash = simulatedPlayfield({ flipperEdge: 'left' });
  assert.ok(crash.turn());
  assert.equal(crash.rotation(), 270);
  assert.ok(fs.existsSync(crash.recordFile));
  const next = new SessionOrientation(crash.options);
  next.start(wantedOrientations(crash.cabinet));
  assert.equal(crash.rotation(), 0);
  assert.equal(fs.existsSync(crash.recordFile), false);
});

// ---------------------------------------------------------------------------
// Branchement dans le front-end

test('frontend.ts : médaillon juste après le Juke-box, icônes servies, application fermée avant une partie et à la sortie', () => {
  const front = frontendSource();
  const leads = front.slice(front.indexOf('function wheelLeads('), front.indexOf('function selectedMedallion('));
  const jukebox = leads.indexOf("'jukebox'");
  const apps = leads.indexOf("'applications'");
  assert.ok(jukebox >= 0 && apps > jukebox, 'Applications suit le Juke-box');
  assert.ok(apps < leads.indexOf("'community'"), 'et précède la Communauté');
  assert.match(front, /serveMedias\([^;]*applicationsIconDir\(loc\.dataDir\)/s);
  const play = front.slice(front.indexOf('async function play(table: TableEntry'));
  assert.ok(play.indexOf('applicationsMenu.close();') >= 0 && play.indexOf('applicationsMenu.close();') < play.indexOf('\n}'), 'play() ferme l’application ouverte');
  assert.match(front, /'will-quit', \(\) => \{[^}]*applicationsMenu\.close\(\)/);
  // Le playfield tourné pour l'application : le crochet du menu est branché sur la rotation de session (oublié le 26/11/2026).
  const menuHost = front.slice(front.indexOf('createApplicationsMenu({'), front.indexOf('createGameReturn({'));
  assert.match(menuHost, /portrait: \(\) => orientationForApp\(\)/);
});

test('affichage mobile : oui par défaut, seul « non » s\'écrit, et l\'en-tête User-Agent mobile part avec Edge', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-mobile-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const base = { id: 'ok', name: 'Fictive', url: 'https://fictive.example.com/', screen: 'backglass' as const, color: '#112233', added: 'x' };
  // Une liste écrite avant l'option : oui.
  saveApplications(dir, { apps: [base, { ...base, id: 'non', url: 'https://non.example.com/', mobile: false }, { ...base, id: 'oui', url: 'https://oui.example.com/', mobile: true }] });
  const loaded = loadApplications(dir);
  saveApplications(dir, loaded);
  const raw = fs.readFileSync(path.join(dir, 'applications.json'), 'utf8');
  assert.equal(raw.includes('"mobile": true'), false, 'oui n\'est jamais écrit : c\'est l\'absence de choix');
  assert.equal(raw.includes('"mobile": false'), true, 'non s\'écrit');
  assert.deepEqual(loaded.apps.map((a) => appMobile(a)), [true, false, true]);
  // Le réglage : non, puis oui de nouveau (le champ disparaît).
  const off = updateApplication(loaded, 'ok', { mobile: false });
  assert.equal(appMobile(off.apps[0]!), false);
  const on = updateApplication(off, 'ok', { mobile: true });
  assert.equal(appMobile(on.apps[0]!), true);
  assert.equal('mobile' in on.apps[0]!, false);
  // Les applications ajoutées sont en affichage mobile.
  const added = addApplication({ apps: [] }, { name: 'Neuve', url: 'https://neuve.example.com/' });
  assert.ok(added.ok && appMobile(added.app));
  // Les arguments d'Edge : l'en-tête mobile seulement quand l'option est active.
  const at = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.ok(appBrowserArgs('p', at, 'https://a.example.com/', true).includes(`--user-agent=${APP_MOBILE_USER_AGENT}`));
  assert.equal(appBrowserArgs('p', at, 'https://a.example.com/', false).some((a) => a.startsWith('--user-agent')), false);
  assert.match(APP_MOBILE_USER_AGENT, /Android[\s\S]*Mobile/);
});
