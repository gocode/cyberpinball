// Invariant du sens des tables d'un démarrage à l'autre : l'assistant configure le playfield,
// puis le PC redémarre et Windows rend à l'écran son propre réglage (sessionorientation.ts : rien
// n'y est écrit). Au démarrage suivant, la session redonne l'orientation de jeu, et VPX dessine
// la partie du côté du joueur, sans avertissement, quelle que soit l'orientation de Windows de
// départ ; de même après une veille ou une reconnexion (check), et pour une borne configurée
// avant le 27/10/2026 que Windows a laissée revenir à 0°. Puis la ligne de « Santé de la borne »
// et le sens d'une table corrigée dans le menu de VPX.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { addConfiguration } from '../configurations';
import { toPhysicalScreen } from '../fingerprint';
import { orientationFacts, orientationVerdict } from '../gameorientation';
import { screensFacts, screensLines } from '../health';
import { setLanguage } from '../i18n';
import { IniDocument } from '../ini';
import { currentFlipperEdge, edgeAfterRotation, FLIPPER_EDGES, playfieldRotation, rotatedDisplay, rotationDelta } from '../layout';
import { edgeRotation, type Cabinet, type FlipperEdge, type ObservedDisplay, type Rotation } from '../model';
import { legacyOrientation, SessionOrientation, sessionScreens, wantedOrientations } from '../sessionorientation';
import { planVpxSync } from '../sync';
import { vpxOrientationFix, vpxPlayedFlipperEdge } from '../vpx';
import { devPcDisplays, emptyCabinet } from './fixtures';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** Écran paysage de 1920 × 1080, puis un écran natif portrait. */
function panels(): ObservedDisplay[] {
  const landscape = devPcDisplays()[3]!;
  return [landscape, { ...landscape, bounds: { ...landscape.bounds, width: 1080, height: 1920 } }];
}

function played(ini: string, display: ObservedDisplay) {
  const doc = IniDocument.parse(ini);
  return vpxPlayedFlipperEdge((section, key) => doc.get(section, key), display).edge;
}

/** Modèle que l'assistant enregistre : écran tel qu'il l'a laissé, bord du joueur, orientation de jeu s'il a tourné l'écran. */
function wizardCabinet(display: ObservedDisplay, edge: FlipperEdge, turned: boolean): Cabinet {
  const screen = toPhysicalScreen(display);
  return { ...emptyCabinet(), screens: [screen], roles: { playfield: screen.fingerprint }, playfield: { flipperEdge: edge, ...(turned && { windowsRotation: display.rotation }) } };
}

/** Un Windows simulé à un écran : la session le tourne pour elle seule, jamais dans son réglage. */
function simulatedWindows(display: ObservedDisplay, cabinet: Cabinet, dir: string) {
  const state = { display, persisted: 0 };
  const session = new SessionOrientation({
    file: path.join(dir, 'orientation-ecrans.json'),
    screens: () => sessionScreens([state.display], cabinet),
    rotate: (_gdiName, rotation, persist) => {
      if (persist) state.persisted++;
      state.display = rotatedDisplay(state.display, rotationDelta(rotation, state.display.rotation));
    },
  });
  return { state, session };
}

/** Bord du joueur ramené au repère fixe de l'écran (Windows à 0°) : il ne bouge pas quand l'image tourne. */
function physical(edge: FlipperEdge, display: ObservedDisplay): FlipperEdge {
  return edgeAfterRotation(edge, rotationDelta(0, display.rotation));
}

/** Ce que voit le joueur : bord de la partie (d'après VPinballX.ini synchronisé) contre le sien ; avertissements de la synchronisation. */
function game(cabinet: Cabinet, display: ObservedDisplay, ini: string) {
  const plan = planVpxSync(cabinet, [display], ini);
  const next = plan.nextIni ?? ini;
  return { ini: next, played: played(next, display), player: currentFlipperEdge(cabinet, display)!, warnings: plan.findings.filter((f) => f.severity === 'warning') };
}

