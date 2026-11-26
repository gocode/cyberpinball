// L'aperçu sonore d'une carte de l'écran des tables (un son proposé, joué quand sa carte est
// choisie) n'était arrêté que par un nouveau rendu de cet écran : une partie lancée pendant qu'il
// jouait l'entendait en boucle par-dessus la musique de la table ou de son PuP-Pack (26/11/2026).
// Invariant : à chaque état hors de l'écran des tables, plus un son de ses aperçus ne joue.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import * as vm from 'node:vm';
import { REPO_ROOT } from './i18n-scan';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');

test('aperçu sonore de l’écran des tables : arrêté à chaque état hors de cet écran', () => {
  const library = read('app', 'renderer', 'library.js');
  const source = library.match(/function silenceLibraryMedia\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'silenceLibraryMedia absente de library.js');
  const node = (tagName: string) => ({ tagName, paused: false, pause() { this.paused = true; } });
  const audio = node('AUDIO');
  const video = node('VIDEO');
  const sandbox = { mediaNodes: new Map<string, unknown>([['audio a', audio], ['video v', video]]), playingAudio: audio as unknown };
  vm.runInNewContext(`${source}\nsilenceLibraryMedia();`, sandbox);
  assert.equal(audio.paused, true);
  assert.equal(sandbox.playingAudio, null);
  // Une vidéo d'aperçu reste telle quelle : muette, elle reprend au retour sur l'écran.
  assert.equal(video.paused, false);

  // Branché avec les autres sons du front-end, avant le rendu de la partie (renderGame).
  const frontend = read('app', 'renderer', 'frontend.js');
  const call = frontend.indexOf("if (s.phase !== 'library' && typeof silenceLibraryMedia === 'function') silenceLibraryMedia();");
  assert.ok(call > 0, 'appel absent de frontend.js');
  assert.ok(call < frontend.indexOf('if (s.game) return renderGame(s)'), 'appel placé après le rendu de la partie');
});
