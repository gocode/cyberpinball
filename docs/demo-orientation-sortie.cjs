// Aide de docs\demo-orientation-sortie.ps1 : prépare le modèle de borne et les écrans simulés d'un
// scénario, puis relit ce que Cyber Pinball a laissé.
//   node docs/demo-orientation-sortie.cjs preparer <cabinet.json> <dossier des données> <scénario>
//       jeu, bureau : modèle de l'assistant d'aujourd'hui, playfield tourné pour VPX (windowsRotation) ;
//       plantage  : le même, une session interrompue (fichier d'orientation laissé, écran encore tourné) ;
//       ancienne  : modèle d'avant le 27/10/2026, l'orientation de jeu gardée dans le réglage de Windows ;
//       perdue    : modèle d'avant le 27/10/2026, Windows a perdu l'orientation (redémarrage du PC).
//   node docs/demo-orientation-sortie.cjs bilan <cabinet.json> <dossier des données>
//       Une ligne JSON : orientation du bureau, réglage de Windows, fichier d'orientation, modèle.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const core = require(path.join(REPO, 'packages', 'core', 'dist', 'index.js'));
const [mode, cabinetFile, dataDir, scenario] = process.argv.slice(2);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const simulatedFile = path.join(dataDir, core.SIMULATED_ORIENTATION_FILE);
const recordFile = path.join(dataDir, core.ORIENTATION_FILE);

function playfieldOf(cabinet) {
  const screen = cabinet.screens.find((s) => s.fingerprint === cabinet.roles.playfield);
  if (!screen?.lastSeen) throw new Error('Modèle sans écran du playfield observé.');
  return screen;
}

if (mode === 'preparer') {
  const cabinet = readJson(cabinetFile);
  const screen = playfieldOf(cabinet);
  const display = screen.lastSeen;
  // Le bord des flippers pour lequel VPX demande de tourner l'écran (l'assistant le ferait).
  const edge = ['left', 'bottom', 'right', 'top'].find((e) => core.vpxOrientationFix(display, e));
  if (!edge) throw new Error('Aucun bord des flippers ne demande de tourner cet écran.');
  const fix = core.vpxOrientationFix(display, edge);
  const turned = core.rotatedDisplay(display, fix.delta);
  screen.lastSeen = turned;
  cabinet.playfield = { ...cabinet.playfield, flipperEdge: fix.edge };
  if (['jeu', 'bureau', 'plantage'].includes(scenario)) cabinet.playfield.windowsRotation = fix.rotation;
  fs.writeFileSync(cabinetFile, JSON.stringify(cabinet, null, 2));
  fs.rmSync(simulatedFile, { force: true });
  fs.rmSync(recordFile, { force: true });
  if (scenario === 'ancienne') core.rotateSimulated(simulatedFile, display.gdiName, fix.rotation, true);
  if (scenario === 'plantage') {
    core.rotateSimulated(simulatedFile, display.gdiName, fix.rotation, false);
    const record = { fingerprint: screen.fingerprint, gdiName: display.gdiName, label: `écran du playfield (${display.gdiName})`, origin: display.rotation, applied: fix.rotation, since: new Date().toISOString() };
    fs.writeFileSync(recordFile, JSON.stringify({ version: 1, screens: [record] }, null, 2));
  }
  console.log(`Préparé (${scenario}) : playfield ${display.gdiName}, flippers ${edge} à ${display.rotation}°, orientation de jeu ${fix.rotation}°.`);
  process.exit(0);
}

if (mode === 'bilan') {
  // Cyber Pinball a pu réenregistrer le modèle (ensemble de configurations) : relu comme lui.
  const cabinet = core.loadCabinet(dataDir);
  const screen = playfieldOf(cabinet);
  const gdi = screen.lastSeen.gdiName;
  const state = core.readSimulatedOrientations(simulatedFile);
  // Écran laissé tel quel par la session : l'orientation de son fichier d'écrans simulés.
  const fixture = process.env.CYBERPINBALL_DISPLAYS;
  const base = fixture ? core.parseSimulatedDisplays(readJson(fixture), fixture).find((d) => d.gdiName === gdi)?.rotation : undefined;
  const windows = state.windows[gdi] ?? base ?? 0;
  console.log(
    JSON.stringify({
      bureau: state.session[gdi] ?? windows,
      reglageWindows: windows,
      fichierOrientation: fs.existsSync(recordFile),
      orientationDeJeu: cabinet.playfield?.windowsRotation ?? null,
    }),
  );
  process.exit(0);
}

throw new Error(`Mode inconnu : ${mode} (preparer, bilan).`);
