// Invariant du sens des tables : quelle que soit l'orientation de Windows et le bord où
// se tient le joueur, la partie s'affiche flippers de son côté (vpxPlayedFlipperEdge,
// d'après le VPinballX.ini écrit), ou la synchronisation le signale.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import { currentFlipperEdge, FLIPPER_EDGES, playfieldRotation, rotatedDisplay } from '../layout';
import { edgeRotation, type Cabinet, type FlipperEdge, type ObservedDisplay, type Rotation } from '../model';
import { orientationFinding, planVpxSync } from '../sync';
import { vpxOrientationFix, vpxPlayedFlipperEdge } from '../vpx';
import { devPcDisplays, emptyCabinet } from './fixtures';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** VPinballX.ini trouvés sur une borne avant la synchronisation. */
const STARTING_INIS: Record<string, string> = {
  absent: '',
  'modèle de VPX': '[Player]\nBGSet = \nCabinetAutofitMode = \n',
  manuel: '[Player]\nCabinetAutofitMode = 0\n',
  'manuel en toutes lettres': '[Player]\nCabinetAutofitMode = Manual\n',
  remplir: '[Player]\nCabinetAutofitMode = 2\n',
  'ancienne vue bureau': '[Player]\nBGSet = 0\nCabinetAutofitMode = 0\n',
  'ancienne vue borne tournée': '[Player]\nBGSet = 1\nCabinetAutofitMode = 0\n[TableOverride]\nViewCabRotation = 270\n',
};

/** Écran paysage de 1920 × 1080 (l'iiyama du PC de développement), puis un écran natif portrait. */
function panels(): ObservedDisplay[] {
  const landscape = devPcDisplays()[3]!;
  return [landscape, { ...landscape, bounds: { ...landscape.bounds, width: 1080, height: 1920 } }];
}

/** Modèle enregistré par l'assistant : playfield sur cet écran, joueur au bord `edge` de l'image. */
function cabinetFor(display: ObservedDisplay, edge: FlipperEdge): Cabinet {
  const screen = toPhysicalScreen(display);
  return { ...emptyCabinet(), screens: [screen], roles: { playfield: screen.fingerprint }, playfield: { flipperEdge: edge } };
}

function played(ini: string, display: ObservedDisplay) {
  const doc = IniDocument.parse(ini);
  return vpxPlayedFlipperEdge((section, key) => doc.get(section, key), display);
}

test('grille : toute orientation de Windows, tout bord des flippers, tout .ini de départ, la partie est dans le sens du joueur', () => {
  for (const panel of panels()) {
    for (const rotation of ROTATIONS) {
      const display = rotatedDisplay(panel, rotation);
      for (const edge of FLIPPER_EDGES) {
        // Assistant : Start tourne l'écran dans Windows quand VPX ne sait pas tourner ses tables vers ce bord.
        const fix = vpxOrientationFix(display, edge);
        const after = fix ? rotatedDisplay(display, fix.delta) : display;
        const player = fix ? fix.edge : edge;
        const cabinet = cabinetFor(after, player);
        for (const [name, ini] of Object.entries(STARTING_INIS)) {
          const where = `${panel.bounds.width}×${panel.bounds.height} tourné de ${rotation}°, flippers ${edge}, .ini ${name}`;
          const plan = planVpxSync(cabinet, [after], ini);
          assert.equal(played(plan.nextIni ?? ini, after).edge, player, where);
          assert.deepEqual(plan.findings.filter((f) => f.severity === 'warning'), [], where);
          // Le menu tourne de la même façon : même bord pour la partie et pour le menu.
          assert.equal(playfieldRotation(cabinet, after), edgeRotation(player), where);
          // Deuxième synchronisation : plus rien à changer.
          assert.deepEqual(planVpxSync(cabinet, [after], plan.nextIni ?? ini, undefined, { memory: plan.memory }).changes, [], where);
        }
      }
    }
  }
});

test('grille : orientation gardée ou changée hors de l’assistant, la partie est dans le bon sens ou c’est signalé', () => {
  for (const panel of panels()) {
    for (const rotation of ROTATIONS) {
      const display = rotatedDisplay(panel, rotation);
      for (const edge of FLIPPER_EDGES) {
        const cabinet = cabinetFor(display, edge);
        // Retournement refusé dans l'assistant (autre menu de borne), ou Windows tourné depuis.
        for (const later of ROTATIONS) {
          const now = rotatedDisplay(display, later);
          const player = currentFlipperEdge(cabinet, now)!;
          const plan = planVpxSync(cabinet, [now], '');
          const where = `${panel.bounds.width}×${panel.bounds.height} tourné de ${rotation}° puis ${later}°, flippers ${edge}`;
          const warned = plan.findings.some((f) => f.severity === 'warning' && f.message.includes("à l'envers"));
          assert.equal(played(plan.nextIni!, now).edge === player, !warned, where);
        }
      }
    }
  }
});

test('valeur changée à la main : la partie n’est plus dans le sens du joueur, c’est signalé', () => {
  const landscape = panels()[0]!;
  const cabinet = cabinetFor(landscape, 'right');
  const first = planVpxSync(cabinet, [landscape], '');
  const doc = IniDocument.parse(first.nextIni!);
  doc.set('Player', 'BGSet', '0');
  const plan = planVpxSync(cabinet, [landscape], doc.toString(), undefined, { memory: first.memory });
  assert.equal(plan.manualEdits[0]?.key, 'BGSet');
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.includes('[Player] BGSet = 0') && f.message.includes('en bas')));
});

test('constat d’orientation : .ini d’une table par-dessus VPinballX.ini', () => {
  const portrait = panels()[1]!;
  const global = IniDocument.parse('[Player]\nBGSet = 1\nCabinetAutofitMode = 1\n');
  const table = IniDocument.parse('[Player]\nCabinetAutofitMode = 0\n');
  const read = (section: string, key: string) => table.get(section, key) ?? global.get(section, key);
  assert.equal(orientationFinding(portrait, 'bottom', (s, k) => global.get(s, k)), undefined);
  assert.match(orientationFinding(portrait, 'bottom', read)!.message, /la rotation réglée par son auteur/);
});

test('VPX : rotation de la vue borne d’après la forme de la fenêtre, quel que soit ViewCabRotation', () => {
  const [landscape, portrait] = panels();
  const autofit = '[Player]\nBGSet = 1\nCabinetAutofitMode = Fit Table\n[TableOverride]\nViewCabRotation = 90\n';
  assert.deepEqual(played(autofit, landscape!), { edge: 'right', view: 'autofit' });
  assert.deepEqual(played(autofit, portrait!), { edge: 'bottom', view: 'autofit' });
  assert.deepEqual(played('[Player]\nBGSet = 1\n', portrait!), { view: 'manual' }, 'défaut de VPX : cadrage manuel');
  assert.deepEqual(played('[Player]\nBGSet = Cabinet\nCabinetAutofitMode = 7\n', portrait!), { view: 'manual' }, 'hors bornes : défaut');
  assert.deepEqual(played('[Player]\nBGSet = 2\n', portrait!), { edge: 'bottom', view: 'desktop' });
});
