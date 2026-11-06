// Télécommande du téléphone, de bout en bout, dans un vrai Chromium hors écran : le navigateur
// intégré (acquire-window.ts) sur une fausse page de connexion, un téléphone simulé (la vraie page
// du téléphone, servie par la borne) qui lit le QR code, est accepté par Start, déplace le
// pointeur, clique, tape (accents, émoji, effacement, mot de passe, Entrée), ouvre un lien par un
// appui long, revient, avance, se déconnecte ; puis ce qui doit être refusé (autre hôte, autre
// origine, QR déjà servi, Exit, touche interdite, trame rejouée, clé inconnue) et Fermer, qui
// coupe l'écoute. Le scénario est interne/demos/demo-telecommande.cjs, ici sans captures. Tout sur
// 127.0.0.1 ; aucune fenêtre n'apparaît (rendu hors écran).
// Et l'invariant du réseau : seuls social-net.ts et phone-remote.ts écoutent, la télécommande sur
// 127.0.0.1 hors du réseau local réel, jamais pendant un essai.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { DEMOS, withoutInternal } from './interne';

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO_ROOT] })) as string;
  } catch {
    return undefined;
  }
}
const electron = process.platform === 'win32' ? electronPath() : undefined;

test('télécommande du téléphone : appairage, injection et refus, de bout en bout', { skip: (electron ? false : 'Electron sous Windows requis') || withoutInternal(), timeout: 240_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-telecommande-'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'simule', CP_TELECOMMANDE_OUT: dir, CP_TELECOMMANDE_CAPTURES: '0', CYBERPINBALL_LANGUE: 'fr' };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.CYBERPINBALL_A_L_ECRAN;
    const run = runElectron(electron!, [path.join(DEMOS, 'demo-telecommande.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 220_000, cwd: REPO_ROOT });
    const result = fs.existsSync(path.join(dir, 'resultat.txt')) ? fs.readFileSync(path.join(dir, 'resultat.txt'), 'utf8') : `${run.stdout}\n${run.stderr}`;
    assert.equal(run.status, 0, result);
    assert.doesNotMatch(result, /ÉCHEC/, result);
    // Le scénario a bien tout parcouru (une vérification sautée se verrait ici).
    assert.ok((result.match(/^OK /gm) ?? []).length >= 40, result);
    for (const step of ['même code sur la borne et sur le téléphone', 'Start accepte le téléphone', 'accents et émoji arrivent tels quels', 'le mot de passe tapé au téléphone arrive dans le champ', 'Entrée envoie le formulaire de la page', 'appui long, « Ouvrir le lien »', 'deux doigts : la page défile', 'Exit refuse le téléphone qui attend', 'une trame rejouée coupe la liaison', 'plus rien n’écoute après la fermeture']) assert.match(result, new RegExp(`OK +${step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), step);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('télécommande du téléphone dans tout le menu : boutons, clavier à l’écran, envoi d’un fichier, refus, de bout en bout', { skip: (electron ? false : 'Electron sous Windows requis') || withoutInternal(), timeout: 240_000 }, () => {
  // interne/demos/demo-telecommande-menu.cjs : la vraie gestion des tables (library.ts) hors écran, la vraie
  // page du téléphone ; le QR lu sur la capture de l'écran, Start, les boutons tenus, la saisie,
  // l'envoi octet pour octet ; puis les refus, une partie, le navigateur intégré, l'inactivité,
  // Déconnecter et la fermeture. Le garde-fou de mise en page relit chaque écran de la borne.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-telecommande-menu-'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'simule', CP_TELECOMMANDE_OUT: dir, CP_TELECOMMANDE_CAPTURES: '0', CYBERPINBALL_LANGUE: 'fr' };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.CYBERPINBALL_A_L_ECRAN;
    const run = runElectron(electron!, [path.join(DEMOS, 'demo-telecommande-menu.cjs'), `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, timeout: 220_000, cwd: REPO_ROOT });
    const result = fs.existsSync(path.join(dir, 'resultat.txt')) ? fs.readFileSync(path.join(dir, 'resultat.txt'), 'utf8') : `${run.stdout}\n${run.stderr}`;
    assert.equal(run.status, 0, result);
    assert.doesNotMatch(result, /ÉCHEC/, result);
    assert.ok((result.match(/^OK /gm) ?? []).length >= 45, result);
    for (const step of [
      'le QR code de l’écran se lit sur la capture',
      'Start accepte le téléphone : il pilote le menu',
      'Exit au téléphone ferme l’écran',
      'un flipper tenu au téléphone se répète',
      'ce qui est tapé au téléphone remplace le texte du clavier à l’écran',
      'Valider au téléphone : Entrée du clavier à l’écran',
      'le fichier envoyé arrive dans le dossier d’import, octet pour octet',
      'même nom déjà pris : « (2) »',
      'plus de 2 Go : refusé',
      'mode invité : envoi refusé',
      'un nom qui remonte les dossiers reste dans le dossier d’import',
      'un morceau scellé pour une autre connexion est refusé',
      'le même morceau rejoué est refusé',
      'les boutons du téléphone ne font rien pendant la partie',
      '« Récupérer » fermé : le téléphone revient aux boutons du menu',
      'le QR code sous le clavier à l’écran se lit sur la capture',
      'Start accepte le téléphone sans taper de touche',
      'sans geste au menu, la liaison se coupe',
      'plus de QR affiché ni de téléphone : plus rien n’écoute',
      'Cyber Pinball se ferme : le téléphone l’apprend',
      'garde-fou de mise en page',
    ])
      assert.match(result, new RegExp(`OK +${step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), step);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('réseau : seuls social-net.ts et phone-remote.ts écoutent ; la télécommande, seulement sur le réseau local réel', () => {
  const src = path.join(REPO_ROOT, 'app', 'src');
  const listeners = fs
    .readdirSync(src)
    .filter((f) => f.endsWith('.ts') && /createServer\(|\.listen\(/.test(fs.readFileSync(path.join(src, f), 'utf8')))
    .sort();
  assert.deepEqual(listeners, ['phone-remote.ts', 'social-net.ts']);
  const remote = fs.readFileSync(path.join(src, 'phone-remote.ts'), 'utf8');
  // Une seule écoute, à l'hôte de remoteListenHost ; toute connexion hors du réseau local coupée avant lecture.
  assert.deepEqual([...remote.matchAll(/\.listen\((.*)\);/g)].map((m) => m[1]), ['0, remoteListenHost(mode), () => resolve()']);
  assert.match(remote, /on\('connection', \(socket\) => \{[\s\S]{0,200}isLocalNetworkAddress\(socket\.remoteAddress\)/);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { phoneRemoteMode, remoteListenHost } = require(path.join(REPO_ROOT, 'app', 'dist', 'phone-remote.js')) as {
    phoneRemoteMode(env: NodeJS.ProcessEnv): string;
    remoteListenHost(mode: string): string;
  };
  assert.equal(phoneRemoteMode({}), 'lan', 'usage normal : le réseau local');
  for (const env of [{ CYBERPINBALL_RESEAU: 'simule' }, { CYBERPINBALL_AUTOPILOT: 'Digit1' }, { CYBERPINBALL_DISPLAYS: 'x.json' }, { CYBERPINBALL_CAPTURE: 'tmp' }]) assert.equal(phoneRemoteMode(env), 'loopback', JSON.stringify(env));
  assert.equal(phoneRemoteMode({ CYBERPINBALL_RESEAU: 'non' }), 'off');
  assert.equal(remoteListenHost('loopback'), '127.0.0.1');
  // Sans règle du pare-feu de Cyber Pinball, rien n'écoute sur le réseau (Windows afficherait son invite).
  assert.match(remote, /if \(state !== 'allowed'\) \{[\s\S]{0,600}return;/);
});

test('chiffrement : jamais par node:crypto côté borne (Electron, avec BoringSSL, n’a pas ChaCha20-Poly1305)', () => {
  for (const file of [path.join(REPO_ROOT, 'packages', 'core', 'src', 'remote.ts'), path.join(REPO_ROOT, 'app', 'src', 'phone-remote.ts')]) {
    const code = fs.readFileSync(file, 'utf8').split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.doesNotMatch(code, /createCipheriv|createDecipheriv/, path.basename(file));
  }
});
