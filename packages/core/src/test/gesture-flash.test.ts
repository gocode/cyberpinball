// Message d'un geste (app/src/gesture-flash.ts, compilé) : la confirmation ou l'erreur d'une action
// reste à l'écran jusqu'au geste suivant de l'utilisateur, quel que soit le nombre de dessins
// entre-temps. Constaté le 10/11/2026 : library.ts rappelle build() à chaque broadcast() (le profil
// social redessine 250 ms après chaque changement), et les écrans qui effaçaient leur message dans
// build() le perdaient avant qu'on l'ait lu (« Nom changé », « Avatar enregistré », « Pseudo refusé »).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');
const APP_SRC = path.join(REPO_ROOT, 'app', 'src');

interface Built {
  sections: { rows: { text: string; tone?: string }[] }[];
  actions: { label: string; run: () => void }[];
}
type Build = () => Built;

/* eslint-disable @typescript-eslint/no-require-imports */
const { userGesture, onGesture } = require(path.join(APP_DIST, 'gesture-flash.js')) as { userGesture(): void; onGesture(clear: () => void): () => void };
const { createLiveScoresMenu } = require(path.join(APP_DIST, 'live-scores-menu.js')) as { createLiveScoresMenu(host: object): { run(): void } };
/* eslint-enable @typescript-eslint/no-require-imports */

test('un geste efface les messages abonnés, et seulement eux ; un abonnement se retire', () => {
  let a: string | undefined = 'Nom changé';
  let b: string | undefined = 'Avatar enregistré';
  const stopA = onGesture(() => (a = undefined));
  const stopB = onGesture(() => (b = undefined));
  userGesture();
  assert.equal(a, undefined);
  assert.equal(b, undefined);
  // Posé par l'action qui suit le geste : il reste jusqu'au geste d'après.
  a = 'Pseudo refusé';
  stopA();
  userGesture();
  assert.equal(a, 'Pseudo refusé', 'désabonné : plus effacé');
  stopB();
});

test('un écran redessiné sans geste montre le même message ; le geste suivant l’efface (Scores des amis pendant la partie)', () => {
  const opened: { build: Build; at?: number }[] = [];
  let settings = { place: 'auto', dmd: true };
  const menu = createLiveScoresMenu({
    library: { openCustom: (build: Build, at?: number) => opened.push({ build, at }), openSystem: () => undefined },
    get: () => settings,
    set: (s: typeof settings) => (settings = s),
    cabinet: () => ({ backglass: true, topper: false, dmd: true, inspector: true }),
  });
  menu.run();
  const message = () => opened.at(-1)!.build().sections[0]!.rows[0]!.text;
  assert.equal(message(), 'Pendant une partie entre amis, où voir le score et la bille des autres joueurs', 'aucun message à l’ouverture');
  // Le geste (library.ts) précède l'action, qui pose son message.
  userGesture();
  opened.at(-1)!.build().actions.find((a) => a.label === 'En bas du plateau')!.run();
  assert.equal(message(), 'Scores des amis : En bas du plateau');
  // Redessins sans geste (un broadcast() qui ne vient pas de l'utilisateur) : le message reste.
  assert.equal(message(), 'Scores des amis : En bas du plateau');
  assert.equal(message(), 'Scores des amis : En bas du plateau');
  userGesture();
  assert.notEqual(message(), 'Scores des amis : En bas du plateau', 'le geste suivant l’efface');
});

/**
 * Détection : aucun écran ne doit effacer son message en le lisant (« const row = flash; flash =
 * undefined; », « rows.push(flash); flash = undefined; »). Un message se lit dans build() et ne
 * s'efface qu'au geste suivant (onGesture, gesture-flash.ts) ou dans une action.
 */
test('aucun écran du menu n’efface son message en le lisant', () => {
  const consumed = /(?:=\s*|push\()([\w.]*(?:flash|notice)\w*)\)?;\s*\n\s*\1 = undefined;/gi;
  const found: string[] = [];
  for (const file of fs.readdirSync(APP_SRC).filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(path.join(APP_SRC, file), 'utf8').replace(/\r\n/g, '\n');
    for (const m of text.matchAll(consumed)) found.push(`${file}:${text.slice(0, m.index).split('\n').length} (${m[1]})`);
  }
  assert.deepEqual(found, [], 'message effacé au dessin : passer par onGesture (app/src/gesture-flash.ts)');
});
