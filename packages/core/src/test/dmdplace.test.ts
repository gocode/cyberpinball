import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  DMD_PLACES_FILE,
  dmdIniUpdate,
  dmdMenuAction,
  dmdMenuDirty,
  dmdMenuFrame,
  dmdMenuKey,
  dmdMenuPanel,
  dmdPlaceOf,
  dmdPlaceSettings,
  dmdSpotOfRect,
  dmdSpotRect,
  markDmdSaved,
  readDmdPlaces,
  saveDmdPlaces,
  startDmdMenu,
  withDmdPlace,
  writtenKey,
  type DmdMenuHost,
  type DmdPlace,
} from '../dmdplace';
import { IniDocument } from '../ini';
import { zoneRect } from '../zones';
import { devPcDisplays } from './fixtures';

// Écrans du PC de développement : S22E450 à gauche (-1920), l'écran intégré (0), PLX2283HSU à droite (1920).
const displays = devPcDisplays();

function host(over: Partial<DmdMenuHost> = {}): DmdMenuHost {
  return {
    screens: [displays[1]!, displays[0]!, displays[3]!].map((d, i) => ({ fingerprint: `fp${i}`, label: `${i + 1} · ${d.friendlyName || 'intégré'}`, bounds: d.bounds })),
    keys: { previous: ['ShiftLeft'], next: ['ShiftRight'], confirm: ['Digit1'], exit: ['Escape'], up: ['ControlLeft'], down: ['ControlRight'] },
    table: 'Medieval Madness',
    configuration: 'Borne',
    ownPlace: false,
    live: true,
    ...over,
  };
}

const press = (h: DmdMenuHost, s: ReturnType<typeof startDmdMenu>, code: string, times = 1, isAutoRepeat = false) => {
  let out: ReturnType<typeof dmdMenuKey> = 'handled';
  for (let i = 0; i < times; i++) out = dmdMenuKey(h, s, { code, isAutoRepeat });
  return out;
};

/** Une bande 4:1 de 512 × 128 en 704, 476 sur l'écran 1920 × 1080. */
const band = { x: 704 / 1920, y: 476 / 1080, width: 512 / 1920, height: 128 / 1080, aspect: 4 };

test('places du DMD : par configuration puis par table, gardées dans positions-dmd.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmdplace-'));
  assert.deepEqual(readDmdPlaces(dir), { version: 1, places: {} }, 'fichier absent : aucune place');
  const place: DmdPlace = { screen: 'fp1', zone: band, at: '2026-11-01T10:00:00.000Z' };
  let file = withDmdPlace(readDmdPlaces(dir), 'borne', 'mm', place);
  file = withDmdPlace(file, 'poste', 'mm', { ...place, hidden: true });
  saveDmdPlaces(dir, file);
  const back = readDmdPlaces(dir);
  assert.deepEqual(dmdPlaceOf(back, 'borne', 'mm'), place);
  assert.equal(dmdPlaceOf(back, 'poste', 'mm')?.hidden, true, 'une autre configuration a sa propre place');
  assert.equal(dmdPlaceOf(back, 'borne', 'afm'), undefined, 'une autre table suit la position générale');
  // Retirée : la configuration vide disparaît.
  assert.deepEqual(withDmdPlace(back, 'poste', 'mm', undefined).places.poste, undefined);
  // Une place abîmée est ignorée, les autres restent.
  fs.writeFileSync(path.join(dir, DMD_PLACES_FILE), JSON.stringify({ version: 1, places: { borne: { mm: place, x: { screen: 'fp1', zone: { x: 0, y: 0, width: 0, height: 1 } } } } }));
  assert.deepEqual(Object.keys(readDmdPlaces(dir).places.borne!), ['mm']);
  fs.writeFileSync(path.join(dir, DMD_PLACES_FILE), '{');
  assert.deepEqual(readDmdPlaces(dir).places, {});
});

test('[ScoreView] de la table : une fenêtre à sa place, seuls les points du DMD, ou masquée', () => {
  const place: DmdPlace = { screen: 'fp1', zone: band, at: '' };
  const keys = dmdPlaceSettings(place, displays[0]!, 'name-position');
  assert.deepEqual(keys, {
    ScoreViewOutput: '1',
    ScoreViewDisplay: 'S22E450 [-1920, 0]',
    ScoreViewFullScreen: '0',
    ScoreViewWndX: '704',
    ScoreViewWndY: '476',
    ScoreViewWidth: '512',
    ScoreViewHeight: '128',
    'Priority.B2S': '0',
  });
  assert.equal(dmdPlaceSettings({ ...place, hidden: true }, displays[0]!, 'name').ScoreViewOutput, '0');
  assert.equal(dmdPlaceSettings(place, displays[0]!, 'name').ScoreViewDisplay, 'S22E450');
});

