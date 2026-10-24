import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet, ObservedDisplay, ScreenZone } from '../model';
import { pupCabinet } from '../puppack';
import { keepManualEdits, planVpxSync } from '../sync';
import { vpxSettingsFor } from '../vpx';
import {
  alignZone,
  snapRect,
  SNAP_PX,
  cabinetZones,
  dragZone,
  embeddedDmdZone,
  formatLabel,
  FULL_ZONE,
  isValidZone,
  maximizeZone,
  MIN_PX,
  moveZone,
  moveZoneToScreen,
  placeBeside,
  planDrag,
  resizeZone,
  roleZone,
  screenSurfaces,
  setZoneAspect,
  setZoneSize,
  splitBackglassDmd,
  zoneDisplay,
  zoneFindings,
  zonePlacement,
  zoneRect,
  zoneSizeCm,
} from '../zones';
import { devPcDisplays, emptyCabinet } from './fixtures';

const [samsung, , , iiyama] = devPcDisplays() as [ReturnType<typeof devPcDisplays>[number], unknown, unknown, ReturnType<typeof devPcDisplays>[number]];

/** Playfield sur l'iiyama ; backglass et DMD sur le Samsung, partagé par splitBackglassDmd. */
function sharedCabinet(): Cabinet {
  const displays = devPcDisplays();
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint, backglass: cabinet.screens[0]!.fingerprint, dmd: cabinet.screens[0]!.fingerprint };
  cabinet.zones = splitBackglassDmd(samsung.bounds);
  return cabinet;
}

/** Playfield sur l'iiyama, DMD incrusté en haut de son image. */
function embeddedCabinet(): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint, dmd: cabinet.screens[3]!.fingerprint };
  cabinet.zones = { dmd: { x: 0.25, y: 0, width: 0.5, height: 0.125 } };
  return cabinet;
}

const section = (settings: ReturnType<typeof vpxSettingsFor>, name: string) =>
  Object.fromEntries(settings.filter((s) => s.section === name && !s.key.startsWith('Priority.')).map((s) => [s.key, s.value]));

test('partage du fronton : DMD 4:1 centré sous le backglass, plafonné au tiers de la hauteur', () => {
  const { backglass, dmd } = splitBackglassDmd({ width: 1920, height: 1080 });
  assert.deepEqual(zoneRect(backglass, { width: 1920, height: 1080 }), { x: 0, y: 0, width: 1920, height: 720 });
  assert.deepEqual(zoneRect(dmd, { width: 1920, height: 1080 }), { x: 240, y: 720, width: 1440, height: 360 });
  // Écran plus haut : le DMD prend toute la largeur.
  const tall = splitBackglassDmd({ width: 1920, height: 1920 });
  assert.deepEqual(zoneRect(tall.dmd, { width: 1920, height: 1920 }), { x: 0, y: 1440, width: 1920, height: 480 });
  // FullDMD 16:9 (le DMD de la ROM s'incruste par-dessus) : même plafond, plus étroit.
  const full = splitBackglassDmd({ width: 1920, height: 1080 }, 16 / 9);
  assert.deepEqual(zoneRect(full.dmd, { width: 1920, height: 1080 }), { x: 640, y: 720, width: 640, height: 360 });
});

test('zones jointives au pixel près, quelle que soit la définition', () => {
  for (const size of [{ width: 1366, height: 768 }, { width: 1280, height: 1024 }, { width: 3840, height: 2160 }]) {
    const { backglass, dmd } = splitBackglassDmd(size);
    const top = zoneRect(backglass, size);
    const bottom = zoneRect(dmd, size);
    assert.equal(top.y + top.height, bottom.y, `${size.width}×${size.height}`);
    assert.ok(bottom.y + bottom.height <= size.height && bottom.x + bottom.width <= size.width);
  }
});

test('zone invalide : écran entier', () => {
  assert.equal(isValidZone({ x: 0, y: 0.8, width: 1, height: 0.3 }), false, 'déborde en bas');
  assert.equal(isValidZone({ x: 0, y: 0, width: 0, height: 1 }), false, 'largeur nulle');
  assert.equal(isValidZone({ x: Number.NaN, y: 0, width: 1, height: 1 }), false);
  const cabinet = sharedCabinet();
  cabinet.zones = { dmd: { x: 0, y: 0.8, width: 1, height: 0.3 } };
  assert.deepEqual(roleZone(cabinet, 'dmd'), { x: 0, y: 0, width: 1, height: 1 });
});

