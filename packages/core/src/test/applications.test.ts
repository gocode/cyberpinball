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
  appIdFor,
  appInitials,
  appScreenLabel,
  appSite,
  appsInOrder,
  defaultApplications,
  isLocalHost,
  loadApplications,
  markOpened,
  normalizeAppUrl,
  portraitTurn,
  sameSite,
  saveApplications,
  type AppEntry,
} from '../applications';
import { setLanguage } from '../i18n';
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

function makeMenu() {
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
    screen: (where: string) => (where === 'backglass' ? { x: 1920, y: 0, width: 1920, height: 1080 } : { x: 0, y: 0, width: 1920, height: 1080 }),
    fronton: () => true,
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
});
