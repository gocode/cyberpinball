// « Votre profil de joueur » (app/src/profile-welcome.ts, compilé), proposé au premier démarrage du
// menu : seulement à un profil encore anonyme (nom donné d'office, aucun avatar), une seule fois
// (noté dans social.json dès l'ouverture) ; le pseudo au clavier à l'écran, l'avatar par « Mon
// avatar », et « Continuer » ou Exit rendent la main à la suite du premier démarrage.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { hasDefaultName, loadSocial, newSocialState, parseSocialState, profileWelcomeDue, shortTag } from '../social';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

interface Action {
  label: string;
  tone?: string;
  icon?: string;
  run: () => void;
}
interface Built {
  heading: string;
  sections: { rows: { text: string; tone?: string }[] }[];
  actions: Action[];
  back: () => void;
}
type Build = () => Built;

/* eslint-disable @typescript-eslint/no-require-imports */
const { userGesture } = require(path.join(APP_DIST, 'gesture-flash.js')) as { userGesture(): void };
const { createProfileWelcome } = require(path.join(APP_DIST, 'profile-welcome.js')) as { createProfileWelcome(host: object): { open(done: () => void): void } };
const { createSocialNet } = require(path.join(APP_DIST, 'social-net.js')) as {
  createSocialNet(o: object): { state(): { name: string; key: { publicKey: string }; avatar?: string; profileOffered?: string }; rename(name: string): boolean; avatarFile(key: string): string | undefined; markProfileOffered(): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('le profil est proposé une fois, et seulement tant que ni le pseudo ni l’avatar ne sont choisis', () => {
  const fresh = newSocialState();
  assert.ok(hasDefaultName(fresh));
  assert.ok(profileWelcomeDue(fresh));
  // Nom d'office écrit dans l'autre langue (la langue a changé depuis) : toujours celui d'office.
  assert.ok(profileWelcomeDue({ ...fresh, name: `Player ${shortTag(fresh.key.publicKey)}` }));
  // Un nom qui finit par l'étiquette d'une autre clé n'est pas celui d'office.
  const other = newSocialState();
  if (shortTag(other.key.publicKey) !== shortTag(fresh.key.publicKey)) assert.ok(!hasDefaultName({ ...fresh, name: other.name }));
  assert.ok(!profileWelcomeDue({ ...fresh, name: 'Alexis' }), 'pseudo choisi');
  assert.ok(!profileWelcomeDue({ ...fresh, name: 'Alexis Martin' }), 'pseudo de deux mots');
  assert.ok(!profileWelcomeDue({ ...fresh, avatar: 'moi.jpg' }), 'avatar choisi');
  assert.ok(!profileWelcomeDue({ ...fresh, profileOffered: new Date().toISOString() }), 'déjà proposé');
  // La date se relit ; une valeur illisible est écartée.
  const at = new Date().toISOString();
  assert.equal(parseSocialState(JSON.parse(JSON.stringify({ ...fresh, profileOffered: at })))!.profileOffered, at);
  assert.equal(parseSocialState(JSON.parse(JSON.stringify({ ...fresh, profileOffered: 'hier' })))!.profileOffered, undefined);
});

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-profile-welcome-'));
  const net = createSocialNet({ dataDir: dir, mode: 'off' });
  const opened: { build: Build; at?: number }[] = [];
  const prompts: { heading: string; value: string; done: (value: string | undefined) => void }[] = [];
  const avatarBacks: (() => void)[] = [];
  let finished = 0;
  const welcome = createProfileWelcome({
    library: {
      openCustom: (build: Build, at?: number) => opened.push({ build, at }),
      openPrompt: (heading: string, _label: string, value: string, done: (value: string | undefined) => void) => prompts.push({ heading, value, done }),
    },
    net,
    avatarMenu: { open: (back: () => void) => avatarBacks.push(back) },
  });
  welcome.open(() => finished++);
  return { dir, net, opened, prompts, avatarBacks, finished: () => finished, last: () => opened.at(-1)! };
}

test('« Votre profil de joueur » : noté dès l’ouverture, pseudo, avatar, puis la suite du démarrage', () => {
  const { dir, net, opened, prompts, avatarBacks, finished, last } = setup();
  // Noté tout de suite, et sur le disque : il ne revient pas au prochain démarrage.
  assert.ok(net.state().profileOffered);
  assert.ok(!profileWelcomeDue(loadSocial(dir)));

  let built = last().build();
  assert.equal(built.heading, 'Votre profil de joueur');
  assert.equal(last().at, 0, 'sélection sur le pseudo');
  assert.deepEqual(built.actions.map((a) => a.label), ['Choisir mon pseudo…', 'Mettre un avatar…', 'Continuer']);
  assert.equal(new Set(built.actions.map((a) => a.icon)).size, built.actions.length, 'une icône par action');
  assert.equal(built.actions[0]!.tone, 'ok', 'le geste attendu en vert');

  // Pseudo refusé : le champ part vide (le nom d'office ne se garde pas en tapant), l'erreur s'affiche.
  built.actions[0]!.run();
  assert.equal(prompts.at(-1)!.value, '');
  prompts.at(-1)!.done('x');
  assert.equal(last().at, 0);
  assert.equal(last().build().sections[0]!.rows[0]!.tone, 'error');
  // Redessiné (changement du profil, minuteur du menu) : le message reste jusqu'au geste suivant.
  assert.equal(last().build().sections[0]!.rows[0]!.tone, 'error');
  assert.ok(hasDefaultName(net.state()));

  // Pseudo accepté : la sélection passe à l'avatar, qui devient le geste attendu.
  last().build().actions[0]!.run();
  prompts.at(-1)!.done('Alexis');
  assert.equal(net.state().name, 'Alexis');
  assert.equal(last().at, 1);
  built = last().build();
  assert.equal(built.sections[0]!.rows[0]!.text, 'Pseudo choisi : Alexis');
  assert.equal(last().build().sections[0]!.rows[0]!.text, 'Pseudo choisi : Alexis', 'gardé au redessin');
  // Le geste suivant (library.ts) l'efface.
  userGesture();
  assert.notEqual(last().build().sections[0]!.rows[0]!.text, 'Pseudo choisi : Alexis', 'effacé au geste suivant');
  assert.equal(built.actions[0]!.label, 'Changer de pseudo…');
  assert.equal(built.actions[1]!.tone, 'ok');
  // Le champ repart du pseudo choisi.
  built.actions[0]!.run();
  assert.equal(prompts.at(-1)!.value, 'Alexis');
  prompts.at(-1)!.done(undefined);
  assert.equal(last().at, 0, 'abandon : rien ne change');

  // Avatar : « Mon avatar » s'ouvre ; revenu sans image, la sélection reste sur l'avatar.
  last().build().actions[1]!.run();
  assert.equal(avatarBacks.length, 1);
  const before = opened.length;
  avatarBacks[0]!();
  assert.equal(opened.length, before + 1);
  assert.equal(last().at, 1);

  // Continuer, ou Exit : la suite du premier démarrage.
  last().build().actions[2]!.run();
  assert.equal(finished(), 1);
  last().build().back();
  assert.equal(finished(), 2);
});
