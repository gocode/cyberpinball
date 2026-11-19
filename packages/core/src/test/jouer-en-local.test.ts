// « Jouer en local » (localplay.ts, app/src/local-play.ts) : un seul réglage retire toute la partie
// sociale, niveaux compris (demande d'un joueur, 18/11/2026). Ces tests fixent la classe de problème :
// toute entrée de la rubrique Communauté, présente ou ajoutée plus tard, disparaît en jeu local ;
// rien d'autre ne disparaît (la mise à jour surtout) ; chaque surface sociale du front-end le lit.

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { hiddenInLocalPlay, LOCAL_PLAY_HIDDEN } from '../localplay';
import { newSocialState, parseSocialState } from '../social';
import { isSystemGroup, SYSTEM_GROUPS, SYSTEM_ITEM_IDS, type SystemItemId } from '../systemmenu';
import { frontendSource, librarySource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

test('jouer en local : toute la rubrique Communauté part, sauf l’interrupteur, placé en dernier', () => {
  const entries = SYSTEM_GROUPS.amis.entries;
  assert.equal(entries.at(-1), 'local-play', '« Jouer en local » ferme la rubrique');
  for (const id of entries) {
    if (isSystemGroup(id)) continue;
    assert.equal(hiddenInLocalPlay(id, true), id !== 'local-play', id);
    assert.equal(hiddenInLocalPlay(id, false), false, `${id} reste quand la communauté est là`);
  }
});

test('jouer en local : seule la part sociale de Mon compte part, jamais la mise à jour ni le reste', () => {
  const social = new Set<SystemItemId>([...SYSTEM_GROUPS.amis.entries.filter((id): id is SystemItemId => !isSystemGroup(id)), 'badges', 'public-profile', 'account-privacy']);
  for (const id of LOCAL_PLAY_HIDDEN) assert.ok(social.has(id), `${id} n’est pas social : il ne doit pas disparaître`);
  for (const id of ['updates', 'news', 'feedback', 'backups', 'downloads', 'phone-remote', 'account', 'player-name', 'avatar', 'country', 'guest-mode'] as const) {
    assert.ok((SYSTEM_ITEM_IDS as readonly string[]).includes(id), id);
    assert.equal(hiddenInLocalPlay(id, true), false, `${id} reste en jeu local`);
  }
});

test('jouer en local : le réglage est relu du fichier du joueur, absent par défaut', () => {
  const fresh = newSocialState();
  assert.equal(parseSocialState(JSON.parse(JSON.stringify(fresh)))?.localPlay, undefined);
  const local = parseSocialState(JSON.parse(JSON.stringify({ ...fresh, enabled: false, localPlay: true })));
  assert.equal(local?.localPlay, true);
  assert.equal(local?.enabled, false);
  assert.equal(parseSocialState(JSON.parse(JSON.stringify({ ...fresh, localPlay: 'oui' })))?.localPlay, undefined);
});

test('jouer en local : l’écran confirme, puis bascule par le réseau des bornes', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createLocalPlayItem } = require(path.join(REPO_ROOT, 'app', 'dist', 'local-play.js')) as { createLocalPlayItem(host: unknown): { readonly label?: string; run(): void } };
  let state = { ...newSocialState() } as ReturnType<typeof newSocialState>;
  let built: (() => { actions: { label: string; run: () => unknown }[] }) | undefined;
  let backs = 0;
  const item = createLocalPlayItem({
    net: {
      state: () => state,
      setLocalPlay: async (on: boolean) => {
        state = on ? { ...state, localPlay: true, enabled: false } : (({ localPlay: _, ...rest }) => ({ ...rest, enabled: true }))(state);
      },
    },
    library: { openCustom: (build: typeof built) => (built = build), openSystem: () => backs++ },
    redraw: () => undefined,
  });
  assert.equal(item.label, 'Jouer en local');
  item.run();
  const on = built!().actions.find((a) => a.label === 'Jouer en local')!;
  await on.run();
  assert.equal(state.localPlay, true);
  assert.equal(state.enabled, false);
  assert.equal(item.label, 'Jouer en local : activé');
  assert.equal(backs, 1, 'retour à la rubrique, qui ne garde que l’interrupteur');
  item.run();
  await built!().actions.find((a) => a.label === 'Remettre la communauté')!.run();
  assert.equal(state.localPlay, undefined);
  assert.equal(state.enabled, true);
});

test('jouer en local : chaque surface sociale du front-end le lit', () => {
  const front = frontendSource();
  const library = librarySource();
  // Médaillon Communauté (roue et téléphone), carte du joueur et badges, pastille des messages, carte d'un ami au fronton.
  assert.match(front, /function communityShown\(\): boolean \{\s*return mediaSettings\.community && !guest\.active && !localPlay\(\);/);
  assert.match(front, /const player = [^;]*!localPlay\(\) \? playerCard\(\)/);
  assert.match(front, /const inbox = socialClosed\(\) \? undefined/);
  assert.match(front, /friendCard: [^,]*!socialClosed\(\)/);
  // Moments de badge et de niveau ; Communauté au téléphone ; pare-feu ; « Essayer » des Nouveautés.
  assert.match(front, /function levelMomentShowing\(\): boolean \{\s*return !!levelTracker\.pending\(\) && !localPlay\(\)/);
  assert.match(front, /if \(!pending \|\| !levelMomentShowing\(\)\)/);
  assert.match(front, /function remoteCommunity\([^)]*\): RemoteCommunity \{\s*if \(guest\.active\) return \{[^\n]*\n\s*if \(localPlay\(\)\) return \{ closed:/);
  assert.match(front, /!report\.problems\.length \|\| localPlay\(\)\) return;/);
  assert.match(front, /case 'level':\s*return localPlay\(\) \? \{ gone: local \}/);
  assert.match(front, /localPlay: \(\) => localPlay\(\)/);
  // Menu système (borne et téléphone), fiche et tableau des scores.
  assert.match(library, /!hiddenInLocalPlay\(id, local\) && \(group !== undefined/);
  assert.match(library, /if \(!item \|\| hiddenInLocalPlay\(id, localPlay\(\)\)\) return back\(\);/);
  assert.match(library, /if \(!item \|\| hiddenInLocalPlay\(id, local\)\) return undefined;/);
  assert.match(library, /host\.playWithFriend && !localPlay\(\)/);
  assert.match(library, /host\.instantGame && !localPlay\(\)/);
  assert.match(library, /const scope = local \? 'cabinet' : s\.scope;/);
});
