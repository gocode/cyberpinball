// Le son dans le casque (essai du 10 novembre 2026 : le son restait sur le PC, jamais dans les
// écouteurs du casque, ni au menu ni en partie).

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { headsetAudioOutput, normalizeVrAudioChoice, vrAudioChoiceFor, vrAudioChoices, vrAudioOutput, vrAudioSettings } from '../vr-profil';
import { frontendSource } from './frontend-source';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');
const out = (friendlyName: string) => {
  const m = /^(.*?) \((.*)\)$/.exec(friendlyName);
  return { friendlyName, deviceDesc: m?.[1] ?? friendlyName, interfaceName: m?.[2] ?? '' };
};

test('son dans le casque : la sortie du casque trouvée sur des critères généraux, jamais une sortie du PC', () => {
  // Les sorties du PC de l'essai : celle de Link est retenue, ni Realtek, ni l'USB, ni « Steam Streaming ».
  const pc = ['Haut-parleurs (USB Audio Device)', 'Casque (Oculus Virtual Audio Device)', 'Haut-parleurs/écouteurs (Realtek(R) Audio)', 'Haut-parleurs (Steam Streaming Microphone)', 'Haut-parleurs (Steam Streaming Speakers)'].map(out);
  assert.equal(headsetAudioOutput(pc)?.friendlyName, 'Casque (Oculus Virtual Audio Device)');
  // D'autres casques et runtimes, sans nom figé d'un seul modèle.
  for (const name of ['Headphones (Valve Index Headset)', 'Speakers (HTC VIVE USB Audio)', 'Headphones (HP Reverb G2)', 'Écouteurs (Pico 4)', 'Headset Earphone (Varjo Aero)', 'Speakers (SteamVR Audio)'])
    assert.equal(headsetAudioOutput([out('Speakers (Realtek(R) Audio)'), out(name)])?.friendlyName, name, name);
  // Aucune : undefined, le son reste sur la sortie de la configuration.
  assert.equal(headsetAudioOutput([out('Speakers (Realtek(R) Audio)'), out('Haut-parleurs (Steam Streaming Speakers)')]), undefined);
  assert.equal(headsetAudioOutput(undefined), undefined);
  // VPX : le son de la table et celui du fronton (ROM, PuP, musique) sur cette sortie.
  assert.deepEqual(vrAudioSettings('Casque (Oculus Virtual Audio Device)').map((s) => `${s.section}.${s.key}=${s.value}`), [
    'Player.SoundDevice=Casque (Oculus Virtual Audio Device)',
    'Player.SoundDeviceBG=Casque (Oculus Virtual Audio Device)',
  ]);
});

test('son dans le casque : le menu, le Juke-box et la partie dans le casque y passent, la borne garde sa sortie hors du casque', () => {
  const frontend = frontendSource();
  // Le menu (musique, sons de l'interface, Juke-box) : la sortie du casque tant que le menu y est.
  assert.match(frontend, /function menuOutput\(\): string \| undefined \{\s*return headset\?\.inUse \? \(findHeadsetAudio\(\) \?\? audioOutput\) : audioOutput;/);
  assert.doesNotMatch(frontend, /output: \(\) => audioOutput,/);
  assert.doesNotMatch(frontend, /output: audioOutput \}/);
  // La partie dans le casque : l'INI de la VR seulement.
  const debut = frontend.indexOf('function prepareVr(');
  const prepare = frontend.slice(debut, frontend.indexOf('function ', debut + 20)); // toute la fonction, quelle que soit sa longueur
  assert.match(prepare, /const audio = findHeadsetAudio\(\);\s*if \(audio\) \{\s*writeIniSettings\(vr\.ini, vrAudioSettings\(audio\)\);/);
  assert.equal(frontend.match(/vrAudioSettings\(/g)?.length, 1);
});

test('son en VR : le joueur choisit la sortie (automatique, la borne, ou une sortie de Windows)', () => {
  const outs = ['Casque (Oculus Virtual Audio Device)', 'Haut-parleurs (Realtek(R) Audio)', 'Speakers (NVIDIA High Definition Audio)'].map(out);
  // Automatique (défaut) : le comportement d'avant, rien ne change pour le Quest via Link.
  assert.equal(vrAudioOutput('auto', outs)?.friendlyName, 'Casque (Oculus Virtual Audio Device)');
  // La borne : jamais de sortie forcée, le son reste sur la sortie de la configuration.
  assert.equal(vrAudioOutput('config', outs), undefined);
  // Une sortie nommée (un Pimax dont le nom n'est pas reconnu), ou, si elle a disparu, l'automatique.
  assert.equal(vrAudioOutput(vrAudioChoiceFor('Speakers (NVIDIA High Definition Audio)'), outs)?.friendlyName, 'Speakers (NVIDIA High Definition Audio)');
  assert.equal(vrAudioOutput(vrAudioChoiceFor('Disparue'), outs)?.friendlyName, 'Casque (Oculus Virtual Audio Device)');
  assert.equal(vrAudioOutput(vrAudioChoiceFor('Disparue'), outs.slice(1)), undefined);
  // Le fichier : toute valeur inconnue vaut automatique.
  assert.equal(normalizeVrAudioChoice(undefined), 'auto');
  assert.equal(normalizeVrAudioChoice('sortie:'), 'auto');
  assert.equal(normalizeVrAudioChoice('config'), 'config');
  assert.equal(normalizeVrAudioChoice('sortie:X'), 'sortie:X');
  assert.deepEqual(vrAudioChoices(outs.slice(0, 1)), ['auto', 'config', 'sortie:Casque (Oculus Virtual Audio Device)']);
  // Le front-end applique le choix à l'unique point de recherche du casque (menu et partie).
  assert.match(frontendSource(), /const choice = readVrAudio\(loc\.dataDir\);/);
  assert.match(frontendSource(), /library\.provideSystemItem\('vr-audio', \{/);
});
