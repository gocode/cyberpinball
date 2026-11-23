// Tutoiement, toujours (CLAUDE.md : « Tutoiement, toujours » dans l'interface, le manuel, les notes de version et
// les réponses publiques). Ce test fixe l'invariant pour l'interface : aucun texte français de l'écran, de la page du
// téléphone ou du catalogue ne dit « vous », « votre », « vos » ni « veuillez ». Le joueur qui tient la manette est
// toujours « tu » ; son profil, sa borne, ses amis sont « ton », « ta », « tes ».
// Un vouvoiement qui n'en est pas un (une citation, un texte juridique, un exemple) se déclare dans EXCEPTIONS,
// avec sa raison : la liste reste courte et lisible.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EN_PARTS } from '../i18n/en';
import { REPO_ROOT, interfaceSources, scanFile } from './i18n-scan';

/** Les formes du vouvoiement : pronom, possessifs, « veuillez » (et « vous-même »). */
export const VOUVOIEMENT = /\b(vous|votre|vos|veuillez|vôtres?)\b/i;

/**
 * Le vouvoiement sans pronom : un verbe à la 2e personne du pluriel (« Choisissez », « Vérifiez », « faites »,
 * « êtes »). Mots en -ez qui n'en sont pas : MOTS_EN_EZ.
 */
export const IMPERATIF_VOUS = /(?<![\p{L}’'-])(?:[\p{L}]+(?:ez|issez|ssez)|faites|dites|êtes)(?![\p{L}])/iu;
const MOTS_EN_EZ = new Set(['chez', 'assez', 'nez', 'rez', 'lez']);

/** Cherche un verbe à la 2e personne du pluriel dans un texte (hors MOTS_EN_EZ). */
export function verbePluriel(texte: string): string | null {
  for (const m of texte.matchAll(new RegExp(IMPERATIF_VOUS.source, 'giu'))) {
    if (!MOTS_EN_EZ.has(m[0].toLowerCase())) return m[0];
  }
  return null;
}

/** Textes dont le « vous » ne s'adresse pas au joueur : clé exacte → raison. */
const EXCEPTIONS: Readonly<Record<string, string>> = {
  'Vous êtes maintenant amis': 'pluriel : toi et l’autre joueur (sous « {name} a accepté ta demande »)',
  // « faites » participe passé, féminin pluriel : ce n'est pas un impératif.
  'Les sauvegardes déjà faites : elles contiennent ton compte': 'participe passé (« faites »)',
  'Les sauvegardes déjà faites contiennent encore ton compte': 'participe passé (« faites »)',
  'Couleurs du DMD faites pour une autre ROM': 'participe passé (« faites »)',
  '« {title} » ({url}), images faites par des joueurs : le fronton de chaque table qui n’en a pas, déposé à côté de son fichier .pxp, où {game} le cherche. Aucune image déjà là n’est remplacée.': 'participe passé (« faites »)',
};

test('le détecteur : reconnaît le vouvoiement, laisse « nous », « tu » et les mots qui contiennent « vous »', () => {
  for (const texte of ['Vous êtes ici', 'Ouvrez votre profil', 'Choisissez vos amis', 'Veuillez patienter', 'ni vous ni moi', 'Le vôtre', 'Les vôtres']) {
    assert.ok(VOUVOIEMENT.test(texte), `« ${texte} » est du vouvoiement`);
  }
  for (const texte of ['Tu es ici', 'Ouvre ton profil', 'Nous suivre', 'Tous tes amis', 'Dévoué']) {
    assert.ok(!VOUVOIEMENT.test(texte), `« ${texte} » n'en est pas`);
  }
});

test('le détecteur d’impératif : reconnaît « Choisissez », « faites », laisse « chez », « assez » et le tutoiement', () => {
  for (const texte of ['Choisissez une table', 'Vérifiez et réessayez', 'Ce que vous faites', 'Dites-le', 'Vous êtes prêts']) {
    assert.ok(verbePluriel(texte), `« ${texte} » vouvoie`);
  }
  for (const texte of ['Choisis une table', 'Chez toi', 'Assez de bruit', 'Tu fais', 'Prêtes à jouer']) {
    assert.equal(verbePluriel(texte), null, `« ${texte} » ne vouvoie pas`);
  }
});

test('aucun texte français de l’interface (écrans, téléphone, catalogue) ne vouvoie le joueur', () => {
  const fautes: string[] = [];
  for (const file of interfaceSources(REPO_ROOT)) {
    for (const use of scanFile(REPO_ROOT, file).keys) {
      if ((VOUVOIEMENT.test(use.key) || verbePluriel(use.key)) && !(use.key in EXCEPTIONS)) fautes.push(`${use.file}:${use.line} : ${use.key}`);
    }
  }
  assert.deepEqual(fautes, [], `texte au vouvoiement (tutoie le joueur, ou déclare l'exception dans tutoiement.test.ts) :\n${fautes.slice(0, 40).join('\n')}`);
});

test('le catalogue anglais ne garde aucune clé française au vouvoiement', () => {
  const fautes: string[] = [];
  for (const [part, catalog] of Object.entries(EN_PARTS)) {
    for (const key of Object.keys(catalog)) if ((VOUVOIEMENT.test(key) || verbePluriel(key)) && !(key in EXCEPTIONS)) fautes.push(`${part} : ${key}`);
  }
  assert.deepEqual(fautes, [], `clé au vouvoiement dans le catalogue :\n${fautes.slice(0, 40).join('\n')}`);
});

test('chaque exception déclarée est encore utilisée', () => {
  const used = new Set<string>();
  for (const file of interfaceSources(REPO_ROOT)) for (const use of scanFile(REPO_ROOT, file).keys) used.add(use.key);
  for (const key of Object.keys(EXCEPTIONS)) assert.ok(used.has(key), `exception périmée : ${key}`);
});
