import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { browserScreenNotice, browserScreenOptions, describeBrowserScreen, pickBrowserScreen } from '../browser-screen';
import { setBrowserScreen } from '../configurations';
import { toPhysicalScreen } from '../fingerprint';
import type { Cabinet, ObservedDisplay } from '../model';
import { loadCabinet, loadCabinetSet, saveCabinet } from '../store';
import { cabinetDisplays, emptyCabinet } from './fixtures';

const playfield = { x: 0, y: 0, width: 3840, height: 2160 };
const backglass = { x: 3840, y: 0, width: 1920, height: 1080 };
const dmd = { x: 3840, y: 1080, width: 1920, height: 480 };
const topper = { x: 5760, y: 0, width: 1920, height: 540 };
const screens = [
  { role: 'playfield' as const, bounds: playfield },
  { role: 'backglass' as const, bounds: backglass },
  { role: 'dmd' as const, bounds: dmd },
  { role: 'topper' as const, bounds: topper },
];

test('écran du navigateur : automatique, puis chaque rôle choisi', () => {
  // Automatique : la règle de lecture (playfield droit, sinon le plus grand des autres).
  assert.deepEqual(pickBrowserScreen(screens, 0, undefined), { bounds: playfield, roles: ['playfield'], chosen: false, tilted: false });
  assert.deepEqual(pickBrowserScreen(screens, 90, undefined), { bounds: backglass, roles: ['backglass'], chosen: false, tilted: false });
  // Choisi : toujours celui-là, même plus petit, même quand le playfield est droit.
  for (const s of screens.slice(1)) assert.deepEqual(pickBrowserScreen(screens, 90, s.role), { bounds: s.bounds, roles: [s.role], chosen: true, tilted: false });
  // Le playfield couché reste possible si l'utilisateur le choisit : signalé de travers.
  assert.deepEqual(pickBrowserScreen(screens, 270, 'playfield'), { bounds: playfield, roles: ['playfield'], chosen: true, tilted: true });
  assert.equal(pickBrowserScreen(screens, 0, 'playfield')!.tilted, false);
  assert.equal(pickBrowserScreen([], 0, 'dmd'), undefined);
});

test('écran du navigateur : repli sur automatique quand l’écran choisi n’est pas branché', () => {
  const unplugged = screens.filter((s) => s.role !== 'dmd');
  assert.deepEqual(pickBrowserScreen(unplugged, 90, 'dmd'), { bounds: backglass, roles: ['backglass'], chosen: false, missing: 'dmd', tilted: false });
  const notice = browserScreenNotice(pickBrowserScreen(unplugged, 90, 'dmd'));
  assert.match(notice!, /DMD n’est pas branché, ouvert sur Fronton \(automatique\)/);
  // Rien à dire quand l'écran choisi est là et droit.
  assert.equal(browserScreenNotice(pickBrowserScreen(screens, 90, 'dmd')), undefined);
  assert.match(browserScreenNotice(pickBrowserScreen(screens, 90, 'playfield'))!, /Playfield tourné/);
  // Seul écran, le playfield tourné : automatique le prend, et prévient aussi.
  assert.match(browserScreenNotice(pickBrowserScreen([screens[0]!], 90, undefined))!, /de travers/);
});

test('écran du navigateur : un écran partagé (fronton et DMD) est nommé par ses deux rôles', () => {
  const shared = [screens[0]!, screens[1]!, { role: 'dmd' as const, bounds: backglass }];
  assert.deepEqual(pickBrowserScreen(shared, 90, 'dmd'), { bounds: backglass, roles: ['backglass', 'dmd'], chosen: true, tilted: false });
});

/** Borne des fixtures : playfield couché sur le téléviseur (flippers à gauche), fronton, DMD. */
function cabinetModel(): { cabinet: Cabinet; displays: ObservedDisplay[] } {
  const displays = cabinetDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  const fp = (i: number) => cabinet.screens[i]!.fingerprint;
  cabinet.roles = { playfield: fp(0), backglass: fp(1), dmd: fp(2) };
  cabinet.playfield = { flipperEdge: 'left' };
  return { cabinet, displays };
}

