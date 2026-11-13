// Sortie garantie d'une partie dans le casque (essai du 10 novembre 2026 : partie bloquée, ni Pause ni Échap ne
// répondaient). Invariants : quel que soit le réglage des manettes, Échap quitte (clavier, VPX et Cyber Pinball),
// le bouton Pause existe, et le plugin de la pause n'avale jamais Pause, la sortie ni le menu de VPX.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  controllerOddity,
  controllerOddityKept,
  controllerProblem,
  defaultControllerSetting,
  HEADSET_PROFILES,
  type ControllerSetting,
  type HeadsetProfile,
  vpxHeadsetInput,
} from '../manettes';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

/** La valeur finale d'une clé [Input] : celle écrite par vpxHeadsetInput, sinon celle de l'INI. */
function finalMapping(ini: string, setting: ControllerSetting, action: string): string | undefined {
  const written = vpxHeadsetInput(ini, setting).find((s) => s.key === `Mapping.${action}`);
  if (written) return written.value;
  return new RegExp(`^Mapping\\.${action}\\s*=\\s*(.*)$`, 'm').exec(ini)?.[1];
}

/** Tous les réglages valables obtenus en échangeant deux fonctions de boutons du réglage par défaut. */
function variants(profile: HeadsetProfile): ControllerSetting[] {
  const base = defaultControllerSetting(profile);
  const ids = Object.keys(base.functions) as (keyof ControllerSetting['functions'])[];
  const out: ControllerSetting[] = [base];
  for (const a of ids)
    for (const b of ids) {
      if (a >= b) continue;
      const functions = { ...base.functions, [a]: base.functions[b], [b]: base.functions[a] };
      const setting = { profile, functions };
      if (!controllerProblem(setting)) out.push(setting);
    }
  return out;
}

test('sortie garantie : avec tout réglage des manettes, Échap reste lié à la sortie de VPX et Pause a un bouton', () => {
  const inis = [
    '',
    '[Input]\nMapping.ExitGame = \n',
    '[Input]\nMapping.ExitGame = Key;41 | OpenXR;9\nMapping.Pause = Key;19 | OpenXR;10\n',
    '[Input]\nMapping.ExitGame = Key;41\nMapping.Pause = Key;19\n',
  ];
  let checked = 0;
  for (const profile of Object.keys(HEADSET_PROFILES) as HeadsetProfile[])
    for (const setting of variants(profile))
      for (const ini of inis) {
        const exit = finalMapping(ini, setting, 'ExitGame');
        // Vide ou absente : VPX prend sa liaison par défaut, Échap (InputManager.cpp, SDL_SCANCODE_ESCAPE).
        assert.ok(exit === undefined || exit.trim() === '' || /(^|\|)\s*Key;41\s*($|\|)/.test(exit), `${profile} ${JSON.stringify(setting.functions)} : ExitGame = ${exit}`);
        const pause = finalMapping(ini, setting, 'Pause') ?? '';
        assert.match(pause, /OpenXR;\d+/, `${profile} : Pause sans bouton des manettes`);
        checked++;
      }
  assert.ok(checked > 100);
});

test('sortie garantie : Échap ferme la partie dans le casque côté Cyber Pinball, quel que soit le clavier de VPX', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /const vrEscape = vrGame !== undefined && simulated === undefined && globalShortcut\.register\(accelerator\(SHORTCUTS\.vrExit\), \(\) => \{[\s\S]{0,300}game\.stop\(\);/);
  assert.match(frontend, /if \(vrEscape\) globalShortcut\.unregister\(accelerator\(SHORTCUTS\.vrExit\)\);/);
});

test('sortie garantie : le plugin traduit le numéro interne des actions et n’avale jamais Pause, la sortie ni le menu de VPX', () => {
  const cpp = read('packages', 'vpx-vision3d', 'src', 'cyberpinball.cpp');
  const h = read('packages', 'vpx-vision3d', 'src', 'pause.h');
  // OnActionChanged donne le numéro interne (InputManager) : jamais comparé à l'énumération VPXAction.
  assert.doesNotMatch(cpp, /ev->action\s*==/);
  assert.match(cpp, /commandeVpx1081\(static_cast<int>\(ev->action\), liee\)/);
  // Une seule façon d'avaler une action : la règle de pause.h.
  assert.equal(cpp.match(/enableVPXProcessing\s*=\s*0/g)?.length, 1);
  assert.match(cpp, /if \(pause\.avaler\(c\)\)\s*ev->enableVPXProcessing = 0;/);
  assert.match(h, /if \(c == Commande::Pause \|\| c == Commande::Sortie \|\| c == Commande::Interface \|\| c == Commande::Inconnue\)\s*return false;/);
  // Table de VPX 10.8.1 : Pause 22, ExitGame 24, InGameUI 25 (15 est le crédit, B des manettes : « retour » du
  // réglage des écrans pendant la pause, jamais avalé hors du menu).
  assert.match(h, /\{ Commande::Retour, api::AddCredit \},\s*\/\/ 15 Credit1/);
  assert.match(h, /\{ Commande::Pause, -1 \},\s*\/\/ 22 Pause/);
  assert.match(h, /\{ Commande::Sortie, api::ExitGame \},\s*\/\/ 24 ExitGame/);
  assert.match(h, /\{ Commande::Interface, api::OpenInGameUI \},\s*\/\/ 25 InGameUI/);
  // Quitter : ExitGame, puis la fermeture de la fenêtre de VPX si la partie tourne encore.
  assert.match(cpp, /PostMessageW\(w, WM_CLOSE, 0, 0\)/);
  // Autre version de VPX : la table ne vaut plus, le plugin est passif.
  assert.match(cpp, /if \(!versionConnue\(\)\)\s*\{?\s*pause\.passif\(\);/);
});

test('réglage des manettes à l’envers (A et B croisés) : dit, réglage par défaut proposé, sauf s’il a été gardé sciemment', () => {
  const touch = defaultControllerSetting('touch');
  assert.equal(controllerOddity(touch), undefined);
  const crossed: ControllerSetting = { profile: 'touch', functions: { ...touch.functions, valider: 'b', retour: 'a' } };
  assert.equal(controllerProblem(crossed), undefined);
  assert.match(controllerOddity(crossed) ?? '', /B valide et A revient/);
  // Retour seul sur le bouton qui valide d'habitude : à l'envers aussi.
  assert.ok(controllerOddity({ profile: 'touch', functions: { ...touch.functions, valider: 'y', retour: 'a', credit: 'x' } }));
  // Un autre bouton pour valider, sans croiser : pas une erreur, un choix.
  assert.equal(controllerOddity({ profile: 'touch', functions: { ...touch.functions, valider: 'y' } }), undefined);
  assert.equal(controllerOddityKept(JSON.stringify({ ...crossed, keptAsIs: true })), true);
  assert.equal(controllerOddityKept(JSON.stringify(crossed)), false);
  assert.equal(controllerOddityKept('pas du json'), false);
  // L'assistant le propose au démarrage du casque, le réglage par défaut en avant, le sien à un bouton.
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /const odd = controllerOddity\(kept\);\s*if \(!odd \|\| controllerOddityKept\(text\)\) return;/);
  assert.match(frontend, /JSON\.stringify\(\{ \.\.\.kept, keptAsIs: true \}/);
});
