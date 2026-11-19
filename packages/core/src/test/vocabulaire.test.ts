import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EN_MESSAGES } from '../i18n/en';
import { MANUAL, MANUEL, splitDocs } from './manuels';

const REPO = path.join(__dirname, '..', '..', '..', '..');

// Vocabulaire de l'interface : Cyber Pinball se dit « le front-end » (ou « l'OS »), jamais « le menu ».
// Le joueur ne comprend pas « revenir au menu » quand il n'y a pas de menu à l'écran (16/11/2026).
// « menu » reste pour un vrai menu, qui porte ce nom ou qu'on ouvre : la liste ci-dessous.
const VRAIS_MENUS = [
  /[Mm]enu système/g, // écran nommé « Menu système »
  /[Mm]enu de VPX/g,
  /menu Démarrer/g, // Windows
  /menu de service/g, // menu de la ROM, porte ouverte
  /menu du navigateur/g, // téléphone
  /menu ⋮/g,
  /(?:leur|son) menu \(Quitter\)/g, // un autre front-end, fermé par son propre menu
  /\{menu\}/g, // paramètre
  /ce menu/g, // l'écran de choix où l'on se trouve
  /\bses menus\b/g, /Chargement des menus/g, /^Menus$/g, // téléphone : onglet et liste des écrans de réglages
  /Menu du casque/g, // bouton Menu des manettes du casque
  /menu complet/g, /menu fermé/g, /Retour et menu/g, // menu système, menu en partie
  /[Mm]enu en (?:jeu|partie)/g,
];

test('vocabulaire : aucun texte de l’interface ne dit « menu » pour le front-end', () => {
  const fautifs = Object.keys(EN_MESSAGES).filter((source) => {
    let reste = source;
    for (const re of VRAIS_MENUS) reste = reste.replace(re, '');
    return /\bmenus?\b/i.test(reste);
  });
  assert.deepEqual(fautifs, [], `Dire « front-end » (l'interface), « l'OS » (Cyber Pinball en entier) ou « l'écran des tables » (la roue) :\n${fautifs.join('\n')}`);
});

// « Repli » est un mot de développeur : personne ne comprend « Repli intégré » (17/11/2026).
// Ce que Cyber Pinball dessine sans média : « Affichage par défaut ». Ce qui est montré à la place
// du fichier du jeu : « À la place : … ». Le fichier commun de <racine>\media : « média commun de la borne ».
// Le mot reste permis dans les commentaires et les noms de code, que le joueur ne voit pas.
const MOTS_DE_DEVELOPPEUR = /\breplis?\b|défauts? de la borne/i;
// Anglais : « fallback key » (touche de secours) et le paramètre {fallback} restent.
const FALLBACK_EN = /\bfallbacks?\b(?! keys?\b)(?!\})|cabinet(?:['’]s)? defaults?/i;

test('vocabulaire : aucun texte de l’interface ne dit « repli » (ni « fallback » en anglais)', () => {
  const fautifs = Object.entries(EN_MESSAGES)
    .filter(([source, en]) => MOTS_DE_DEVELOPPEUR.test(source) || FALLBACK_EN.test(en))
    .map(([source, en]) => `${source}  →  ${en}`);
  assert.deepEqual(fautifs, [], `Dire « affichage par défaut », « À la place : … » ou « média commun de la borne » :\n${fautifs.join('\n')}`);
});

/** Manuels, README, pages des fonctions et nouveautés en attente : ce que le public lit. */
const pagesPubliees = () => [
  ...splitDocs(MANUEL),
  ...splitDocs(MANUAL),
  ...['README.md', 'README.fr.md', 'docs/fonctionnalites.md', 'docs/features.md'].map((file) => ({ file, text: fs.readFileSync(path.join(REPO, file), 'utf8') })),
  ...fs.readdirSync(path.join(REPO, 'changements')).filter((f) => f.endsWith('.md')).map((f) => ({ file: `changements/${f}`, text: fs.readFileSync(path.join(REPO, 'changements', f), 'utf8') })),
];

// « Médecin des tables » (« table doctor ») déroutait, en français comme en anglais : un joueur
// anglophone s'est demandé pourquoi la page de téléchargement parlait tant d'un « doctor »
// (19/11/2026). L'écran s'appelle « Diagnostic » (« Diagnosis »), ouvert par « Diagnostiquer et
// réparer » (« Diagnose and fix ») : on dit « le diagnostic » (« the diagnosis »). Le mot reste
// dans le code (doctor.ts), les commentaires et l'avertissement sur l'épilepsie (un vrai médecin).
const MEDECIN = /médecins?|\bdoctors?\b/i;
const VRAI_MEDECIN = /avis d[’']un médecin|ask a doctor/;

test('vocabulaire : aucun texte de l’interface ne parle du « médecin » (« doctor ») d’une table', () => {
  const fautifs = Object.entries(EN_MESSAGES)
    .filter(([source, en]) => !VRAI_MEDECIN.test(source) && (MEDECIN.test(source) || MEDECIN.test(en)))
    .map(([source, en]) => `${source}  →  ${en}`);
  assert.deepEqual(fautifs, [], `Dire « le diagnostic » (« the diagnosis ») :\n${fautifs.join('\n')}`);
});

test('vocabulaire : manuels et pages publiées disent « diagnostic », plus « médecin » ni « doctor »', () => {
  const fautifs = pagesPubliees().flatMap(({ file, text }) =>
    text.split(/\r?\n/).flatMap((ligne, i) => {
      let reste = ligne
        .replace(/`[^`]*`/g, '') // code : doctor.ts, CyberPinball.doctor.ignored
        .replace(/\]\([^)]*\)|src="[^"]*"/g, '') // cibles des liens et images
        .replace(/[\w-]*doctor[\w-]*\.\w+/g, '') // noms de fichiers
        .replace(/"Dr\." for "Doctor"|« Dr\. » pour « Doctor »/g, ''); // abréviation d'un titre de jeu
      // Une nouveauté peut citer l'ancien nom entre guillemets pour dire qu'il a changé.
      if (file.startsWith('changements/')) reste = reste.replace(/«[^»]*»|"[^"]*"/g, '');
      return !VRAI_MEDECIN.test(ligne) && MEDECIN.test(reste) ? [`${file}:${i + 1} : ${reste.match(MEDECIN)![0]}`] : [];
    }),
  );
  assert.deepEqual(fautifs, [], `Dire « le diagnostic » (« the diagnosis ») :\n${fautifs.join('\n')}`);
});

test('vocabulaire : manuels et pages publiées ne citent plus « repli intégré » ni l’état « Repli : … »', () => {
  const docs = pagesPubliees();
  const ancien = /replis? intégrés?|built-in fallbacks?|« Repli : |"Repli : |"Fallback: |\bdéfauts? de la borne\b|\bcabinet(?:['’]s)? defaults?\b/i;
  const fautifs = docs.flatMap(({ file, text }) =>
    text.split(/\r?\n/).flatMap((ligne, i) => (ancien.test(ligne) ? [`${file}:${i + 1} : ${ligne.match(ancien)![0]}`] : [])),
  );
  assert.deepEqual(fautifs, [], `Ancien vocabulaire des médias :\n${fautifs.join('\n')}`);
});