test('backglass et DMD sur le même écran : deux fenêtres « Windowed » posées sur leurs zones', () => {
  const cabinet = sharedCabinet();
  const settings = vpxSettingsFor({ playfield: iiyama, backglass: samsung, dmd: samsung }, undefined, cabinetZones(cabinet));
  assert.deepEqual(section(settings, 'Backglass'), {
    BackglassOutput: '1',
    BackglassDisplay: 'S22E450 [-1920, 0]',
    BackglassFullScreen: '0',
    BackglassWndX: '0',
    BackglassWndY: '0',
    BackglassWidth: '1920',
    BackglassHeight: '720',
  });
  assert.deepEqual(section(settings, 'ScoreView'), {
    ScoreViewOutput: '1',
    ScoreViewDisplay: 'S22E450 [-1920, 0]',
    ScoreViewFullScreen: '0',
    ScoreViewWndX: '240',
    ScoreViewWndY: '720',
    ScoreViewWidth: '1440',
    ScoreViewHeight: '360',
  });
  // Le playfield reste plein écran.
  assert.equal(section(settings, 'Player').PlayfieldFullScreen, '1');
});

test('DMD sur l’écran du playfield : incrusté dans son image, sans écran ni mode d’affichage', () => {
  const cabinet = embeddedCabinet();
  const assignments = { playfield: iiyama, dmd: iiyama };
  assert.equal(zonePlacement('dmd', assignments, cabinetZones(cabinet)), 'embedded');
  assert.deepEqual(section(vpxSettingsFor(assignments, undefined, cabinetZones(cabinet)), 'ScoreView'), {
    ScoreViewOutput: '2',
    ScoreViewWndX: '480',
    ScoreViewWndY: '0',
    ScoreViewWidth: '960',
    ScoreViewHeight: '135',
  });
});

test('sans zone, rien ne change pour une borne à un rôle par écran', () => {
  const assignments = { playfield: iiyama, backglass: samsung };
  assert.deepEqual(vpxSettingsFor(assignments, undefined, {}), vpxSettingsFor(assignments));
  assert.deepEqual(section(vpxSettingsFor(assignments), 'Backglass'), {
    BackglassOutput: '1',
    BackglassDisplay: 'S22E450 [-1920, 0]',
    BackglassFullScreen: '1',
    BackglassWndX: '0',
    BackglassWndY: '0',
    BackglassWidth: '1920',
    BackglassHeight: '1080',
  });
});

test('synchronisation d’une borne au fronton partagé : écrite une fois, puis à jour', () => {
  const cabinet = sharedCabinet();
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const ini = IniDocument.parse(first.nextIni!);
  assert.equal(ini.get('ScoreView', 'ScoreViewWndY'), '720');
  assert.equal(ini.get('Backglass', 'BackglassHeight'), '720');
  assert.deepEqual(first.findings.filter((f) => f.severity !== 'info'), []);
  const second = planVpxSync(cabinet, devPcDisplays(), first.nextIni!, undefined, { memory: first.memory });
  assert.deepEqual(second.changes, []);
});

test('deux rôles sur le même écran sans zone : signalés', () => {
  const cabinet = sharedCabinet();
  delete cabinet.zones;
  const findings = zoneFindings(cabinet, { playfield: iiyama, backglass: samsung, dmd: samsung });
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.message, /Backglass et DMD se recouvrent sur l'écran « S22E450 »/);
  assert.equal(findings[0]!.severity, 'warning', 'sans zone ni l’un ni l’autre : un oubli');
  // Écrans différents : rien à dire.
  assert.deepEqual(zoneFindings(cabinet, { playfield: iiyama, backglass: samsung, dmd: devPcDisplays()[2] }), []);
});

test('incrustation sur tout le playfield, ou vue de côté par le joueur : signalées', () => {
  const cabinet = embeddedCabinet();
  const assignments = { playfield: iiyama, dmd: iiyama };
  assert.deepEqual(zoneFindings(cabinet, assignments), [], 'joueur au bas de l’image');
  cabinet.playfield = { flipperEdge: 'left' };
  assert.match(zoneFindings(cabinet, assignments)[0]!.message, /DMD incrusté dans le playfield, joueur à gauche .* couchées/);
  cabinet.playfield = { flipperEdge: 'bottom' };
  delete cabinet.zones;
  assert.match(zoneFindings(cabinet, assignments)[0]!.message, /DMD incrusté sur tout le playfield/);
});

