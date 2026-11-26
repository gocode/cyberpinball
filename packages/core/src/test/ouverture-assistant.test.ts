import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

// Ouverture de l'écran des boutons (26/11/2026) : valider « Boutons » dans le menu relance un processus ;
// le joueur attend devant l'ancien écran. La durée est mesurée (ouverture-chrono.ts), le menu dit tout de suite
// que ça s'ouvre, et le plafond est contrôlé.

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');
const source = (file: string) => fs.readFileSync(path.join(APP, 'src', file), 'utf8');

test('chronomètre d’ouverture : étapes, total, et avertissement au-delà du plafond', () => {
  const chrono = require(path.join(APP, 'dist', 'ouverture-chrono.js')) as {
    OUVERTURE_PLAFOND_MS: number;
    reglerHorloge: (f: (() => number) | undefined) => void;
    reperer: (etape: string) => void;
    lignePourLeJournal: (nom: string, plafond?: number) => { texte: string; lente: boolean };
  };
  let now = 0;
  chrono.reglerHorloge(() => now);
  now = 1500;
  chrono.reperer('démarrage');
  now = 1700;
  chrono.reperer('fenêtre montrée');
  const rapide = chrono.lignePourLeJournal('Test');
  assert.equal(rapide.lente, false);
  assert.match(rapide.texte, /1700 ms/);
  assert.match(rapide.texte, /démarrage 1500, fenêtre montrée 200/);
  now = chrono.OUVERTURE_PLAFOND_MS + 1;
  chrono.reperer('lent');
  assert.equal(chrono.lignePourLeJournal('Test').lente, true);
  assert.equal(chrono.lignePourLeJournal('Test', 60_000).lente, false);
  chrono.reglerHorloge(undefined);
});

test('assistant : l’ouverture est chronométrée jusqu’à la première fenêtre montrée, plafond d’avertissement', () => {
  const wizard = source('wizard.ts');
  for (const step of ['démarrage du processus', 'écrans', 'sorties audio', 'modèle de borne', 'VPX', 'fenêtre montrée']) assert.ok(wizard.includes(`reperer('${step}')`), step);
  assert.match(wizard, /lignePourLeJournal\('Assistant, ouverture'\)/);
  const chrono = source('ouverture-chrono.ts');
  const ceiling = Number(/OUVERTURE_PLAFOND_MS = (\d[\d_]*)/.exec(chrono)?.[1]?.replace(/_/g, ''));
  assert.ok(ceiling > 0 && ceiling <= 5000, `le plafond d’ouverture ne grimpe pas : ${ceiling}`);
});

test('menu : valider une étape de l’assistant le dit tout de suite, avant la relance du processus', () => {
  const frontend = source('frontend.ts');
  assert.match(frontend, /function relaunchWizard\([^)]*\): boolean \{[\s\S]{0,500}library\.showOpening\([\s\S]*?relaunchCovered\(/);
  assert.match(source('library.ts'), /function showOpening\(message: string\): void \{\s*busy = message;\s*host\.broadcast\(\);/);
});

test('boutons : « Annuler la dernière touche » est dans le résumé et pendant le relevé, avec sa pile et son retour d’état', () => {
  const wizard = source('wizard.ts');
  assert.match(wizard, /SUMMARY_ACTIONS = \[[^\]]*'undo'\]/);
  assert.match(wizard, /CAPTURE_ACTIONS = \[[^\]]*'undo'\]/);
  assert.match(wizard, /function undoLast\(capture: ButtonCapture\)[\s\S]*?capture\.keys = step\.keys;[\s\S]*?capture\.notice = step\.message;/);
  // Chaque changement du relevé garde son état d'avant : une touche, un passage, les touches par défaut, la fin du relevé.
  assert.ok((wizard.match(/remember\(/g) ?? []).length >= 5);
});