test('.ini de la table : la place écrite, puis retirée sans toucher à ce que VPX a changé', () => {
  const wanted = dmdPlaceSettings({ screen: 'fp1', zone: band, at: '' }, displays[0]!, 'name');
  const text = ['[TableOverride]', 'ViewCabMode = 1', ''].join('\n');
  const first = dmdIniUpdate(text, wanted, undefined);
  const doc = IniDocument.parse(first.content!);
  assert.equal(doc.get('ScoreView', 'ScoreViewWndX'), '704');
  assert.equal(doc.get('TableOverride', 'ViewCabMode'), '1', 'le reste du .ini est gardé');
  assert.deepEqual(first.written, wanted);
  // Rien de changé : rien à écrire.
  assert.equal(dmdIniUpdate(first.content!, wanted, wanted).content, undefined);
  // Plus de place pour cette table : nos clés partent, celle réglée depuis dans le menu de VPX reste.
  const edited = first.content!.replace('ScoreViewWndX = 704', 'ScoreViewWndX = 100');
  const removed = dmdIniUpdate(edited, undefined, wanted);
  const after = IniDocument.parse(removed.content!);
  assert.equal(after.get('ScoreView', 'ScoreViewWndX'), '100');
  assert.equal(after.get('ScoreView', 'ScoreViewWidth'), undefined);
  assert.equal(after.get('ScoreView', 'Priority.B2S'), undefined);
  assert.equal(removed.written, null);
  // Le .ini ne contenait que nos clés : il n'a plus rien.
  assert.equal(dmdIniUpdate(dmdIniUpdate('', wanted, undefined).content!, undefined, wanted).content, '');
  // Jamais écrit : rien à faire.
  assert.deepEqual(dmdIniUpdate(text, undefined, undefined), { written: null });
  assert.equal(writtenKey('C:\\Tables\\MM\\MM.ini'), writtenKey('c:/tables/mm/MM.INI'));
});

test('menu en partie : « Position du DMD » en tête, réglée aux flippers et aux MagnaSave', () => {
  const h = host();
  const s = startDmdMenu({ screen: 0, zone: band, hidden: false });
  const panel = dmdMenuPanel(h, s, (codes) => codes.join(' ou '));
  assert.equal(panel.sections[0]!.items[0]!.label, 'Écran', 'la place du DMD avant toute autre ligne');
  assert.deepEqual(
    panel.sections.flatMap((x) => x.items.map((i) => i.label)),
    ['Écran', 'Position horizontale', 'Position verticale', 'Taille', 'Format', 'DMD', 'Enregistrer pour cette table', 'Revenir à la position générale', 'Tous les réglages de VPX', 'Reprendre la partie'],
  );
  // Sans place pour la table : la ligne est grisée avec sa raison, jamais cachée.
  assert.match(panel.sections[1]!.items[1]!.disabled!, /suit déjà la position générale/);
  // Position horizontale : flippers à gauche et à droite, MagnaSave en haut et en bas.
  press(h, s, 'ShiftRight');
  assert.equal(press(h, s, 'Digit1'), 'handled');
  assert.equal(s.mode, 'adjust');
  press(h, s, 'ShiftRight', 3);
  press(h, s, 'ControlLeft', 2);
  const r = zoneRect(s.spot.zone, h.screens[0]!.bounds);
  assert.deepEqual([r.x, r.y, r.width, r.height], [707, 474, 512, 128]);
  // Maintenu, le bouton accélère.
  press(h, s, 'ShiftRight', 10, true);
  assert.ok(zoneRect(s.spot.zone, h.screens[0]!.bounds).x > 707 + 10);
  // Exit : la ligne revient comme à son ouverture.
  press(h, s, 'Escape');
  assert.equal(zoneRect(s.spot.zone, h.screens[0]!.bounds).x, 704);
  assert.equal(s.mode, undefined);
  assert.equal(dmdMenuDirty(s), false);
});

test('menu en partie : taille au format 4:1, autre écran, masqué', () => {
  const h = host();
  const s = startDmdMenu({ screen: 0, zone: band, hidden: false });
  // Taille : la hauteur suit la largeur.
  s.item = 3;
  press(h, s, 'Digit1');
  press(h, s, 'ShiftRight', 2);
  press(h, s, 'Digit1');
  const r = zoneRect(s.spot.zone, h.screens[0]!.bounds);
  assert.equal(r.width, 520);
  assert.equal(r.height, 130);
  // Clavier : flèches et + / − à toute ligne.
  press(h, s, 'ArrowDown');
  assert.equal(zoneRect(s.spot.zone, h.screens[0]!.bounds).y, r.y + 1);
  // Écran : le DMD passe sur l'écran choisi, même taille en pixels, même place relative.
  s.item = 0;
  press(h, s, 'Digit1');
  press(h, s, 'ShiftRight');
  assert.equal(s.spot.screen, 1);
  press(h, s, 'Digit1');
  assert.deepEqual(dmdSpotRect(h, s.spot).width, 520);
  assert.equal(dmdSpotRect(h, s.spot).x < 0, true, 'S22E450 est à gauche du bureau');
  assert.ok(dmdMenuFrame(h, s, 1) && !dmdMenuFrame(h, s, 0), 'le cadre suit le DMD sur son écran');
  // Masqué : les lignes de place sont grisées avec leur raison, la ligne « DMD » le rend.
  s.item = 5;
  press(h, s, 'Digit1');
  assert.equal(s.spot.hidden, true);
  s.item = 1;
  press(h, s, 'Digit1');
  assert.match(s.notice!, /DMD masqué/);
  assert.equal(s.mode, undefined);
});

