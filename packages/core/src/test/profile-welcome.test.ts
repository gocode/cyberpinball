// « Votre profil de joueur » (app/src/profile-welcome.ts, compilé), au démarrage du menu : le pseudo
// est obligatoire. L'écran revient à chaque démarrage tant que le profil porte le nom donné d'office
// (même déjà vu, même avec un avatar) ; « Continuer » reste grisé et Exit ne fait que rappeler le
// pseudo tant qu'il manque ; le nom d'office retapé n'en est pas un. L'avatar reste facultatif.

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

test('le profil revient à chaque démarrage tant que le pseudo n’est pas choisi', () => {
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
  // Le pseudo est obligatoire : ni un avatar, ni l'écran déjà vu ne l'en dispensent.
  const avatar = 'moi.jpg';
  assert.ok(profileWelcomeDue({ ...fresh, ...{ avatar } }), 'avatar sans pseudo');
  const profileOffered = new Date().toISOString();
  assert.ok(profileWelcomeDue({ ...fresh, ...{ profileOffered } }), 'déjà vu, toujours sans pseudo');
  // La date de la première ouverture se relit ; une valeur illisible est écartée.
  assert.equal(parseSocialState(JSON.parse(JSON.stringify({ ...fresh, profileOffered })))!.profileOffered, profileOffered);
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

test('« Votre profil de joueur » : pas de sortie sans pseudo, avatar facultatif, puis la suite du démarrage', () => {
  const { dir, net, opened, prompts, avatarBacks, finished, last } = setup();
  // Première ouverture notée, mais l'écran reviendra tant que le pseudo manque.
  assert.ok(net.state().profileOffered);
  assert.ok(profileWelcomeDue(loadSocial(dir)));

  let built = last().build();
  assert.equal(built.heading, 'Ton profil de joueur');
  assert.equal(last().at, 0, 'sélection sur le pseudo');
  assert.deepEqual(built.actions.map((a) => a.label), ['Choisir mon pseudo…', 'Mettre un avatar…', 'Continuer']);
  assert.equal(new Set(built.actions.map((a) => a.icon)).size, built.actions.length, 'une icône par action');
  assert.equal(built.actions[0]!.tone, 'ok', 'le geste attendu en vert');
  assert.equal(built.actions[2]!.tone, 'quiet', '« Continuer » grisé sans pseudo');
  assert.equal(built.sections[0]!.rows[0]!.text, 'Pseudo : à choisir', 'le nom d’office n’est pas montré comme un pseudo');

  // Sans pseudo, ni « Continuer » ni Exit ne quittent l'écran : le rappel s'affiche, la sélection revient au pseudo.
  built.actions[2]!.run();
  last().build().back();
  assert.equal(finished(), 0, 'pas de sortie sans pseudo');
  assert.equal(last().at, 0);
  assert.equal(last().build().sections[0]!.rows[0]!.tone, 'warning');
  userGesture();

  // Pseudo refusé : le champ part vide (le nom d'office ne se garde pas en tapant), l'erreur s'affiche.
  last().build().actions[0]!.run();
  assert.equal(prompts.at(-1)!.value, '');
  prompts.at(-1)!.done('x');
  assert.equal(last().at, 0);
  assert.equal(last().build().sections[0]!.rows[0]!.tone, 'error');
  // Redessiné (changement du profil, minuteur du menu) : le message reste jusqu'au geste suivant.
  assert.equal(last().build().sections[0]!.rows[0]!.tone, 'error');
  assert.ok(hasDefaultName(net.state()));

  // Le nom d'office retapé tel quel n'est pas un pseudo choisi : toujours bloqué.
  last().build().actions[0]!.run();
  prompts.at(-1)!.done(`Player ${shortTag(net.state().key.publicKey)}`);
  assert.equal(last().at, 0);
  assert.equal(last().build().sections[0]!.rows[0]!.tone, 'error');
  last().build().back();
  assert.equal(finished(), 0, 'nom d’office : toujours pas de sortie');
  userGesture();

  // Avatar sans pseudo : facultatif, et ne dispense pas du pseudo.
  last().build().actions[1]!.run();
  avatarBacks.at(-1)!();
  last().build().actions[2]!.run();
  assert.equal(finished(), 0);
  userGesture();

  // Pseudo accepté : la sélection passe à l'avatar, qui devient le geste attendu.
  last().build().actions[0]!.run();
  prompts.at(-1)!.done('Alexis');
  assert.equal(net.state().name, 'Alexis');
  assert.ok(!profileWelcomeDue(loadSocial(dir)), 'pseudo choisi : l’écran ne revient plus');
  assert.equal(last().at, 1);
  built = last().build();
  assert.equal(built.sections[0]!.rows[0]!.text, 'Pseudo choisi : Alexis');
  assert.equal(last().build().sections[0]!.rows[0]!.text, 'Pseudo choisi : Alexis', 'gardé au redessin');
  // Le geste suivant (library.ts) l'efface.
  userGesture();
  assert.notEqual(last().build().sections[0]!.rows[0]!.text, 'Pseudo choisi : Alexis', 'effacé au geste suivant');
  assert.equal(built.actions[0]!.label, 'Changer de pseudo…');
  assert.equal(built.actions[1]!.tone, 'ok');
  assert.notEqual(built.actions[2]!.tone, 'quiet', '« Continuer » disponible');
  // Le champ repart du pseudo choisi.
  built.actions[0]!.run();
  assert.equal(prompts.at(-1)!.value, 'Alexis');
  prompts.at(-1)!.done(undefined);
  assert.equal(last().at, 0, 'abandon : rien ne change');

  // Avatar : « Mon avatar » s'ouvre ; revenu sans image, la sélection reste sur l'avatar.
  last().build().actions[1]!.run();
  const before = opened.length;
  avatarBacks.at(-1)!();
  assert.equal(opened.length, before + 1);
  assert.equal(last().at, 1);

  // Pseudo choisi : Continuer, ou Exit, rendent la main à la suite du démarrage.
  last().build().actions[2]!.run();
  assert.equal(finished(), 1);
  last().build().back();
  assert.equal(finished(), 2);
});