test('redémarrage simulé : quelle que soit l’orientation de Windows au départ, la partie reste dans le sens du joueur', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sens-'));
  try {
    for (const panel of panels()) {
      for (const rotation of ROTATIONS) {
        // Le réglage de Windows : celui que chaque redémarrage rend à l'écran.
        const windows = rotatedDisplay(panel, rotation);
        for (const edge of FLIPPER_EDGES) {
          const where = `${panel.bounds.width}×${panel.bounds.height}, Windows en ${rotation}°, flippers ${edge}`;
          // Assistant : Start tourne l'écran quand VPX ne sait pas mettre les flippers de ce côté.
          const fix = vpxOrientationFix(windows, edge);
          const cabinet = wizardCabinet(fix ? rotatedDisplay(windows, fix.delta) : windows, fix ? fix.edge : edge, Boolean(fix));
          const first = simulatedWindows(windows, cabinet, dir);
          first.session.start(wantedOrientations(cabinet));
          const playing = first.state.display;
          const before = game(cabinet, playing, '');
          assert.equal(before.played, before.player, where);
          first.session.end();
          assert.equal(first.state.display.rotation, rotation, `${where} : sortie, Windows retrouve son orientation`);
          // Redémarrage : l'écran repart dans le réglage de Windows, puis le menu démarre.
          const second = simulatedWindows(windows, cabinet, dir);
          second.session.start(wantedOrientations(cabinet));
          const after = game(cabinet, second.state.display, before.ini);
          assert.equal(after.played, after.player, `${where} : après le redémarrage`);
          assert.equal(physical(after.player, second.state.display), physical(before.player, playing), `${where} : le joueur n'a pas bougé`);
          assert.equal(playfieldRotation(cabinet, second.state.display), edgeRotation(after.player), `${where} : menu`);
          assert.deepEqual(after.warnings, [], where);
          // Veille ou reconnexion : Windows remet son réglage, la session reprend l'orientation de jeu.
          second.state.display = windows;
          second.session.check();
          assert.equal(game(cabinet, second.state.display, after.ini).played, after.player, `${where} : après une reconnexion`);
          second.session.end();
          assert.equal(first.state.persisted + second.state.persisted, 0, `${where} : rien dans le réglage de Windows`);
        }
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('borne configurée avant le 27/10/2026, Windows revenu à 0° au redémarrage : la partie retrouve son sens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-sens-'));
  try {
    for (const panel of panels()) {
      for (const edge of FLIPPER_EDGES) {
        const fix = vpxOrientationFix(panel, edge);
        if (!fix) continue;
        // L'ancien assistant laissait l'écran tourné dans Windows, sans windowsRotation dans le modèle.
        let cabinet = wizardCabinet(rotatedDisplay(panel, fix.delta), fix.edge, false);
        const where = `${panel.bounds.width}×${panel.bounds.height}, flippers ${edge}, assistant en ${fix.rotation}°`;
        // Le PinCab : partie à l'envers tant que rien ne reprend l'orientation de jeu.
        const broken = game(cabinet, panel, '');
        assert.notEqual(broken.played, broken.player, where);
        assert.ok(broken.warnings.some((w) => w.message.includes("à l'envers")), where);
        // Démarrage du menu (display-orientation.ts) : orientation perdue, notée sans question, puis donnée.
        const legacy = legacyOrientation(cabinet, panel)!;
        assert.deepEqual({ playing: legacy.playing, desktopTurned: legacy.desktopTurned }, { playing: fix.rotation, desktopTurned: false }, where);
        cabinet = { ...cabinet, playfield: { ...cabinet.playfield!, windowsRotation: legacy.playing } };
        const { state, session } = simulatedWindows(panel, cabinet, dir);
        session.start(wantedOrientations(cabinet));
        const fixed = game(cabinet, state.display, broken.ini);
        assert.equal(fixed.played, fixed.player, where);
        assert.equal(physical(fixed.player, state.display), physical(broken.player, panel), `${where} : le joueur n'a pas bougé`);
        assert.deepEqual(fixed.warnings, [], where);
        session.end();
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('correction faite dans le menu de VPX (cadrage manuel, vue et rotation dans le .ini) : son sens est connu', () => {
  const [landscape, portrait] = panels();
  const manual = (mode: string, rotation: string) => `[Player]\nBGSet = 1\nCabinetAutofitMode = 0\n[TableOverride]\nViewCabMode = ${mode}\nViewCabRotation = ${rotation}\n`;
  // ViewSetup::GetRotation : en « Window », 270° de plus pour une fenêtre paysage.
  assert.equal(played(manual('2', '180'), landscape!), 'left');
  assert.equal(played(manual('Window', '0'), landscape!), 'right');
  assert.equal(played(manual('2', '180.000000'), portrait!), 'top');
  assert.equal(played(manual('0', '90'), landscape!), 'left', 'Legacy : la rotation seule');
  // Vue ou rotation venues du .vpx, ou hors quart de tour : inconnu.
  assert.equal(played('[Player]\nBGSet = 1\nCabinetAutofitMode = 0\n[TableOverride]\nViewCabRotation = 180\n', landscape!), undefined);
  assert.equal(played(manual('2', '45'), landscape!), undefined);
});

test('« Santé de la borne » : la ligne du sens des tables', () => {
  setLanguage('fr');
  const landscape = panels()[0]!;
  const flipped = rotatedDisplay(landscape, 180);
  // Assistant : écran retourné pour un joueur au bord gauche du paysage (droit de l'image retournée).
  const cabinet = wizardCabinet(flipped, 'right', true);
  const set = addConfiguration(undefined, cabinet, 'Borne').set;
  const sense = (observed: ObservedDisplay[]) => screensLines(screensFacts(set, observed))[1]!;
  assert.equal(sense([flipped]).state, 'ok');
  assert.match(sense([flipped]).title, /Tables dans votre sens, flippers à droite/);
  assert.equal(sense([flipped]).detail, 'Windows en 180°');
  // Windows n'a pas repris l'orientation de jeu : à l'envers, et pourquoi.
  assert.equal(sense([landscape]).state, 'blocking');
  assert.match(sense([landscape]).title, /flippers à droite, vous êtes à gauche/);
  assert.match(sense([landscape]).detail!, /Windows en 0° ; orientation de jeu : 180°, que Windows n’a pas reprise/);
  assert.deepEqual(sense([landscape]).target, { kind: 'system', item: 'cabinet' });
  // L'assistant n'a pas retourné (refus) : rien à reprendre, il faut le relancer.
  const kept = wizardCabinet(landscape, 'left', false);
  assert.match(orientationVerdict(orientationFacts(kept, [landscape])!).detail, /relancez « Orientation et taille du playfield »/);
  // Sans playfield branché : pas de ligne.
  assert.equal(orientationFacts(kept, devPcDisplays().slice(0, 1)), undefined);
});