test('écran du navigateur : choix proposés au menu, avec l’aperçu de chaque écran', () => {
  const { cabinet, displays } = cabinetModel();
  const options = browserScreenOptions(cabinet, displays);
  // Seulement les rôles que la borne a (pas de topper), Automatique en tête.
  assert.deepEqual(options.map((o) => o.label), ['Automatique', 'Playfield', 'Fronton', 'DMD']);
  assert.deepEqual(options.map((o) => o.current), [true, false, false, false]);
  assert.deepEqual(options[0]!.roles, ['backglass']);
  assert.match(describeBrowserScreen(cabinet, options[0]!), /^maintenant : Fronton · LG FULL HD \(1920 × 1080\) · paysage · debout/);
  assert.equal(options[1]!.tilted, true);
  assert.match(describeBrowserScreen(cabinet, options[1]!), /SAMSUNG \(3840 × 2160\) · paysage · couché, flippers à gauche de l’image : la page et la souris y vont de travers/);
  assert.match(describeBrowserScreen(cabinet, options[3]!), /LCD 12\.3 \(1920 × 720\) · paysage · debout, face au joueur/);
  // Le DMD débranché : l'aperçu le dit, et Automatique ne bouge pas.
  const unplugged = browserScreenOptions({ ...cabinet, browserScreen: 'dmd' }, displays.slice(0, 2));
  assert.equal(unplugged[3]!.display, undefined);
  assert.equal(unplugged[3]!.current, true);
  assert.match(describeBrowserScreen(cabinet, unplugged[3]!), /Pas branché/);
  // Windows renumérote les écrans (autres noms GDI, autres positions) : le DMD est retrouvé par son empreinte.
  const renumbered = displays.map((d, i) => ({ ...d, gdiName: `\\\\.\\DISPLAY${7 + i}`, bounds: { ...d.bounds, x: d.bounds.x + 100 } }));
  assert.equal(browserScreenOptions(cabinet, renumbered)[3]!.display?.gdiName, '\\\\.\\DISPLAY9');
});

test('écran du navigateur : rangé par configuration, gardé quand l’assistant refait le modèle', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-browser-screen-'));
  const { cabinet } = cabinetModel();
  saveCabinet(home, cabinet);
  const set = loadCabinetSet(home)!;
  const id = set.configurations[0]!.id;
  assert.equal(setBrowserScreen(set, id, 'dmd').configurations[0]!.browserScreen, 'dmd');
  assert.equal('browserScreen' in setBrowserScreen(setBrowserScreen(set, id, 'dmd'), id, undefined).configurations[0]!, false);
  fs.writeFileSync(path.join(home, 'cabinet.json'), JSON.stringify(setBrowserScreen(set, id, 'dmd')));
  // L'assistant complet enregistre un modèle neuf, sans ce réglage qu'il ne demande pas.
  saveCabinet(home, { ...cabinet, updatedAt: 'refait' });
  assert.equal(loadCabinet(home)!.browserScreen, 'dmd');
  // Un modèle qui le porte (ou le retire) explicitement l'emporte.
  saveCabinet(home, { ...cabinet, browserScreen: 'backglass' });
  assert.equal(loadCabinet(home)!.browserScreen, 'backglass');
});

test('écran du navigateur : toute fenêtre « Récupérer » vient d’une seule fabrique, branchée sur le réglage', () => {
  const dir = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => ({ file: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
  // Une seule fenêtre de navigateur : catalogue, comptes, médias des sites et recherche sur le web passent par elle.
  const makers = sources.filter((s) => /createAcquirer\(\{/.test(s.text)).map((s) => s.file);
  assert.deepEqual(makers, ['catalog.ts']);
  assert.match(sources.find((s) => s.file === 'catalog.ts')!.text, /createAcquirer\(\{[\s\S]*?screen: \(\) => host\.browserScreen\?\.\(\)/);
  // La session du navigateur intégré n'ouvre aucune autre fenêtre visible qu'elle.
  for (const s of sources.filter((x) => x.file !== 'acquire-window.ts')) assert.doesNotMatch(s.text, /persist:acquisition/, s.file);
  // Le menu donne l'écran d'après le réglage de la configuration active, relu à chaque ouverture.
  assert.match(sources.find((s) => s.file === 'frontend.ts')!.text, /browserScreen: \(\) => browserScreenRect\(\)[\s\S]*?function browserScreenRect\(\)[\s\S]*?loadCabinet\(loc\.dataDir\)\?\.browserScreen/);
});