test('zone invalide dans cabinet.json : signalée', () => {
  const cabinet = sharedCabinet();
  cabinet.zones = { ...cabinet.zones, dmd: { x: 0, y: 0.9, width: 1, height: 0.5 } };
  const messages = zoneFindings(cabinet, { playfield: iiyama, backglass: samsung, dmd: samsung }).map((f) => f.message);
  assert.ok(messages.some((m) => /DMD : zone d'écran invalide/.test(m)));
  assert.ok(messages.some((m) => /se chevauchent/.test(m)), 'le DMD repris en plein écran recouvre le backglass');
});

test('DMD incrusté déplacé dans l’interface de VPX : « Garder » reprend la zone', () => {
  const cabinet = embeddedCabinet();
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const moved = IniDocument.parse(first.nextIni!);
  moved.set('ScoreView', 'ScoreViewWndY', '945');
  const plan = planVpxSync(cabinet, devPcDisplays(), moved.toString(), undefined, { memory: first.memory });
  assert.deepEqual(plan.manualEdits.map((e) => e.key), ['ScoreViewWndY']);
  const kept = keepManualEdits(cabinet, plan.manualEdits, moved.toString());
  assert.deepEqual(kept.zones?.dmd, { x: 0.25, y: 945 / 1080, width: 0.5, height: 0.125 });
  assert.equal(kept.vpxManual, undefined, 'la clé reste gérée par Cyber Pinball');
  // La zone reprise produit exactement ce que VPX a écrit.
  const after = planVpxSync(kept, devPcDisplays(), moved.toString(), undefined, { memory: plan.memory });
  assert.deepEqual(after.changes, []);
  assert.deepEqual(after.manualEdits, []);
});

test('fenêtre plein écran retouchée dans VPX : laissée à l’utilisateur, pas de zone', () => {
  const cabinet = sharedCabinet();
  delete cabinet.zones;
  cabinet.roles.dmd = cabinet.screens[2]!.fingerprint;
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const edited = IniDocument.parse(first.nextIni!);
  edited.set('ScoreView', 'ScoreViewWidth', '1000');
  const plan = planVpxSync(cabinet, devPcDisplays(), edited.toString(), undefined, { memory: first.memory });
  const kept = keepManualEdits(cabinet, plan.manualEdits, edited.toString());
  assert.equal(kept.zones, undefined);
  assert.deepEqual(kept.vpxManual, ['ScoreView.ScoreViewWidth']);
});

test('PuP-Pack : proportions de la zone, pas de tout l’écran', () => {
  const pup = pupCabinet(sharedCabinet())!;
  assert.equal(pup.dmd, true);
  assert.ok(Math.abs(pup.dmdRatio! - 4) < 1e-9);
  assert.ok(Math.abs(pup.backglassRatio! - 1920 / 720) < 1e-9);
  // Sans zone : l'écran entier, comme avant.
  const whole = sharedCabinet();
  delete whole.zones;
  assert.equal(pupCabinet(whole)!.backglassRatio, 1920 / 1080);
});

test('menu : une fenêtre par écran, les rôles qui le partagent dans leur zone', () => {
  const philips = devPcDisplays()[2]!;
  const zones = cabinetZones(sharedCabinet());
  const surfaces = screenSurfaces({ playfield: iiyama, backglass: samsung, dmd: samsung, topper: philips }, zones);
  assert.deepEqual(
    surfaces.map((s) => [s.role, s.display.friendlyName, s.parts.map((p) => p.role)]),
    [
      ['playfield', 'PLX2283HSU', []],
      ['backglass', 'S22E450', ['backglass', 'dmd']],
      ['topper', 'Philips 192E', ['topper']],
    ],
  );
  assert.deepEqual(surfaces[1]!.parts[1]!.zone, zones.dmd);
  assert.deepEqual(surfaces[2]!.parts[0]!.zone, { x: 0, y: 0, width: 1, height: 1 });
  // DMD incrusté : dessiné dans la fenêtre du playfield.
  const embedded = screenSurfaces({ playfield: iiyama, dmd: iiyama }, cabinetZones(embeddedCabinet()));
  assert.equal(embedded.length, 1);
  assert.deepEqual(embedded[0]!.parts.map((p) => p.role), ['dmd']);
});

test('DMD incrusté par défaut : 4:1, au bord opposé aux flippers', () => {
  const size = { width: 1920, height: 1080 };
  const top = embeddedDmdZone(size, 'bottom');
  assert.deepEqual(zoneRect(top, size), { x: 576, y: 22, width: 768, height: 192 });
  assert.ok(isValidZone(top));
  // Playfield en portrait (Windows tourné) : même largeur relative, moins haut.
  assert.deepEqual(zoneRect(embeddedDmdZone({ width: 1080, height: 1920 }), { width: 1080, height: 1920 }), { x: 324, y: 38, width: 432, height: 108 });
  for (const edge of ['left', 'top', 'right'] as const) assert.ok(isValidZone(embeddedDmdZone(size, edge)), edge);
  assert.ok(embeddedDmdZone(size, 'top').y > 0.5, 'flippers en haut : DMD en bas');
});

// ---------------------------------------------------------------------------
// Édition des zones

const FHD = { width: 1920, height: 1080 };
const px = (z: ScreenZone, size = FHD) => zoneRect(z, size);

test('déplacer : la zone reste dans l’écran', () => {
  const z = { x: 0.1, y: 0.1, width: 0.25, height: 0.25 };
  assert.deepEqual(px(moveZone(z, FHD, 100, -50)), { x: 292, y: 58, width: 480, height: 270 });
  assert.deepEqual(px(moveZone(z, FHD, 5000, 5000)), { x: 1440, y: 810, width: 480, height: 270 });
  assert.deepEqual(px(moveZone(z, FHD, -5000, -5000)), { x: 0, y: 0, width: 480, height: 270 });
});

test('redimensionner : format libre, un seul côté ; format verrouillé, les deux', () => {
  const free = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
  assert.deepEqual(px(resizeZone(free, FHD, 'width', 200)), { x: 380, y: 270, width: 1160, height: 540 });
  const locked = setZoneAspect(free, FHD, 16 / 9);
  assert.deepEqual(px(locked), { x: 480, y: 270, width: 960, height: 540 });
  const bigger = resizeZone(locked, FHD, 'width', 320);
  assert.deepEqual(px(bigger), { x: 320, y: 180, width: 1280, height: 720 });
  assert.equal(bigger.aspect, 16 / 9);
  // Par la hauteur : la largeur suit.
  assert.deepEqual(px(resizeZone(locked, FHD, 'height', 180)), { x: 320, y: 180, width: 1280, height: 720 });
  // Trop grand : réduit jusqu'à tenir, format gardé.
  assert.deepEqual(px(resizeZone(locked, FHD, 'width', 5000)), { x: 0, y: 0, width: 1920, height: 1080 });
});

test('format conservé : 16:9 sur une bande, puis taille précise', () => {
  const band = { x: 0, y: 0.75, width: 1, height: 0.25 };
  const locked = setZoneAspect(band, FHD, 16 / 9);
  assert.deepEqual(px(locked), { x: 0, y: 0, width: 1920, height: 1080 }, 'la hauteur ne tient pas : ramenée à l’écran');
  const small = setZoneSize(locked, FHD, 640, undefined);
  assert.deepEqual([px(small).width, px(small).height], [640, 360]);
  // Hauteur seule : la largeur en découle.
  const byHeight = setZoneSize(small, FHD, undefined, 270);
  assert.deepEqual([px(byHeight).width, px(byHeight).height], [480, 270]);
  // Format libéré : les deux côtés se règlent séparément.
  const free = setZoneAspect(small, FHD, undefined);
  assert.equal(free.aspect, undefined);
  const both = setZoneSize(free, FHD, 800, 100);
  assert.deepEqual([px(both).width, px(both).height], [800, 100]);
});

test('plein écran : tout l’écran, ou le plus grand rectangle au format verrouillé', () => {
  assert.deepEqual(maximizeZone({ x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, FHD), FULL_ZONE);
  const fourThree = maximizeZone({ x: 0, y: 0, width: 0.1, height: 0.1, aspect: 4 / 3 }, FHD);
  assert.deepEqual(px(fourThree), { x: 240, y: 0, width: 1440, height: 1080 });
  assert.equal(formatLabel(fourThree.aspect), '4:3');
  assert.equal(formatLabel(1.85), '1,85:1');
  assert.equal(formatLabel(undefined), 'Libre');
});

test('aligner sur un bord ou centrer', () => {
  const z = { x: 0.1, y: 0.1, width: 0.25, height: 0.25 };
  assert.deepEqual(px(alignZone(z, FHD, 'bottom')), { x: 192, y: 810, width: 480, height: 270 });
  assert.deepEqual(px(alignZone(z, FHD, 'right')), { x: 1440, y: 108, width: 480, height: 270 });
  assert.deepEqual(px(alignZone(alignZone(z, FHD, 'centerX'), FHD, 'centerY')), { x: 720, y: 405, width: 480, height: 270 });
});

test('placer au-dessus, en dessous, à côté d’une autre zone, réduite s’il le faut', () => {
  const backglass = { x: 0, y: 0, width: 1, height: 2 / 3 };
  const dmd = { x: 0, y: 0, width: 0.75, height: 0.25, aspect: 4 };
  // 1440 × 360 au format 4:1 : tient tout juste sous le backglass (360 px de libre).
  assert.deepEqual(px(placeBeside(dmd, backglass, FHD, 'below')!), { x: 240, y: 720, width: 1440, height: 360 });
  // Plus grand que la place : réduit, format 4:1 gardé, centré sous le backglass.
  const wide = { x: 0, y: 0, width: 1, height: 0.5, aspect: 4 };
  assert.deepEqual(px(placeBeside(wide, backglass, FHD, 'below')!), { x: 240, y: 720, width: 1440, height: 360 });
  // Sans format : la zone garde sa largeur et prend la hauteur disponible.
  assert.deepEqual(px(placeBeside({ x: 0, y: 0, width: 0.75, height: 0.5 }, backglass, FHD, 'below')!), { x: 240, y: 720, width: 1440, height: 360 });
  const bottom = { x: 0, y: 1 / 3, width: 1, height: 2 / 3 };
  assert.deepEqual(px(placeBeside({ x: 0, y: 0, width: 1, height: 0.2 }, bottom, FHD, 'above')!), { x: 0, y: 144, width: 1920, height: 216 });
  assert.deepEqual(px(placeBeside({ x: 0, y: 0, width: 0.25, height: 0.5 }, { x: 0, y: 0, width: 0.5, height: 1 }, FHD, 'right')!), { x: 960, y: 270, width: 480, height: 540 });
  assert.equal(placeBeside(dmd, FULL_ZONE, FHD, 'below'), undefined, 'aucune place sous un rôle plein écran');
});

test('tirer à la souris : le coin opposé reste en place, le format suit', () => {
  const z = { x: 0.25, y: 0.25, width: 0.25, height: 0.25, aspect: 16 / 9 };
  assert.deepEqual(px(dragZone(z, FHD, { x: 480, y: 270, width: 960, height: 300 }, 'se')), { x: 480, y: 270, width: 960, height: 540 });
  assert.deepEqual(px(dragZone(z, FHD, { x: 200, y: 270, width: 760, height: 270 }, 'nw')), { x: 200, y: 113, width: 760, height: 428 }, 'coin bas droit fixe');
  assert.deepEqual(px(dragZone({ x: 0, y: 0, width: 0.1, height: 0.1 }, FHD, { x: -40, y: 10, width: 192, height: 108 }, 'move')), { x: 0, y: 10, width: 192, height: 108 });
  // Jamais moins de MIN_PX de côté.
  assert.equal(px(dragZone(z, FHD, { x: 100, y: 100, width: 2, height: 2 }, 'se')).height, MIN_PX);
});

test('changer d’écran : même taille en pixels si elle tient, même position relative', () => {
  const small = { width: 1366, height: 768 };
  const moved = moveZoneToScreen({ x: 0.5, y: 0.5, width: 0.25, height: 0.25 }, FHD, small);
  assert.deepEqual(zoneRect(moved, small), { x: 614, y: 345, width: 480, height: 270 });
  assert.deepEqual(moveZoneToScreen(FULL_ZONE, FHD, small), FULL_ZONE);
  const tooBig = moveZoneToScreen({ x: 0, y: 0, width: 1, height: 0.5, aspect: 1920 / 540 }, FHD, small);
  assert.equal(zoneRect(tooBig, small).width, 1366);
});

// ---------------------------------------------------------------------------
// Playfield sur une partie de son écran (poste de bureau)

/** Un seul écran : playfield à gauche en 9:16, backglass à droite, DMD incrusté dans le playfield. */
function desktopCabinet(): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  const fp = cabinet.screens[3]!.fingerprint;
  cabinet.roles = { playfield: fp, backglass: fp, dmd: fp };
  cabinet.zones = {
    playfield: { x: 0, y: 0, width: 0.3164, height: 1, aspect: 9 / 16 },
    backglass: { x: 0.35, y: 0.1, width: 0.6, height: 0.6 },
    dmd: { x: 0.05, y: 0.02, width: 0.2, height: 0.05 },
  };
  cabinet.playfield = { flipperEdge: 'bottom' };
  return cabinet;
}

test('poste de bureau : playfield fenêtré, backglass à côté en fenêtre, DMD incrusté dans le playfield', () => {
  const cabinet = desktopCabinet();
  const assignments = { playfield: iiyama, backglass: iiyama, dmd: iiyama };
  const zones = cabinetZones(cabinet);
  assert.equal(zonePlacement('playfield', assignments, zones), 'window');
  assert.equal(zonePlacement('backglass', assignments, zones), 'window', 'hors de la zone du playfield : une fenêtre à part');
  assert.equal(zonePlacement('dmd', assignments, zones), 'embedded');
  const settings = vpxSettingsFor(assignments, undefined, zones);
  const player = section(settings, 'Player');
  assert.deepEqual(
    [player.PlayfieldFullScreen, player.PlayfieldWndX, player.PlayfieldWndY, player.PlayfieldWidth, player.PlayfieldHeight],
    ['0', '0', '0', '607', '1080'],
  );
  assert.equal(section(settings, 'Backglass').BackglassFullScreen, '0');
  // Incrustation : relative à l'image du playfield (ici à l'origine de l'écran).
  assert.deepEqual(section(settings, 'ScoreView'), { ScoreViewOutput: '2', ScoreViewWndX: '96', ScoreViewWndY: '22', ScoreViewWidth: '384', ScoreViewHeight: '54' });
  assert.deepEqual(zoneFindings(cabinet, assignments), []);
});

test('incrustation dans un playfield décalé : coordonnées relatives à sa fenêtre', () => {
  const cabinet = desktopCabinet();
  cabinet.zones!.playfield = { x: 0.5, y: 0, width: 0.5, height: 1 };
  cabinet.zones!.dmd = { x: 0.6, y: 0.05, width: 0.2, height: 0.05 };
  cabinet.zones!.backglass = { x: 0, y: 0, width: 0.45, height: 0.6 };
  const sv = section(vpxSettingsFor({ playfield: iiyama, backglass: iiyama, dmd: iiyama }, undefined, cabinetZones(cabinet)), 'ScoreView');
  assert.equal(sv.ScoreViewWndX, String(1152 - 960));
  assert.equal(sv.ScoreViewWndY, '54');
});

test('poste de bureau : vue borne et taille réelle d’après la fenêtre du playfield', () => {
  const cabinet = desktopCabinet();
  const ini = IniDocument.parse(planVpxSync(cabinet, devPcDisplays(), '').nextIni!);
  // Fenêtre 607 × 1080 : plus haute que large, vue borne ; écran de 48 × 26 cm, zone sur 31,6 % de la largeur.
  assert.equal(ini.get('Player', 'BGSet'), '1');
  assert.equal(ini.get('Player', 'ScreenWidth'), '26');
  assert.equal(ini.get('Player', 'ScreenHeight'), '15.2');
  assert.deepEqual(zoneSizeCm({ width: 48, height: 26 }, iiyama, cabinet.zones!.playfield), { width: 26, height: 15.19 });
  assert.equal(zoneDisplay(iiyama, cabinet.zones!.playfield).bounds.width, 607);
});

test('chevauchements : deux fenêtres signalées, une incrustation dans le playfield non', () => {
  const cabinet = desktopCabinet();
  const assignments = { playfield: iiyama, backglass: iiyama, dmd: iiyama };
  cabinet.zones!.backglass = { x: 0.2, y: 0.1, width: 0.6, height: 0.6 };
  const messages = zoneFindings(cabinet, assignments).map((f) => f.message);
  assert.equal(messages.length, 1);
  assert.match(messages[0]!, /Playfield et Backglass se chevauchent .* Windows décide lequel passe devant/);
  assert.equal(zoneFindings(cabinet, assignments)[0]!.severity, 'info', 'zones posées exprès : seulement signalé');
  // Deux incrustations l'une sur l'autre : VPX dessine le DMD par-dessus le backglass.
  cabinet.zones!.playfield = FULL_ZONE;
  cabinet.zones!.backglass = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
  cabinet.zones!.dmd = { x: 0.2, y: 0.2, width: 0.3, height: 0.1 };
  assert.match(zoneFindings(cabinet, assignments)[0]!.message, /Backglass et DMD se chevauchent .* VPX dessine le DMD par-dessus/);
});

test('fenêtre du playfield déplacée dans VPX : « Garder » reprend sa zone et la taille de l’écran', () => {
  const cabinet = desktopCabinet();
  const first = planVpxSync(cabinet, devPcDisplays(), '');
  const moved = IniDocument.parse(first.nextIni!);
  moved.set('Player', 'PlayfieldWndX', '100');
  moved.set('Player', 'ScreenWidth', '30');
  const plan = planVpxSync(cabinet, devPcDisplays(), moved.toString(), undefined, { memory: first.memory });
  const kept = keepManualEdits(cabinet, plan.manualEdits, moved.toString());
  assert.ok(Math.abs(kept.zones!.playfield!.x - 100 / 1920) < 1e-9);
  assert.equal(kept.zones!.playfield!.aspect, 9 / 16, 'format verrouillé gardé : la fenêtre a toujours ce format');
  // Fenêtre de 30 × 15,2 cm, haute de tout l'écran et large de 31,64 % : l'écran fait 48,04 × 30 cm.
  assert.deepEqual(kept.playfield?.manualSizeCm, { width: 48.04, height: 30 });
  assert.equal(kept.vpxManual, undefined);
});

test('aimantation : bords et milieu de l’écran, bords des autres zones, seulement sous le seuil', () => {
  // Déplacement : le bord gauche à 7 px du bord de l'écran s'y colle, la taille ne change pas.
  assert.deepEqual(snapRect({ x: 7, y: 300, width: 400, height: 200 }, FHD, [], 'move'), { x: 0, y: 300, width: 400, height: 200 });
  // Le milieu de la zone sur le milieu de l'écran.
  assert.deepEqual(snapRect({ x: 765, y: 444, width: 400, height: 200 }, FHD, [], 'move'), { x: 760, y: 440, width: 400, height: 200 });
  // Contre une autre zone : le haut du DMD sur le bas du backglass.
  const backglass = { x: 0, y: 0, width: 1, height: 2 / 3 };
  assert.deepEqual(snapRect({ x: 240, y: 729, width: 1440, height: 300 }, FHD, [backglass], 'move'), { x: 240, y: 720, width: 1440, height: 300 });
  // Coin tiré : seul le bord qui bouge s'aimante.
  assert.deepEqual(snapRect({ x: 100, y: 100, width: 1810, height: 500 }, FHD, [], 'se'), { x: 100, y: 100, width: 1820, height: 500 });
  assert.deepEqual(snapRect({ x: 5, y: 100, width: 300, height: 300 }, FHD, [], 'nw'), { x: 0, y: 100, width: 305, height: 300 });
  // Au-delà du seuil : rien ne bouge.
  const far = { x: SNAP_PX + 1, y: 300, width: 400, height: 201 };
  assert.deepEqual(snapRect(far, FHD, [], 'move'), far);
});

// ---------------------------------------------------------------------------
// Geste à la souris : l'écran de départ est celui de la fenêtre du geste

const SCREEN_SETS = path.join(__dirname, '..', '..', '..', '..', 'docs', 'ecrans');

/** Écrans d'un jeu de docs\ecrans, à l'échelle demandée (bornes en pixels physiques, inchangées). */
function screenSet(file: string, scale: number): ObservedDisplay[] {
  const raw = JSON.parse(fs.readFileSync(path.join(SCREEN_SETS, file), 'utf8').replace(/^﻿/, '')) as ObservedDisplay[] | { displays: ObservedDisplay[] };
  return (Array.isArray(raw) ? raw : raw.displays).map((d) => ({ ...d, scale }));
}

/**
 * Ce que screen.js envoie pour un geste parti du centre d'une zone (ou d'un coin), le
 * pointeur déplacé de dx, dy pixels logiques (DIP) : à 125 %, la fenêtre de 1920 px
 * physiques fait 1536 DIP.
 */
function gesture(display: ObservedDisplay, zone: ScreenZone, handle: 'move' | 'se', dx: number, dy: number) {
  const innerWidth = display.bounds.width / (display.scale ?? 1);
  const innerHeight = display.bounds.height / (display.scale ?? 1);
  const r = { left: zone.x * innerWidth, top: zone.y * innerHeight, width: zone.width * innerWidth, height: zone.height * innerHeight };
  const x0 = handle === 'move' ? r.left + r.width / 2 : r.left + r.width;
  const y0 = handle === 'move' ? r.top + r.height / 2 : r.top + r.height;
  const rect =
    handle === 'move'
      ? { x: (r.left + dx) / innerWidth, y: (r.top + dy) / innerHeight, width: r.width / innerWidth, height: r.height / innerHeight }
      : { x: r.left / innerWidth, y: r.top / innerHeight, width: (r.width + dx) / innerWidth, height: (r.height + dy) / innerHeight };
  return { rect, pointer: { x: (x0 + dx) / innerWidth, y: (y0 + dy) / innerHeight } };
}

for (const file of fs.readdirSync(SCREEN_SETS).filter((f) => f.endsWith('.json'))) {
  for (const scale of [1, 1.25]) {
    test(`coin du playfield tiré sur ${file} à ${scale * 100} % : jamais d’écran changé`, () => {
      const displays = screenSet(file, scale);
      for (const [index, display] of displays.entries()) {
        const zone = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
        // Coin tiré loin vers la droite et le bas, au-delà de la fenêtre et sur l'écran voisin.
        for (const [dx, dy] of [[40, 30], [display.bounds.width, 0], [-display.bounds.width * 2, display.bounds.height]]) {
          const plan = planDrag({ displays, role: 'playfield', origin: index, current: index, zone, handle: 'se', ...gesture(display, zone, 'se', dx!, dy!), snap: true, others: () => [] });
          assert.equal(plan.display, index, `écran ${index + 1}, ${dx}, ${dy}`);
          assert.ok(isValidZone(plan.zone));
        }
        // Playfield déplacé en entier hors de son écran : il reste sur le sien aussi.
        const moved = planDrag({ displays, role: 'playfield', origin: index, current: index, zone, handle: 'move', ...gesture(display, zone, 'move', display.bounds.width, 0), snap: false, others: () => [] });
        assert.equal(moved.display, index);
      }
    });

    test(`DMD tiré d’un écran à l’autre sur ${file} à ${scale * 100} %, puis ramené`, () => {
      const displays = screenSet(file, scale);
      const zone = { x: 0.4, y: 0.4, width: 0.2, height: 0.05 };
      for (const [index, display] of displays.entries()) {
        // Petit déplacement : le DMD reste sur son écran, déplacé d'autant.
        const small = planDrag({ displays, role: 'dmd', origin: index, current: index, zone, handle: 'move', ...gesture(display, zone, 'move', 20, 0), snap: false, others: () => [] });
        assert.equal(small.display, index);
        // Vers chaque autre écran : le centre de la zone visé au centre de cet écran.
        for (const [other, target] of displays.entries()) {
          if (other === index) continue;
          const from = display.bounds;
          const to = target.bounds;
          const k = display.scale ?? 1;
          const dx = (to.x + to.width / 2 - (from.x + (zone.x + zone.width / 2) * from.width)) / k;
          const dy = (to.y + to.height / 2 - (from.y + (zone.y + zone.height / 2) * from.height)) / k;
          const there = planDrag({ displays, role: 'dmd', origin: index, current: index, zone, handle: 'move', ...gesture(display, zone, 'move', dx, dy), snap: false, others: () => [] });
          assert.equal(there.display, other, `${index + 1} → ${other + 1}`);
          // Revenu sur son écran pendant le même geste : il y revient.
          const back = planDrag({ displays, role: 'dmd', origin: index, current: other, zone: there.zone, handle: 'move', ...gesture(display, zone, 'move', 0, 0), snap: false, others: () => [] });
          assert.equal(back.display, index);
        }
      }
    });
  }
}