test('menu en partie : quitter sans enregistrer demande, enregistrer reste dans le menu', () => {
  const h = host({ ownPlace: true });
  const s = startDmdMenu({ screen: 0, zone: band, hidden: false });
  // Rien de changé : Exit rend la partie.
  assert.deepEqual(press(h, s, 'Escape'), { resume: true, discard: false });
  press(h, s, 'ArrowRight');
  assert.equal(press(h, s, 'Escape'), 'handled');
  assert.ok(s.leaving);
  const panel = dmdMenuPanel(h, s, (codes) => codes[0]!);
  assert.deepEqual(panel.leaving!.choices.map((c) => c.label), ['Enregistrer pour cette table', 'Abandonner les changements', 'Continuer le réglage']);
  // Abandonner : la partie reprend, les changements oubliés.
  press(h, s, 'ShiftRight');
  assert.deepEqual(press(h, s, 'Digit1'), { resume: true, discard: true });
  // Enregistrer depuis la question : puis la partie.
  press(h, s, 'Escape');
  assert.deepEqual(press(h, s, 'Digit1'), { save: true, then: 'resume' });
  // Ligne « Enregistrer pour cette table » : le menu reste ouvert, plus rien à enregistrer ensuite.
  s.item = 6;
  assert.deepEqual(press(h, s, 'Digit1'), { save: true, then: 'stay' });
  markDmdSaved(s, 'Enregistré');
  assert.equal(dmdMenuDirty(s), false);
  // « Tous les réglages de VPX » sans changement : directement.
  s.item = 8;
  assert.deepEqual(press(h, s, 'Digit1'), { vpx: true, discard: false });
  // Aucune touche n'ouvre le menu de VPX : grisé avec sa raison.
  const blocked = host({ vpxMenuBlocked: 'Aucune touche' });
  const b = startDmdMenu({ screen: 0, zone: band, hidden: false });
  b.item = 8;
  assert.equal(press(blocked, b, 'Digit1'), 'handled');
  assert.equal(b.notice, 'Aucune touche');
});

test('menu en partie : le DMD tiré à la souris, jusque sur un autre écran', () => {
  const h = host();
  const s = startDmdMenu({ screen: 0, zone: band, hidden: false });
  dmdMenuAction(h, s, { op: 'grab', screen: 0 });
  // Glissé de 10 % vers la droite sur son écran.
  dmdMenuAction(h, s, { op: 'drag', handle: 'move', rect: { ...band, x: band.x + 0.1 }, pointer: { x: 0.6, y: 0.5 }, free: true });
  assert.equal(s.spot.screen, 0);
  assert.equal(zoneRect(s.spot.zone, h.screens[0]!.bounds).x, 896);
  // Pointeur au-delà du bord droit : l'écran 3 (PLX2283HSU, à droite de l'intégré).
  dmdMenuAction(h, s, { op: 'drag', handle: 'move', rect: band, pointer: { x: 1.5, y: 0.5 }, free: true });
  assert.equal(s.spot.screen, 2);
  assert.match(s.notice!, /écran 3/);
  // Un coin tiré : la taille change, format 4:1 gardé.
  const t = startDmdMenu({ screen: 0, zone: band, hidden: false });
  dmdMenuAction(h, t, { op: 'grab', screen: 0 });
  dmdMenuAction(h, t, { op: 'drag', handle: 'se', rect: { ...band, width: band.width * 2 }, free: true });
  const r = zoneRect(t.spot.zone, h.screens[0]!.bounds);
  assert.equal(r.width, 1024);
  assert.equal(r.height, 256);
});

test('place lue sur la fenêtre de VPX : l’écran de son centre, 4:1 reconnu', () => {
  const h = host();
  const spot = dmdSpotOfRect(h.screens, { x: -1920 + 704, y: 476, width: 512, height: 128 })!;
  assert.equal(spot.screen, 1);
  assert.equal(spot.zone.aspect, 4);
  assert.deepEqual(dmdSpotRect(h, spot), { x: -1216, y: 476, width: 512, height: 128 });
  // FullDMD plein écran : format libre.
  assert.equal(dmdSpotOfRect(h.screens, { x: 0, y: 0, width: 1920, height: 1080 })!.zone.aspect, undefined);
  assert.equal(dmdSpotOfRect(h.screens, { x: 9000, y: 0, width: 10, height: 10 }), undefined);
});
